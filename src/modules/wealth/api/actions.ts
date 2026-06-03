"use server";

import { revalidatePath } from "next/cache";
import { investmentInputSchema, policyInputSchema } from "@/modules/wealth/schemas";
import {
  createInvestment,
  createPolicy,
  updateInvestment,
  updatePolicy,
  deleteInvestment,
  deletePolicy,
} from "@/modules/wealth/services/wealth-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
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
