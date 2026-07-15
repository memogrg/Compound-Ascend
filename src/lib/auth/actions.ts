"use server";

/**
 * Server Actions de autenticación. Pensadas para useActionState:
 * (prevState, formData) => ActionState.
 *
 * Principios de seguridad:
 * - Errores genéricos en español; nunca se filtran detalles internos.
 * - El reset de contraseña NO revela si un correo existe.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  signInSchema,
  signUpSchema,
  requestResetSchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";
import { rateLimit, RATE_LIMITS, clientIpFromHeaders } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Mensaje genérico cuando se excede el rate limit (no revela detalles). */
const TOO_MANY = "Demasiados intentos. Espera un momento e inténtalo de nuevo.";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function zodToFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Solo permite redirecciones internas (mismo sitio); evita open-redirects. */
function safeRelative(next: FormDataEntryValue | null, fallback: string): string {
  const value = typeof next === "string" ? next : "";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  // Anti fuerza bruta: limita por IP (spray) y por correo (ataque dirigido).
  const ip = clientIpFromHeaders(await headers());
  const email = parsed.data.email.toLowerCase();
  const [ipRl, emailRl] = await Promise.all([
    rateLimit(`auth:ip:${ip}`, RATE_LIMITS.auth),
    rateLimit(`auth:email:${email}`, RATE_LIMITS.auth),
  ]);
  if (!ipRl.ok || !emailRl.ok) {
    return { ok: false, message: TOO_MANY };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logger.warn("signIn fallido", { code: error.code });
    return { ok: false, message: "Correo o contraseña incorrectos." };
  }

  redirect(safeRelative(formData.get("next"), "/dashboard"));
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  // Anti abuso: evita creación masiva de cuentas / bombardeo de correos por IP.
  const ip = clientIpFromHeaders(await headers());
  const signupRl = await rateLimit(`signup:ip:${ip}`, RATE_LIMITS.auth);
  if (!signupRl.ok) {
    return { ok: false, message: TOO_MANY };
  }

  // Tras confirmar el correo, vuelve a `next` (p. ej. aceptar invitación) o al
  // onboarding. El valor va anidado, así que se codifica para el callback.
  const next = safeRelative(formData.get("next"), "/bienvenida");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { display_name: parsed.data.displayName },
    },
  });
  if (error) {
    logger.warn("signUp fallido", { code: error.code });
    // Mensaje genérico para no revelar si el correo ya existe.
    return {
      ok: true,
      message: "Si el correo es válido, te enviamos un enlace de confirmación. Revisa tu bandeja.",
    };
  }

  return {
    ok: true,
    message: "Te enviamos un enlace de confirmación. Revisa tu correo para continuar.",
  };
}

export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  // Anti bombardeo de correos de reset: limita por IP y por correo. Si se
  // excede, se devuelve la MISMA respuesta genérica (no revela nada por volumen).
  const ip = clientIpFromHeaders(await headers());
  const email = parsed.data.email.toLowerCase();
  const [ipRl, emailRl] = await Promise.all([
    rateLimit(`reset:ip:${ip}`, RATE_LIMITS.passwordReset),
    rateLimit(`reset:email:${email}`, RATE_LIMITS.passwordReset),
  ]);
  if (!ipRl.ok || !emailRl.ok) {
    return {
      ok: true,
      message:
        "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
    };
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password/nueva`,
  });

  // Respuesta idéntica exista o no la cuenta.
  return {
    ok: true,
    message:
      "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
  };
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  // Limita reintentos del cambio de contraseña por IP.
  const ip = clientIpFromHeaders(await headers());
  const pwdRl = await rateLimit(`pwd-update:ip:${ip}`, RATE_LIMITS.auth);
  if (!pwdRl.ok) {
    return { ok: false, message: TOO_MANY };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("updatePassword fallido", { code: error.code });
    return { ok: false, message: "No pudimos actualizar la contraseña. El enlace pudo expirar." };
  }

  // `next` (interno) permite que el móvil regrese a /m/perfil en vez de saltar a la web.
  // Aditivo: sin `next` (flujo web de reset) sigue yendo a /dashboard.
  redirect(safeRelative(formData.get("next"), "/dashboard"));
}

export async function signInWithGoogleAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=/dashboard` },
  });
  if (error || !data.url) {
    logger.error("OAuth Google fallido", { code: error?.code });
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

export async function signOutAction(next?: string | FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // `next` llega como string cuando se hace bind/llamada directa (móvil → "/m/login"); como
  // FormData cuando es la acción de un <form> web → cae al fallback "/login". safeRelative solo
  // admite rutas internas (evita open-redirects a URLs absolutas/externas).
  redirect(safeRelative(typeof next === "string" ? next : null, "/login"));
}
