import "server-only";

/**
 * Plantilla de demostración: siembra un escenario financiero realista en la
 * cuenta del usuario (respetando RLS) para que pueda editarlo en vez de empezar
 * en blanco. Idempotente: no duplica si ya hay datos.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { monthlyize, type Frequency } from "@/modules/financial-base/engine/monthlyize";

function futureISO(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoTemplate(): Promise<{ seeded: boolean }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const uid = user.id;
  const currency = await getPrimaryCurrency();

  // Guard: si ya hay ingresos, no volvemos a sembrar (evita duplicados).
  const { data: existing } = await supabase
    .from("income_sources")
    .select("id")
    .eq("user_id", uid)
    .limit(1);

  let seeded = false;
  if (!existing || existing.length === 0) {
    seeded = true;

    const income = (
      [
        ["Salario", "activo", "salario", 850_000, "mensual"],
        ["Alquiler apartamento", "pasivo", "alquileres", 250_000, "mensual"],
      ] as const
    ).map(([name, income_type, category, amount, frequency]) => ({
      user_id: uid,
      name,
      income_type,
      category,
      amount,
      currency,
      frequency,
      amount_monthly_base: monthlyize(amount, frequency as Frequency),
    }));

    const expenses = (
      [
        ["Vivienda", "esencial", 300_000, "mensual"],
        ["Alimentación", "esencial", 180_000, "mensual"],
        ["Tarjeta de crédito", "financiero", 140_000, "mensual"],
        ["Inversión mensual", "inversion", 120_000, "mensual"],
        ["Fondo de emergencia", "ahorro", 90_000, "mensual"],
        ["Seguro médico", "proteccion", 60_000, "mensual"],
        ["Suscripciones", "estilo_vida", 35_000, "mensual"],
        ["Marchamo", "esencial", 90_000, "anual"], // muestra la mensualización
      ] as const
    ).map(([name, nature, amount, frequency]) => ({
      user_id: uid,
      name,
      nature,
      amount,
      currency,
      frequency,
      amount_monthly_base: monthlyize(amount, frequency as Frequency),
    }));

    const goals = [
      {
        user_id: uid,
        name: "Fondo de emergencia",
        goal_type: "seguridad",
        target_amount: 3_000_000,
        current_amount: 900_000,
        monthly_contribution: 90_000,
        currency,
        target_date: futureISO(18),
        priority: "alta",
        status: "revisar",
      },
      {
        user_id: uid,
        name: "Viaje a Europa",
        target_amount: 2_400_000,
        current_amount: 300_000,
        monthly_contribution: 60_000,
        currency,
        target_date: futureISO(10),
        priority: "baja",
        status: "revisar",
      },
    ];

    const debts = [
      {
        user_id: uid,
        name: "Tarjeta de crédito",
        debt_type: "tarjeta",
        balance: 1_400_000,
        min_payment: 70_000,
        current_payment: 70_000,
        apr: 38,
        currency,
        is_current: true,
        delinquency: "no",
        stress: 7,
        classification: "critica",
      },
      {
        user_id: uid,
        name: "Préstamo personal",
        debt_type: "prestamo",
        balance: 2_200_000,
        min_payment: 95_000,
        current_payment: 95_000,
        apr: 18,
        currency,
        is_current: true,
        delinquency: "no",
        stress: 4,
        classification: "controlada",
      },
    ];

    const investments = [
      { user_id: uid, asset_type: "etf", name: "ETF S&P 500", symbol: "VOO", invested_amount: 4_200_000, contribution: 120_000, horizon: "5_10" },
      { user_id: uid, asset_type: "cripto", name: "Bitcoin", symbol: "BTC", invested_amount: 1_100_000, contribution: 30_000, horizon: "5_10" },
      { user_id: uid, asset_type: "inmueble", name: "Apartamento alquiler", invested_amount: 38_000_000, contribution: 0, horizon: "mas_10" },
    ];

    const policies = [
      { user_id: uid, policy_type: "vida", provider: "Aseguradora", coverage: 90_000_000, premium: 18_000, premium_frequency: "mensual", currency },
      { user_id: uid, policy_type: "medico", provider: "Aseguradora", coverage: 50_000_000, premium: 35_000, premium_frequency: "mensual", currency },
      { user_id: uid, policy_type: "vehiculo", provider: "Aseguradora", coverage: 12_000_000, premium: 22_000, premium_frequency: "mensual", currency },
    ];

    const assets = [
      { user_id: uid, name: "Fondo de emergencia", asset_class: "liquido", value: 900_000, currency, generates_income: false, liquidity: "alta" },
      { user_id: uid, name: "Vehículo", asset_class: "uso_personal", value: 9_000_000, currency, generates_income: false, liquidity: "media" },
    ];

    const liabilities = [
      { user_id: uid, name: "Hipoteca", liability_class: "patrimonial", balance: 22_000_000, currency },
    ];

    await Promise.all([
      supabase.from("income_sources").insert(income),
      supabase.from("expense_items").insert(expenses),
      supabase.from("savings_goals").insert(goals),
      supabase.from("debts").insert(debts),
      supabase.from("investments").insert(investments),
      supabase.from("insurance_policies").insert(policies),
      supabase.from("assets").insert(assets),
      supabase.from("liabilities").insert(liabilities),
    ]);

    // Perfil + riesgo (upsert por si existen).
    await supabase.from("personal_profiles").upsert(
      {
        user_id: uid,
        age: 34,
        country: "Costa Rica",
        financial_nucleus: "familia",
        dependents_count: 2,
        life_stage: "hacer_crecer",
        perceived_control: 7,
        satisfaction: 6,
        urgency: "media",
        main_concern: "no_invertir",
        extra: { demo: true },
      },
      { onConflict: "user_id" },
    );
    await supabase.from("risk_profiles").upsert(
      {
        user_id: uid,
        loss_reaction: "mantengo",
        preference: "equilibrio",
        horizon: "mas_5",
        has_invested: true,
        volatility_comfort: 6,
        risk_class: "moderado",
      },
      { onConflict: "user_id" },
    );
  }

  // Marca el onboarding como iniciado/completo.
  await supabase
    .from("profiles")
    .update({ onboarding_completed: true, profile_completion: 80 })
    .eq("id", uid);

  return { seeded };
}

/** Marca el onboarding como completado para el flujo "cargar manualmente". */
export async function markOnboardingStarted(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", user.id);
}
