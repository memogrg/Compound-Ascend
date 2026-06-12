import "server-only";

/**
 * Servicio del cron de recordatorios de pago de deudas. Usa SERVICE ROLE
 * (omite RLS) porque recorre las deudas de todos los usuarios; SOLO se invoca
 * desde la ruta protegida con CRON_SECRET. Decide qué deudas vencen pronto
 * (≤ umbral días) y no se han pagado este mes ni recordado hoy.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { computeDueStatus } from "@/modules/control/engine/due-dates";

export interface DueReminder {
  debtId: string;
  userId: string;
  email: string | null;
  name: string;
  bank: string | null;
  payment: number;
  currency: string;
  nextDue: string; // yyyy-mm-dd
}

/** Deudas con pago próximo a vencer sin recordatorio enviado hoy. */
export async function getDueReminders(today: Date = new Date()): Promise<DueReminder[]> {
  const supabase = createServiceRoleClient();
  const todayIso = today.toISOString().slice(0, 10);
  const monthStart = `${todayIso.slice(0, 7)}-01`;

  const { data: debts, error } = await supabase
    .from("debts")
    .select(
      "id,user_id,name,bank,currency,current_payment,min_payment,pay_day,start_date,is_current,last_reminded_on",
    )
    .neq("is_current", false);
  if (error) throw new Error(error.message);
  if (!debts || debts.length === 0) return [];

  // Pagos del mes en curso (para "pagado este mes"), una sola consulta.
  const { data: payments } = await supabase
    .from("debt_payments")
    .select("debt_id,occurred_on")
    .gte("occurred_on", monthStart);
  const paidDates = new Map<string, string[]>();
  for (const p of payments ?? []) {
    const arr = paidDates.get(p.debt_id) ?? [];
    arr.push(p.occurred_on);
    paidDates.set(p.debt_id, arr);
  }

  const candidates = debts.filter((d) => {
    if (d.last_reminded_on === todayIso) return false; // ya recordado hoy
    const status = computeDueStatus(
      { payDay: d.pay_day, startDate: d.start_date, paymentDates: paidDates.get(d.id) ?? [] },
      today,
    );
    return status.dueSoon && status.nextDue !== null;
  });
  if (candidates.length === 0) return [];

  // Resuelve el correo de cada usuario (admin API), cacheado por userId.
  const emailByUser = new Map<string, string | null>();
  for (const userId of new Set(candidates.map((d) => d.user_id))) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      emailByUser.set(userId, data.user?.email ?? null);
    } catch {
      emailByUser.set(userId, null);
    }
  }

  return candidates.map((d) => {
    const status = computeDueStatus(
      { payDay: d.pay_day, startDate: d.start_date, paymentDates: paidDates.get(d.id) ?? [] },
      today,
    );
    const payment =
      Number(d.current_payment ?? 0) > 0 ? Number(d.current_payment) : Number(d.min_payment ?? 0);
    return {
      debtId: d.id,
      userId: d.user_id,
      email: emailByUser.get(d.user_id) ?? null,
      name: d.name,
      bank: d.bank ?? null,
      payment,
      currency: d.currency,
      nextDue: status.nextDue!,
    };
  });
}

/** Marca la deuda como recordada hoy (idempotente; evita reenvíos). */
export async function markReminded(debtId: string, today: Date = new Date()): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("debts")
    .update({ last_reminded_on: today.toISOString().slice(0, 10) })
    .eq("id", debtId);
}
