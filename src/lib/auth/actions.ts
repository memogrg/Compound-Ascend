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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  signInSchema,
  signUpSchema,
  requestResetSchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";
import { logger } from "@/lib/logger";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function zodToFieldErrors(issues: { path: (string | number)[]; message: string }[]) {
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

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logger.warn("signIn fallido", { code: error.code });
    return { ok: false, message: "Correo o contraseña incorrectos." };
  }

  redirect("/dashboard");
}

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback?next=/bienvenida`,
      data: { display_name: parsed.data.displayName },
    },
  });
  if (error) {
    logger.warn("signUp fallido", { code: error.code });
    // Mensaje genérico para no revelar si el correo ya existe.
    return {
      ok: true,
      message:
        "Si el correo es válido, te enviamos un enlace de confirmación. Revisa tu bandeja.",
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("updatePassword fallido", { code: error.code });
    return { ok: false, message: "No pudimos actualizar la contraseña. El enlace pudo expirar." };
  }

  redirect("/dashboard");
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

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
