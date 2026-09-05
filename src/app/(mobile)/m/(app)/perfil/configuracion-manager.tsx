"use client";

/**
 * Ajustes gestionables de /m/perfil ("Configuración"), mismo molde que la web /configuracion:
 * reutiliza EXACTAMENTE las Server Actions del módulo account (+ las de hogar
 * de personal-profile) sin duplicar lógica. Todo con el Form Kit móvil (BottomSheet / Toggle /
 * ConfirmDialog / TextField) + es-MX, tema claro.
 *  - Moneda principal → updateCurrencyAction
 *  - Notificaciones → updateNotificationPrefAction (optimista, revierte si falla)
 *  - Hogar (ver/invitar/revocar/quitar miembros, cupo por plan) → household actions
 *  - Correos del banco → dirección única (IngestAddressCard) + avisosAction
 *  - Borrar todos los datos → clearAllDataAction (confirmación de 2 pasos)
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { currencySymbol } from "@/lib/format";
import type { ThemeMode } from "@/components/layout/theme-provider";
import { useThemeMode } from "../../components/use-theme-mode";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  updateCurrencyAction,
  saveUserTimezone,
  updateNotificationPrefAction,
  clearAllDataAction,
} from "@/modules/account/api/actions";
import {
  inviteHouseholdMemberAction,
  revokeInvitationAction,
  removeHouseholdMemberAction,
} from "@/modules/personal-profile/api/actions";
import type { HouseholdMembersView } from "@/modules/personal-profile";
import { testEmailAction, type EmailTestResult } from "@/modules/account/api/actions";
import { updatePasswordAction } from "@/lib/auth/actions";
import { IngestAddressCard } from "@/modules/account/components/ingest-address-card";
import { IngestNotices } from "@/modules/account/components/ingest-notices";
import type { IngestNoticesView } from "@/modules/account/services/ingest-notices-service";
import type { NotificationChannel, NotificationPrefs } from "@/lib/notifications/preferences";

import {
  BottomSheet,
  ConfirmDialog,
  FormShell,
  TextField,
  useToast,
  type ActionResult,
} from "../../components/form-kit";
import { MSectionHeader, MContentCard, MDataRow, MChip } from "../../components/content-kit";
import { AppLockToggle } from "../../components/app-lock-toggle";
import { isNativeApp, checkBiometryAvailable, verifyIdentity } from "../../lib/app-lock";
import { DeleteAccountButton } from "@/modules/account/components/delete-account-button";
import { ExportDataButton } from "@/modules/account/components/export-data-button";

type SheetId = "currency" | "timezone" | "theme" | "household" | "password" | null;

/** Etiquetas del selector de apariencia. "Sistema" primero: es el valor por defecto y el
 *  que la mayoría deja puesto. */
const TEMA_LABEL: Record<ThemeMode, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};

