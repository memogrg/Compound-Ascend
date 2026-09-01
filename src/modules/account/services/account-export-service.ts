import "server-only";

/**
 * Export .xlsx de toda la data del hogar (#82 D3), generado con exceljs en el
 * server (service-role para leer de todos los autores del hogar). Se ofrece/
 * descarga ANTES del borrado. Una hoja por dominio; los movimientos llevan Autor.
 */
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveDeletionContext } from "./account-deletion-service";

/** Cliente service-role sin tipar la BD: lectura dinámica por `.from(<string>)`. */
function adminDb(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient;
}

type Scope = { column: "household_id" | "user_id"; value: string };

/** Ámbito del export: el hogar completo si pertenece a uno; si es solo, sus filas. */
async function exportScope(userId: string): Promise<Scope> {
  const ctx = await resolveDeletionContext(userId);
  return ctx.householdId
    ? { column: "household_id", value: ctx.householdId }
    : { column: "user_id", value: userId };
}

/** Mapa user_id → nombre para la columna Autor. */
async function authorNames(scope: Scope): Promise<Map<string, string>> {
  const db = adminDb();
  const map = new Map<string, string>();
  if (scope.column !== "household_id") return map;
  const { data: members } = await db
    .from("household_members")
    .select("user_id, role")
    .eq("household_id", scope.value);
  for (const m of members ?? []) {
    const { data: prof } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", m.user_id)
      .maybeSingle();
    map.set(m.user_id, prof?.display_name ?? m.role ?? m.user_id.slice(0, 8));
  }
  return map;
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string; width?: number }[],
  rows: Record<string, unknown>[],
): void {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
}

/** Genera el workbook completo y lo devuelve como Buffer (.xlsx). */
export async function exportHouseholdWorkbook(userId: string): Promise<Buffer> {
  const db = adminDb();
  const scope = await exportScope(userId);
  const names = await authorNames(scope);
  const author = (uid: string | null) => (uid ? (names.get(uid) ?? uid.slice(0, 8)) : "—");
  const wb = new ExcelJS.Workbook();
  wb.creator = "CARTERA+";
  wb.created = new Date();

  const fetch = async (table: string) => {
    const { data } = await db.from(table).select("*").eq(scope.column, scope.value);
    return data ?? [];
  };

  // Movimientos (con Autor)
  const txns = await fetch("transactions");
  addSheet(
    wb,
    "Movimientos",
    [
      { header: "Fecha", key: "occurred_on", width: 14 },
      { header: "Tipo", key: "kind", width: 12 },
      { header: "Descripción", key: "description", width: 30 },
      { header: "Monto", key: "amount", width: 14 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Autor", key: "author", width: 18 },
    ],
    txns.map((t) => ({
      occurred_on: t.occurred_on,
      kind: t.kind,
      description: t.description ?? "",
      amount: t.amount,
      currency: t.currency ?? "",
      author: author(t.user_id),
    })),
  );

  // Presupuesto / sobres
  const budget = await fetch("budget_items");
  addSheet(
    wb,
    "Presupuesto",
    [
      { header: "Nombre", key: "name", width: 28 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Presupuestado", key: "planned", width: 16 },
      { header: "Moneda", key: "currency", width: 10 },
    ],
    budget.map((b) => ({
      name: b.name ?? "",
      type: b.type ?? "",
      planned: b.planned_amount ?? b.amount ?? "",
      currency: b.currency ?? "",
    })),
  );

  // Deudas
  const debts = await fetch("debts");
  addSheet(
    wb,
    "Deudas",
    [
      { header: "Nombre", key: "name", width: 28 },
      { header: "Saldo", key: "balance", width: 16 },
      { header: "TAE %", key: "apr", width: 10 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Autor", key: "author", width: 18 },
    ],
    debts.map((d) => ({
      name: d.name ?? "",
      balance: d.balance ?? "",
      apr: d.apr ?? "",
      currency: d.currency ?? "",
      author: author(d.user_id),
    })),
  );

  // Inversiones
  const holdings = await fetch("investment_holdings");
  addSheet(
    wb,
    "Inversiones",
    [
      { header: "Símbolo/Etiqueta", key: "label", width: 26 },
      { header: "Tipo", key: "asset_type", width: 14 },
      { header: "Cantidad", key: "quantity", width: 14 },
      { header: "Costo base", key: "cost_basis", width: 16 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Autor", key: "author", width: 18 },
    ],
    holdings.map((h) => ({
      label: h.label ?? h.symbol ?? "",
      asset_type: h.asset_type ?? "",
      quantity: h.quantity ?? "",
      cost_basis: h.cost_basis ?? "",
      currency: h.currency ?? "",
      author: author(h.user_id),
    })),
  );

  // Metas
  const goals = await fetch("savings_goals");
  addSheet(
    wb,
    "Metas",
    [
      { header: "Nombre", key: "name", width: 28 },
      { header: "Objetivo", key: "target_amount", width: 16 },
      { header: "Actual", key: "current_amount", width: 16 },
      { header: "Moneda", key: "currency", width: 10 },
      { header: "Autor", key: "author", width: 18 },
    ],
    goals.map((g) => ({
      name: g.name ?? "",
      target_amount: g.target_amount ?? "",
      current_amount: g.current_amount ?? "",
      currency: g.currency ?? "",
      author: author(g.user_id),
    })),
  );

  // Seguros
  const policies = await fetch("insurance_policies");
  addSheet(
    wb,
    "Seguros",
    [
      { header: "Tipo", key: "policy_type", width: 20 },
      { header: "Proveedor", key: "provider", width: 20 },
      { header: "Cobertura", key: "coverage", width: 16 },
      { header: "Prima", key: "premium", width: 14 },
      { header: "Moneda", key: "currency", width: 10 },
    ],
    policies.map((p) => ({
      policy_type: p.policy_type ?? "",
      provider: p.provider ?? "",
      coverage: p.coverage ?? "",
      premium: p.premium ?? "",
      currency: p.currency ?? "",
    })),
  );

  // Perfil (del que borra)
  const { data: profile } = await db
    .from("personal_profiles")
    .select("age, country, marital_status, financial_nucleus, urgency, main_concern")
    .eq("user_id", userId)
    .maybeSingle();
  addSheet(
    wb,
    "Perfil",
    [
      { header: "Campo", key: "field", width: 24 },
      { header: "Valor", key: "value", width: 30 },
    ],
    Object.entries(profile ?? {}).map(([field, value]) => ({ field, value: String(value ?? "") })),
  );

  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}
