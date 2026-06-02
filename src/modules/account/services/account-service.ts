import "server-only";

/** Datos de cuenta: plan y consumo de IA del mes (lectura). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { aiTokenLimit, type Plan } from "@/lib/plan";

export type AccountInfo = {
  email: string | null;
  name: string | null;
  plan: Plan;
  tokensUsed: number;
  tokenLimit: number;
  configured: boolean;
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getAccountInfo(): Promise<AccountInfo> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? null;
  const email = user?.email ?? null;

  if (!isSupabaseConfigured() || !user) {
    return { email, name, plan: "free", tokensUsed: 0, tokenLimit: aiTokenLimit("free"), configured: false };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("plan,display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("ai_usage_ledger")
      .select("tokens_used")
      .eq("user_id", user.id)
      .eq("period", currentPeriod())
      .maybeSingle(),
  ]);
  const plan = (profile?.plan ?? "free") as Plan;
  return {
    email,
    name: profile?.display_name ?? name,
    plan,
    tokensUsed: Number(usage?.tokens_used ?? 0),
    tokenLimit: aiTokenLimit(plan),
    configured: true,
  };
}
