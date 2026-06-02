"use server";

import { revalidatePath } from "next/cache";
import { assetInputSchema, liabilityInputSchema } from "@/modules/rich-life/schemas";
import {
  createAsset,
  createLiability,
  deleteAsset,
  deleteLiability,
} from "@/modules/rich-life/services/rich-life-service";
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

export async function addAssetAction(raw: unknown): Promise<ActionResult> {
  const parsed = assetInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createAsset(parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("addAsset fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el activo." };
  }
}

export async function addLiabilityAction(raw: unknown): Promise<ActionResult> {
  const parsed = liabilityInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createLiability(parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("addLiability fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el pasivo." };
  }
}

export async function removeAssetAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteAsset(id);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removeLiabilityAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteLiability(id);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