const NOTIF_ROWS: {
  key: NotificationChannel;
  label: string;
  hint: string;
  disabled?: boolean;
  badge?: string;
}[] = [
  { key: "inApp", label: "En la app", hint: 'Avisos del día en "Qué noté".' },
  { key: "email", label: "Correo", hint: "Resumen semanal por correo." },
  {
    key: "push",
    label: "Notificaciones push",
    hint: "Avisos en tu dispositivo.",
    disabled: true,
    badge: "Próximamente",
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ConfiguracionManager({
  currency,
  timezone,
  notifications,
  ingestAddress,
  ingestNotices,
  household,
  emailConfigured,
}: {
  currency: string;
  timezone: string | null;
  notifications: NotificationPrefs;
  ingestAddress: string | null;
  ingestNotices: IngestNoticesView;
  household: HouseholdMembersView | null;
  emailConfigured: boolean;
}) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const [danger, setDanger] = useState<0 | 1 | 2>(0);

  return (
    <>
      {/* Preferencias — moneda principal. Fila del kit: el glifo no está en el set de MIcon,
          así que va como `leading` (MDataRow ya lo enmarca en su tile .m-dic). */}
      <MSectionHeader title="Preferencias" />
      <MContentCard style={{ marginBottom: 14 }}>
        <MDataRow
          leading={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              style={{ width: 19, height: 19 }}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
          }
          title="Moneda principal"
          subtitle={`${currency} · ${currencySymbol(currency)}`}
          chevron
          onClick={() => setSheet("currency")}
          ariaLabel="Cambiar moneda principal"
        />
        <MDataRow
          leading={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              style={{ width: 19, height: 19 }}
            >
              <circle cx="12" cy="12" r="9" />
              <path
                d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M3 12h18"
                strokeLinecap="round"
              />
            </svg>
          }
          title="Zona horaria"
          subtitle={timezone ?? "Detectada de tu dispositivo"}
          chevron
          onClick={() => setSheet("timezone")}
          ariaLabel="Cambiar zona horaria"
        />
        <MDataRow
          leading={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              style={{ width: 19, height: 19 }}
            >
              <circle cx="12" cy="12" r="4.2" />
              <path
                d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"
                strokeLinecap="round"
              />
            </svg>
          }
          title="Apariencia"
          subtitle={TEMA_LABEL[themeMode]}
          chevron
          onClick={() => setSheet("theme")}
          ariaLabel="Cambiar apariencia"
        />
      </MContentCard>

      {/* Notificaciones — los toggles conservan su marcado (.srow + hint que envuelve): el
          subtítulo de MDataRow es de una línea con elipsis y cortaría estas explicaciones. */}
      <MSectionHeader title="Notificaciones" />
      <MContentCard style={{ marginBottom: 14 }}>
        {NOTIF_ROWS.map((r) => (
          <NotifToggle key={r.key} row={r} initial={notifications[r.key]} />
        ))}
      </MContentCard>

      {/* Hogar — invitar/gestionar miembros (glifo del set: icon="household"). */}
      <MSectionHeader title="Hogar" />
      <MContentCard style={{ marginBottom: 14 }}>
        <MDataRow
          icon="household"
          title="Hogar"
          subtitle="Miembros, invitaciones y cupos del plan"
          chevron
          onClick={() => setSheet("household")}
          ariaLabel="Gestionar tu hogar"
        />
      </MContentCard>

      {/* Correos del banco (ingesta): la dirección única es la única forma. */}
      <MSectionHeader title="Correos del banco" />
      <MContentCard style={{ marginBottom: 14 }}>
        {ingestAddress ? (
          <>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" }}>
              Reenviá los avisos de tu banco a tu dirección de ingesta. Con eso basta: no hay que
              registrar nada más.
            </p>
            <IngestAddressCard address={ingestAddress} />
            <IngestNotices view={ingestNotices} />
          </>
        ) : (
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" }}>
            La lectura de correo todavía no está encendida en este entorno.
          </p>
        )}
      </MContentCard>

      {/* Seguridad — contraseña (fila del kit) + probar correo (.srow con botón y resultado) +
          candado biométrico (su propia tarjeta, solo en la app nativa). */}
      <MSectionHeader title="Seguridad" />
      <MContentCard style={{ marginBottom: 14 }}>
        <MDataRow
          leading={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 19, height: 19 }}
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          }
          title="Cambiar contraseña"
          subtitle="Actualiza tu contraseña"
          chevron
          onClick={() => setSheet("password")}
          ariaLabel="Cambiar contraseña"
        />
        <EmailTestRow />
      </MContentCard>
      <AppLockToggle />

      {/* Portabilidad — ARRIBA de la zona de peligro y fuera de ella: bajarse una
          copia de los propios datos no puede exigir pasar por el flujo de borrado. */}
      <MSectionHeader title="Tus datos" />
      <MContentCard style={{ marginBottom: 14 }}>
        <ExportDataButton variant="mobile" />
      </MContentCard>

      {/* Zona de peligro — separada y en tono de peligro; su ConfirmDialog de 2 pasos intacto. */}
      <MSectionHeader title="Zona de peligro" />
      <MContentCard style={{ marginBottom: 14, background: "var(--danger-soft)" }}>
        <p
          style={{
            fontSize: 12.5,
            lineHeight: 1.5,
            margin: "0 0 10px",
            color: "var(--text-muted)",
          }}
        >
          Borra todos tus datos financieros (ingresos, gastos, deudas, inversiones, patrimonio…). Tu
          cuenta y perfil se conservan. No se puede deshacer.
        </p>
        <button
          type="button"
          className="m-btn m-btn-block m-btn-danger"
          onClick={() => setDanger(1)}
        >
          Borrar todos mis datos
        </button>
      </MContentCard>

      {/* #82 · Borrar la CUENTA (distinto de "borrar datos"): re-auth por OTP +
          "BORRAR"; en nativo, además gate biométrico (#64). */}
      <MContentCard>
        <DeleteAccountButton
          variant="mobile"
          onBeforeDelete={async () => {
            if (!isNativeApp()) return true;
            const avail = await checkBiometryAvailable();
            if (!avail.available) return true; // sin biometría no bloquea (igual que #64)
            return (await verifyIdentity()).ok;
          }}
        />
      </MContentCard>

      {/* Hoja: moneda */}
      <BottomSheet
        open={sheet === "currency"}
        onClose={() => setSheet(null)}
        title="Moneda principal"
      >
        <CurrencySheet current={currency} onDone={() => setSheet(null)} />
      </BottomSheet>

      {/* Hoja: zona horaria */}
      <BottomSheet open={sheet === "timezone"} onClose={() => setSheet(null)} title="Zona horaria">
        <TimezoneSheet current={timezone} onDone={() => setSheet(null)} />
      </BottomSheet>

      {/* Hoja: apariencia */}
      <BottomSheet open={sheet === "theme"} onClose={() => setSheet(null)} title="Apariencia">
        {/* Mismo marcado que la hoja de moneda (.m-optlist/.m-opt): dos listas de
            opciones en la misma pantalla deben verse y tocarse igual. */}
        <div className="m-optlist">
          {(["system", "light", "dark"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`m-opt${themeMode === m ? " sel" : ""}`}
              onClick={() => {
                setThemeMode(m);
                setSheet(null);
              }}
            >
              <span className="m-opt-t">{TEMA_LABEL[m]}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>
          Con «Sistema», la app sigue el modo claro u oscuro de tu iPhone.
        </p>
      </BottomSheet>

      {/* Hoja: hogar */}
      <BottomSheet
        open={sheet === "household"}
        onClose={() => setSheet(null)}
        title="Miembros del hogar"
      >
        <HouseholdSheet household={household} emailConfigured={emailConfigured} />
      </BottomSheet>

      {/* Hoja: cambiar contraseña */}
      <BottomSheet
        open={sheet === "password"}
        onClose={() => setSheet(null)}
        title="Cambiar contraseña"
      >
        <PasswordSheet />
      </BottomSheet>

      {/* Borrar datos: paso 1 */}
      <ConfirmDialog
        open={danger === 1}
        title="¿Borrar todos tus datos?"
        message="Se eliminarán tus ingresos, gastos, deudas, inversiones, pólizas y patrimonio. Tu cuenta se conserva."
        confirmLabel="Sí, continuar"
        variant="danger"
        onConfirm={() => setDanger(2)}
        onCancel={() => setDanger(0)}
      />
      {/* Borrar datos: paso 2 (confirmación final) */}
      <ClearDataStep2 open={danger === 2} onClose={() => setDanger(0)} />
    </>
  );
}

/**
 * Cambiar contraseña — reutiliza updatePasswordAction (la misma que el reset web), adaptando
 * su firma (prevState, FormData) a la de FormShell (values → ActionResult). El campo `next`
 * hace que al éxito el redirect vuelva a /m/perfil en vez de saltar a la web. FormShell pinta
 * los fieldErrors del schema ("Las contraseñas no coinciden", reglas de contraseña) inline.
 */
function PasswordSheet() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const action = (v: { password: string; confirm: string }): Promise<ActionResult> => {
    const fd = new FormData();
    fd.set("password", v.password);
    fd.set("confirm", v.confirm);
    fd.set("next", "/m/perfil"); // interno: al terminar, regresa al perfil móvil
    // updatePasswordAction: (prevState, FormData) → ActionState (mismo shape que ActionResult).
    // Al éxito hace redirect(next) y navega; el toast lo cubre ese regreso a /m/perfil.
    return updatePasswordAction({ ok: false }, fd);
  };

  return (
    <FormShell
      action={action}
      values={{ password, confirm }}
      submitLabel="Actualizar contraseña"
      successMessage="Contraseña actualizada"
    >
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Elige una contraseña de al menos 8 caracteres. La usarás para entrar a tu cuenta.
      </div>
      <TextField
        name="password"
        label="Nueva contraseña"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
      />
      <TextField
        name="confirm"
        label="Confirmar contraseña"
        type="password"
        value={confirm}
        onChange={setConfirm}
        placeholder="Repite la contraseña"
        autoComplete="new-password"
      />
    </FormShell>
  );
}

