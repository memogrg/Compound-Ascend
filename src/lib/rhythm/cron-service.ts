import "server-only";

/**
 * EL RITMO DEL MES — camino SIN SESIÓN (crons). Espeja `rhythm-service.ts` con cliente
 * service-role y `userId` explícito.
 *
 * Existe porque las lecturas de sesión (`requireUser`, RLS por cookie) no tienen dónde
 * agarrarse en un cron. Es el mismo patrón que ya usa `writeDailyInsightForUserCron`
 * (insights-service.ts) y `sendWeeklyDigestForUser` (weekly-email.ts).
 *
 * ⚠ El service-role OMITE RLS. Cada query de este archivo filtra por `userId` explícito,
 * sin excepción. Un `.eq("user_id", …)` que falte acá no da error: da los datos de otra
 * persona.
 *
 * ── LA ZONA HORARIA ES EL PUNTO ─────────────────────────────────────────────
 * Vercel corre los crons en UTC. Todo el sentido de estos avisos depende de la hora
 * LOCAL del usuario: "el día 1 del mes" y "las 19:00" no significan nada en UTC para
 * alguien en Costa Rica (UTC−6). Por eso cada usuario se resuelve contra SU zona
 * (`user_settings.timezone`, con UTC de piso) antes de decidir si le toca.
 *
 * De ahí sale la estrategia del recordatorio diario: el cron corre CADA HORA y le
 * dispara solo a quien tenga las 19:00 en ese momento. 24 pasadas baratas en vez de una
 * pasada que le acierta a una sola zona.
 *
 * Ese tick horario NO viene de Vercel (el plano de este proyecto rechaza crons sub-diarios)
 * sino de .github/workflows/rhythm-daily-reminder.yml, igual que price-alerts. Para el
 * endpoint es indistinto: ve la misma petición con el mismo CRON_SECRET.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getNotificationPrefs } from "@/lib/notifications/preferences";
import { logger } from "@/lib/logger";
import { hourInTz, isValidTimeZone, todayISOInTz } from "@/lib/time/user-time-core";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import {
  diaDe,
  enDiasDeCierre,
  estadoVentana,
  pendientesDeCierre,
  periodoDe,
  tocaRecordatorioDiario,
  RECORDATORIO_HORA,
} from "@/lib/rhythm/engine";
import { reclamarEnvio } from "@/lib/rhythm/notification-log";
import type { AuthContext } from "@/lib/auth/auth-context";

type Admin = ReturnType<typeof createServiceRoleClient>;

/** Usuario candidato con lo mínimo para decidir: su zona y su correo. */
export type CronUser = {
  userId: string;
  tz: string;
  email: string | null;
};

/**
 * Todos los usuarios con su zona y su correo, en DOS consultas y no en 2N.
 *
 * `auth.admin.listUsers` pagina de a 1000; se recorre entera. Con un `getUserById` por
 * usuario esto serían N llamadas a la API de auth en un cron que corre cada hora.
 */
