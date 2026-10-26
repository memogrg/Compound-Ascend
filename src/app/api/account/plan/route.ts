/**
 * GET /api/account/plan — el plan actual de la cuenta con sesión: `{ plan }`.
 *
 * Lo consulta el paywall nativo después de una compra en la tienda: el plan no lo cambia el
 * cliente sino el webhook de RevenueCat, así que la app pregunta hasta que llega. Lee con la
 * sesión (RLS), sin service-role.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // getUser y no requireUser: requireUser redirige a /login, y a un fetch le serviría una
    // página HTML en vez de un 401.
    const user = await getUser();
    if (!user) throw new AppError("UNAUTHORIZED");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new AppError("INTERNAL", undefined, "no se pudo leer el plan");

    return NextResponse.json(
      { plan: data?.plan ?? "ninguno" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}
