import { NextResponse, type NextRequest } from "next/server";
import { verifyEmailConnection, sendEmail, emailProviderName } from "@/lib/email/send";

/**
 * Endpoint TEMPORAL de diagnóstico de correo, gateado por EMAIL_TEST_SECRET.
 * Verifica la conexión SMTP y envía un correo de prueba a `?to=`.
 * Se elimina (y se borra la env var) tras la verificación.
 */
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const secret = process.env.EMAIL_TEST_SECRET;
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!EMAIL_RE.test(to)) {
    return NextResponse.json({ error: "invalid to" }, { status: 400 });
  }

  const provider = emailProviderName();
  const verify = await verifyEmailConnection();
  let send: Awaited<ReturnType<typeof sendEmail>> | null = null;
  if (verify.ok) {
    send = await sendEmail({
      to,
      subject: "Prueba de correo · Compound Ascend",
      html: "<p>✅ El envío de correo de <strong>Compound Ascend</strong> funciona. Este es un correo de prueba.</p>",
    });
  }

  return NextResponse.json({ provider, verify, send });
}