export async function listCronUsers(admin: Admin): Promise<CronUser[]> {
  const { data: settings } = await admin.from("user_settings").select("user_id, timezone");
  const tzByUser = new Map<string, string>();
  for (const s of settings ?? []) {
    if (isValidTimeZone(s.timezone)) tzByUser.set(s.user_id, s.timezone);
  }

  const out: CronUser[] = [];
  let page = 1;
  // Tope de seguridad: 50 páginas = 50.000 usuarios. Un cron no debe poder quedarse
  // dando vueltas para siempre si la paginación se comporta raro.
  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      out.push({
        userId: u.id,
        // "UTC" de piso, igual que `resolveUserTz`: sin zona capturada el usuario no
        // queda excluido de los avisos, solo los recibe en horario UTC hasta que la app
        // capture su zona sola.
        tz: tzByUser.get(u.id) ?? "UTC",
        email: u.email ?? null,
      });
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

/** Resultado uniforme de los tres crons. */
export type CronOutcome = { candidates: number; sent: number; skipped: number };

/**
 * Recorre usuarios y envía, best-effort. Un usuario que falla no puede dejar sin aviso a
 * los demás — es el mismo criterio de `runForUsersBestEffort`.
 *
 * `enviar` devuelve true si mandó algo. El orden es siempre el mismo: filtrar por datos →
 * reclamar el candado → enviar. Reclamar ANTES de enviar (ver notification-log.ts).
 */
async function recorrer(
  users: CronUser[],
  enviar: (u: CronUser, admin: Admin) => Promise<boolean>,
  admin: Admin,
): Promise<CronOutcome> {
  let sent = 0;
  let skipped = 0;
  for (const u of users) {
    try {
      if (await enviar(u, admin)) sent += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn("cron de ritmo: usuario falló", {
        userId: u.userId,
        message: err instanceof Error ? err.message : "?",
      });
    }
  }
  return { candidates: users.length, sent, skipped };
}

/**
 * ¿Se le puede escribir por correo? Tres condiciones, en orden de costo.
 *
 * `prefs.push` se consulta aunque hoy NO exista emisor de push: el canal está declarado
 * en NOTIFICATION_CHANNELS y el día que se implemente no habrá que volver a repartir
 * chequeos por los crons. Hoy es intencionalmente un no-op documentado, no un olvido.
 */
async function puedeEnviarEmail(u: CronUser, admin: Admin): Promise<boolean> {
  if (!u.email) return false;
  const ctx: AuthContext = { db: admin, userId: u.userId };
  const prefs = await getNotificationPrefs(u.userId, ctx);
  return prefs.email;
}

/** household_id activo, para etiquetar la fila de notification_log. */
async function householdOf(admin: Admin, userId: string): Promise<string | null> {
  const { getActiveHouseholdId } = await import("@/lib/household/active");
  return getActiveHouseholdId(admin, userId);
}

// ── Envoltorio de correo ────────────────────────────────────────────────────

/**
 * Correo del ritmo: mismo marco visual para los tres, con enlace de baja funcional.
 *
 * Si falta `UNSUBSCRIBE_SECRET` o la URL base NO se manda — misma salvaguarda que
 * `weekly-email.ts`. Un correo automático sin baja que funcione es spam, por buena que
 * sea la intención.
 */
async function enviarCorreoRitmo(args: {
  userId: string;
  to: string;
  subject: string;
  titulo: string;
  cuerpo: string;
  ctaLabel: string;
  ctaPath: string;
}): Promise<boolean> {
  const { getServerEnv } = await import("@/lib/env");
  const { sendEmail, isEmailConfigured } = await import("@/lib/email/send");
  const { signUnsubscribeToken } = await import("@/lib/notifications/unsubscribe-token");
  const { escapeHtml } = await import("@/lib/security/escape-html");

  if (!isEmailConfigured()) return false;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = getServerEnv().UNSUBSCRIBE_SECRET;
  if (!baseUrl || !secret) return false;

  const token = signUnsubscribeToken(args.userId, "email", secret);
  const unsubUrl = `${baseUrl}/api/notifications/unsubscribe?token=${token}`;
  const ctaUrl = `${baseUrl}${args.ctaPath}`;

  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px">` +
    `<h2 style="font-size:18px;margin:0 0 10px;color:#111827">${escapeHtml(args.titulo)}</h2>` +
    `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 18px">${escapeHtml(args.cuerpo)}</p>` +
    `<p style="margin:0 0 20px"><a href="${ctaUrl}" ` +
    `style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1f2937;` +
    `color:#fff;text-decoration:none;font-size:14px">${escapeHtml(args.ctaLabel)}</a></p>` +
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px" />` +
    `<p style="font-size:12px;color:#9ca3af">Recibís este correo porque tenés activos los ` +
    `recordatorios del mes. <a href="${unsubUrl}" style="color:#6b7280">Darme de baja</a>.</p>` +
    `</div>`;

  const res = await sendEmail({ to: args.to, subject: args.subject, html });
  return res.ok;
}

// ── 1. Ventana de configuración (días 1-5) ──────────────────────────────────

/** Cron diario: "Ajustá tus sobres de {mes}" mientras la ventana esté abierta. */
export async function runVentanaCron(): Promise<CronOutcome> {
  const admin = createServiceRoleClient();
  const users = await listCronUsers(admin);

  return recorrer(
    users,
    async (u) => {
      const hoy = todayISOInTz(u.tz);
      const { year, month } = periodoDe(hoy);
      const period = monthPeriod(year, month);

      // ¿La ventana sigue abierta para su hogar?
      const householdId = await householdOf(admin, u.userId);
      let q = admin
        .from("budget_month_config")
        .select("closed_at")
        .eq("period_year", year)
        .eq("period_month", month);
      q = householdId
        ? q.eq("household_id", householdId)
        : q.eq("user_id", u.userId).is("household_id", null);
      const { data: config } = await q.maybeSingle();

      const ventana = estadoVentana({ dia: diaDe(hoy), closedAt: config?.closed_at ?? null });
      if (!ventana.abierta) return false;
      if (!(await puedeEnviarEmail(u, admin))) return false;

      // El candado ANTES del envío. 23505 → alguien ya reclamó hoy → no mandar.
      const ctx: AuthContext = { db: admin, userId: u.userId };
      const reclamado = await reclamarEnvio({
        kind: "ventana_presupuesto",
        channel: "email",
        sentOn: hoy,
        ctx,
      });
      if (!reclamado) return false;

      const { copyVentana } = await import("@/lib/rhythm/nudge-copy");
      const { nombreMes } = await import("@/lib/rhythm/engine");
      // Cuántos sobres ya tienen monto: cambia el tono del mensaje. Consulta de conteo,
      // no los totales convertidos — acá no hace falta la cifra, solo si hay o no.
      const { count } = await admin
        .from("budget_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.userId)
        .eq("type", "expense")
        .eq("period_year", period.year)
        .eq("period_month", period.month)
        .gt("amount", 0);

      const copy = copyVentana({
        voz: "vos",
        mes: nombreMes(month),
        diasRestantes: ventana.diasRestantes,
        sobresConPresupuesto: count ?? 0,
      });

      return enviarCorreoRitmo({
        userId: u.userId,
        to: u.email!,
        subject: copy.titulo,
        titulo: copy.titulo,
        cuerpo: copy.cuerpo,
        ctaLabel: copy.cta,
        ctaPath: "/gastos",
      });
    },
    admin,
  );
}

// ── 2. Cierre de mes (día 28 → último) ──────────────────────────────────────

/** Cron diario: "Cerrá {mes} con todo registrado", con lo que falta. */
export async function runCierreCron(): Promise<CronOutcome> {
  const admin = createServiceRoleClient();
  const users = await listCronUsers(admin);

  return recorrer(
    users,
    async (u) => {
      const hoy = todayISOInTz(u.tz);
      const { year, month } = periodoDe(hoy);
      if (!enDiasDeCierre({ dia: diaDe(hoy), year, month })) return false;
      if (!(await puedeEnviarEmail(u, admin))) return false;

      const conteos = await conteosCierreCron(admin, u.userId, monthPeriod(year, month));
      const pendientes = pendientesDeCierre(conteos);
      // Sin pendientes no se escribe. Un correo que dice "todo en orden" entrena a
      // ignorar los correos.
      if (pendientes.length === 0) return false;

      const ctx: AuthContext = { db: admin, userId: u.userId };
      const reclamado = await reclamarEnvio({
        kind: "cierre_mes",
        channel: "email",
        sentOn: hoy,
        ctx,
      });
      if (!reclamado) return false;

      const { copyCierre } = await import("@/lib/rhythm/nudge-copy");
      const { nombreMes } = await import("@/lib/rhythm/engine");
      const copy = copyCierre({
        voz: "vos",
        mes: nombreMes(month),
        pendientes: pendientes.map((p) => p.texto),
      });

      return enviarCorreoRitmo({
        userId: u.userId,
        to: u.email!,
        subject: copy.titulo,
        titulo: copy.titulo,
        cuerpo: copy.cuerpo,
        ctaLabel: copy.cta,
        ctaPath: "/transacciones",
      });
    },
    admin,
  );
}

/**
 * Los cuatro conteos del cierre, con service-role y `userId` explícito.
 *
 * Versión deliberadamente más simple que `getConteosCierre` de la sesión: consulta las
 * tablas crudas en vez de pasar por los servicios (que normalizan moneda, resuelven el
 * hogar y arman etiquetas). Para decidir "¿le escribo?" alcanza con contar, y esto corre
 * una vez por usuario en un cron diario.
 *
 * La contrapartida es real y hay que nombrarla: acá NO se incluyen las filas del resto
 * del hogar, solo las propias. El correo es personal —le llega a cada miembro— así que
 * cuenta lo suyo. La pantalla, que es del hogar, usa la otra versión.
 */
async function conteosCierreCron(
  admin: Admin,
  userId: string,
  period: { year: number; month: number; from: string; to: string },
): Promise<{
  metasSinAporte: number;
  deudasSinPago: number;
  sobresSinMovimiento: number;
  transaccionesSinSobre: number;
}> {
  const [{ data: txns }, { data: goals }, { data: debts }, { data: budget }] = await Promise.all([
    admin
      .from("transactions")
      .select("kind, category_id, linked_kind, linked_id")
      .eq("user_id", userId)
      .gte("occurred_on", period.from)
      .lte("occurred_on", period.to),
    admin
      .from("savings_goals")
      .select("id, monthly_contribution")
      .eq("user_id", userId)
      .gt("monthly_contribution", 0),
    admin
      .from("debts")
      .select("id, current_payment, balance")
      .eq("user_id", userId)
      .gt("current_payment", 0)
      .gt("balance", 0),
    admin
      .from("budget_items")
      .select("category_id, amount")
      .eq("user_id", userId)
      .eq("type", "expense")
      .eq("period_year", period.year)
      .eq("period_month", period.month)
      .gt("amount", 0),
  ]);

  const filas = txns ?? [];
  const conAporte = new Set(
    filas.filter((t) => t.linked_kind === "goal" && t.linked_id).map((t) => t.linked_id),
  );
  const conPago = new Set(
    filas.filter((t) => t.linked_kind === "debt" && t.linked_id).map((t) => t.linked_id),
  );
  const categoriasConGasto = new Set(
    filas.filter((t) => t.kind === "gasto" && t.category_id).map((t) => t.category_id),
  );

  return {
    metasSinAporte: (goals ?? []).filter((g) => !conAporte.has(g.id)).length,
    deudasSinPago: (debts ?? []).filter((d) => !conPago.has(d.id)).length,
    transaccionesSinSobre: filas.filter((t) => t.kind === "gasto" && !t.category_id).length,
    sobresSinMovimiento: (budget ?? []).filter(
      (b) => b.category_id && !categoriasConGasto.has(b.category_id),
    ).length,
  };
}

// ── 3. Recordatorio diario (19:00 en la zona de cada quien) ─────────────────

/**
 * Cron HORARIO: le escribe solo a quien tenga las 19:00 ahora mismo en su zona.
 *
 * Correr cada hora y filtrar por zona es lo que hace que "las 19:00" signifique las 19:00
 * de la persona y no las de Vercel. El costo de las 23 pasadas que no le tocan a nadie es
 * un par de consultas; la alternativa —un cron por zona horaria— no existe.
 */
export async function runRecordatorioDiarioCron(): Promise<CronOutcome> {
  const admin = createServiceRoleClient();
  const users = await listCronUsers(admin);

  return recorrer(
    users,
    async (u) => {
      const hora = hourInTz(u.tz);
      // Chequeo baratísimo primero: descarta ~23/24 de los usuarios sin tocar la base.
      if (hora !== RECORDATORIO_HORA) return false;

      const hoy = todayISOInTz(u.tz);
      const { count } = await admin
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.userId)
        .eq("occurred_on", hoy);

      const ctx: AuthContext = { db: admin, userId: u.userId };
      // La decisión vive en el engine puro (y está testeada ahí), no acá.
      if (
        !tocaRecordatorioDiario({
          horaLocal: hora,
          movimientosHoy: count ?? 0,
          yaNotificadoHoy: false, // el candado real es `reclamarEnvio`, abajo
        })
      ) {
        return false;
      }
      if (!(await puedeEnviarEmail(u, admin))) return false;

      const reclamado = await reclamarEnvio({
        kind: "registro_diario",
        channel: "email",
        sentOn: hoy,
        ctx,
      });
      if (!reclamado) return false;

      const { copyRegistroDiario } = await import("@/lib/rhythm/nudge-copy");
      const copy = copyRegistroDiario("vos");
      return enviarCorreoRitmo({
        userId: u.userId,
        to: u.email!,
        subject: copy.titulo,
        titulo: copy.titulo,
        cuerpo: copy.cuerpo,
        ctaLabel: copy.cta,
        ctaPath: "/transacciones",
      });
    },
    admin,
  );
}