/** Probar correo — replica email-tester.tsx: llama testEmailAction y muestra el resultado. */
function EmailTestRow() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EmailTestResult | null>(null);

  const run = () =>
    startTransition(async () => {
      setResult(await testEmailAction());
    });

  // Fragment (no <div> envolvente): así la .srow es hermana directa de la fila anterior en la
  // tarjeta y muestra su separador (con un wrapper sería :first-child y perdería la hairline).
  return (
    <>
      <div className="srow">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="st">Probar correo</div>
          <div className="ss">Enviamos un correo de prueba a tu cuenta.</div>
        </div>
        <button
          type="button"
          className="m-btn m-btn-secondary"
          style={{ flex: "none", minHeight: 38, padding: "0 14px", fontSize: 13 }}
          disabled={pending}
          onClick={run}
        >
          {pending ? "Probando…" : "Probar"}
        </button>
      </div>
      {result ? (
        <div
          className={result.ok ? "pos" : "neg"}
          role="status"
          style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 4 }}
        >
          {result.message}
          {result.provider ? ` (${result.provider})` : ""}
        </div>
      ) : null}
    </>
  );
}

/** Toggle de un canal de notificación (optimista; revierte si la action falla). */
function NotifToggle({
  row,
  initial,
}: {
  row: {
    key: NotificationChannel;
    label: string;
    hint: string;
    disabled?: boolean;
    badge?: string;
  };
  initial: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    const res = await updateNotificationPrefAction(row.key, next);
    setBusy(false);
    if (res.ok) {
      toast.show(next ? "Canal activado" : "Canal desactivado", "success");
      router.refresh();
    } else {
      setOn(!next); // revertir
      toast.show(res.message ?? "No se pudo guardar", "error");
    }
  };

  return (
    <div className="srow">
      <div style={{ flex: 1 }}>
        <div className="st">
          {row.label}
          {row.badge ? (
            <span className="badge neutral" style={{ marginLeft: 8, fontSize: 10.5 }}>
              {row.badge}
            </span>
          ) : null}
        </div>
        <div className="ss">{row.hint}</div>
      </div>
      <label className="sw" aria-label={`${row.label}: ${on ? "activado" : "desactivado"}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={row.disabled || busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="tr" />
      </label>
    </div>
  );
}

/** Lista de opciones de moneda; al elegir, llama updateCurrencyAction (como el <select> web). */
function CurrencySheet({ current, onDone }: { current: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (code: string) => {
    if (code === current) return onDone();
    setBusy(true);
    const res = await updateCurrencyAction(code);
    setBusy(false);
    if (res.ok) {
      toast.show("Moneda actualizada", "success");
      onDone();
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo cambiar la moneda", "error");
    }
  };

  return (
    <div className="m-optlist">
      {CURRENCIES.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`m-opt${c.value === current ? " sel" : ""}`}
          disabled={busy}
          onClick={() => pick(c.value)}
        >
          <span className="m-opt-t">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Lista de zonas IANA del navegador; si no está disponible, al menos la actual. */
function tzZones(current: string | null): string[] {
  try {
    const all = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
    // Intl.supportedValuesOf no soportado: se cae a la actual.
  }
  return current ? [current] : ["UTC"];
}

/**
 * Selector de zona horaria. Native `<select>`: con ~400 zonas, el picker del sistema
 * (con su búsqueda) es mejor UX que una lista de botones. Persiste con saveUserTimezone.
 */
function TimezoneSheet({ current, onDone }: { current: string | null; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (tz: string) => {
    if (!tz || tz === current) return onDone();
    setBusy(true);
    const res = await saveUserTimezone(tz);
    setBusy(false);
    if (res.ok) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      toast.show("Zona horaria actualizada", "success");
      onDone();
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo cambiar la zona horaria", "error");
    }
  };

  return (
    <div style={{ padding: "4px 4px 10px" }}>
      <select
        className="sel"
        defaultValue={current ?? ""}
        disabled={busy}
        onChange={(e) => pick(e.target.value)}
        aria-label="Zona horaria"
        style={{ width: "100%" }}
      >
        {current == null ? (
          <option value="" disabled>
            Detectada de tu dispositivo
          </option>
        ) : null}
        {tzZones(current).map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
    </div>
  );
}

const HH_ROLE_LABEL: Record<string, string> = {
  owner: "Titular",
  adult: "Adulto",
  member: "Miembro",
  viewer: "Solo lectura",
};

/**
 * Gestión de miembros del hogar (paridad con la web): lista con email/rol,
 * invitaciones pendientes (revocar), invitar con el cupo del plan y quitar
 * miembros (solo el titular, con confirmación). El límite se valida también en
 * el servidor; acá solo se refleja.
 */
function HouseholdSheet({
  household,
  emailConfigured,
}: {
  household: HouseholdMembersView | null;
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; email: string } | null>(
    null,
  );

  if (!household) {
    return (
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        No pudimos cargar los miembros del hogar. Intentá de nuevo más tarde.
      </div>
    );
  }

  const { members, pending: pend, quota, canManage, isOwner } = household;
  const noCupo = quota.remaining <= 0;

  const invite = () =>
    start(async () => {
      const e = email.trim().toLowerCase();
      if (!EMAIL_RE.test(e)) return setError("Ese correo no parece válido.");
      setError(null);
      const res = await inviteHouseholdMemberAction(e);
      if (res.ok) {
        toast.show("Invitación enviada");
        setEmail("");
        router.refresh();
      } else {
        setError(res.message ?? "No pudimos invitar.");
      }
    });

  const revoke = (id: string) =>
    start(async () => {
      const res = await revokeInvitationAction(id);
      toast.show(res.ok ? "Invitación revocada" : (res.message ?? "No pudimos revocar"));
      if (res.ok) router.refresh();
    });

  const remove = (userId: string) =>
    start(async () => {
      const res = await removeHouseholdMemberAction(userId);
      setConfirmRemove(null);
      toast.show(res.ok ? "Miembro removido del hogar" : (res.message ?? "No pudimos quitar"));
      if (res.ok) router.refresh();
    });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Miembros activos */}
      <div style={{ display: "grid", gap: 8 }}>
        {members.map((m) => (
          <div key={m.userId} className="row" style={{ gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {m.email}
                {m.isSelf ? (
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {" "}
                    (tú)
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <MChip>{HH_ROLE_LABEL[m.role] ?? m.role}</MChip>
                {m.isOwner ? <MChip tone="neutral">titular</MChip> : null}
              </div>
            </div>
            {isOwner && !m.isOwner && !m.isSelf ? (
              <button
                type="button"
                className="m-btn m-btn-quiet-danger"
                style={{ flex: "none", padding: "0 12px" }}
                disabled={pending}
                onClick={() => setConfirmRemove({ userId: m.userId, email: m.email })}
              >
                Quitar
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Invitaciones pendientes */}
      {canManage && pend.length > 0 ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Invitaciones pendientes
          </div>
          {pend.map((p) => (
            <div key={p.id} className="row" style={{ gap: 8, alignItems: "center" }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.email}
              </span>
              <MChip tone="warning">pendiente</MChip>
              <button
                type="button"
                className="m-btn m-btn-secondary"
                style={{ flex: "none", padding: "0 12px" }}
                disabled={pending}
                onClick={() => revoke(p.id)}
              >
                Revocar
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Sobre-límite: nadie se va, solo se bloquean invitaciones nuevas. */}
      {quota.overLimit ? (
        <div className="m-field-err" role="status" style={{ lineHeight: 1.5 }}>
          Tu hogar tiene {quota.usedActive} personas y tu plan incluye {quota.limit}. Nadie pierde
          acceso, pero no puedes invitar hasta subir de plan.
        </div>
      ) : null}

      {/* Invitar (solo editores) */}
      {canManage ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="m-inp"
              type="email"
              inputMode="email"
              value={email}
              placeholder="correo@ejemplo.com"
              disabled={noCupo || pending}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="m-btn m-btn-primary"
              style={{ flex: "none", padding: "0 16px" }}
              disabled={noCupo || pending || !email.trim()}
              onClick={invite}
            >
              {pending ? "…" : "Invitar"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Te {quota.remaining === 1 ? "queda" : "quedan"} {quota.remaining} de {quota.limit} cupos
            (incluye al titular).
          </div>
          {error ? (
            <div className="m-field-err" role="alert">
              {error}
            </div>
          ) : null}
          {!emailConfigured ? (
            <div className="m-field-err" role="status" style={{ lineHeight: 1.5 }}>
              El correo no está configurado: las invitaciones no se envían. Prueba el envío en
              «Correo (invitaciones)» de la web.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Solo un adulto o el titular del hogar puede invitar o quitar miembros.
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        title="¿Quitar del hogar?"
        message={
          confirmRemove
            ? `${confirmRemove.email} perderá acceso a los datos del hogar. Los registros que creó se reasignan al titular. Esta acción no envía aviso.`
            : ""
        }
        confirmLabel="Quitar del hogar"
        variant="danger"
        pending={pending}
        onConfirm={() => {
          if (confirmRemove) remove(confirmRemove.userId);
        }}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  );
}

/**
 * Paso 2 del borrado: confirmación final que ejecuta clearAllDataAction.
 *
 * Antes de borrar exige biometría, ADEMÁS de la confirmación de dos pasos (no en su lugar):
 * es la única acción de la app que destruye datos de forma irreversible, así que conviene
 * que un teléfono desbloqueado en manos ajenas no baste. Si el dispositivo no tiene
 * biometría disponible NO se bloquea la acción —dejar a alguien sin poder borrar sus propios
 * datos sería peor— y se cae al flujo de confirmación de siempre.
 */
function ClearDataStep2({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const doClear = async () => {
    setPending(true);

    if (isNativeApp()) {
      const avail = await checkBiometryAvailable();
      if (avail.available) {
        const id = await verifyIdentity();
        if (!id.ok) {
          setPending(false);
          toast.show("No pudimos verificarte. No se borró nada.", "error");
          return; // se aborta: fallo o cancelación NO borra
        }
      }
    }

    const res = await clearAllDataAction();
    setPending(false);
    if (res.ok) {
      toast.show("Todos tus datos fueron borrados", "success");
      onClose();
      router.refresh();
    } else {
      toast.show(res.message ?? "No pudimos borrar los datos.", "error");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Confirmación final"
      message="Esto es permanente. Se borrarán definitivamente todos tus datos financieros."
      confirmLabel="Borrar definitivamente"
      variant="danger"
      pending={pending}
      onConfirm={doClear}
      onCancel={onClose}
    />
  );
}
