"use server";

import { revalidatePath } from "next/cache";
import { investmentInputSchema, policyInputSchema, holdingInputSchema, dividendInputSchema } from "@/modules/wealth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createInvestment,
  createPolicy,
  updateInvestment,
  updatePolicy,
  deleteInvestment,
  deletePolicy,
} from "@/modules/wealth/services/wealth-service";
import {
  createHolding,
  updateHolding,
  deleteHolding,
} from "@/modules/wealth/services/holdings-service";
import {
  createDividend,
  deleteDividend,
} from "@/modules/wealth/services/dividend-service";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; message?: string };

function fieldErrors(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export async function addInvestmentAction(raw: unknown): Promise<ActionResult> {
  const parsed = investmentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createInvestment(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("addInvestment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la inversión." };
  }
}

export async function addPolicyAction(raw: unknown): Promise<ActionResult> {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createPolicy(parsed.data);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch (err) {
    logger.error("addPolicy fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la póliza." };
  }
}

export async function editInvestmentAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = investmentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateInvestment(id, parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("editInvestment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la inversión." };
  }
}

export async function editPolicyAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updatePolicy(id, parsed.data);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch (err) {
    logger.error("editPolicy fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la póliza." };
  }
}

export async function removeInvestmentAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteInvestment(id);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removePolicyAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deletePolicy(id);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Holdings ─────────────────────────────────────────────────────

export async function addHoldingAction(raw: unknown): Promise<ActionResult> {
  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createHolding(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("addHolding fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la posición." };
  }
}

export async function editHoldingAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateHolding(id, parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("editHolding fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la posición." };
  }
}

export async function removeHoldingAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteHolding(id);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Dividendos ────────────────────────────────────────────────────

export async function addDividendAction(raw: unknown): Promise<ActionResult> {
  const parsed = dividendInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createDividend(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("addDividend fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar el dividendo." };
  }
}

export async function removeDividendAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteDividend(id);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** País de residencia del usuario (para guía de DCA). */
export async function getUserCountryAction(): Promise<string | null> {
  const user = await getUser();
  if (!user) return null;
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("personal_profiles")
      .select("country")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.country ?? null;
  } catch {
    return null;
  }
}
