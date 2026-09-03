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
  empezarSchema,
  requestResetSchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { rateLimit, RATE_LIMITS, clientIpFromHeaders } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/** Mensaje genérico cuando se excede el rate limit (no revela detalles). */
const TOO_MANY = "Demasiados intentos. Espera un momento e inténtalo de nuevo.";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /**
   * Lo que la persona había escrito, para volver a mostrarlo tras un error.
   * React 19 reinicia el <form> cuando termina la acción, así que sin esto un
   * error en la contraseña borraba también el correo y el plan elegido.
   */
  values?: Record<string, string>;
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

export async function signInWithGoogleAction(formData?: FormData): Promise<void> {
  // `next` viaja en un campo oculto del <form>: así el botón de Google de /empezar
  // vuelve a /empezar/pagar con el plan, y no al panel. Solo rutas internas.
  const next = safeRelative(formData?.get("next") ?? null, "/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    logger.error("OAuth Google fallido", { code: error?.code });
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

/**
 * Alta desde /empezar. Es el paso 1 de 3 del camino de compra: crea la cuenta,
 * abre la sesión y manda a pagar. Cuenta ANTES del pago, como recomienda Stripe
 * («Create the customer… Save the object's ID to use in the Checkout Session»),
 * para que si el pago se cae la persona no quede en el limbo: su cuenta existe y
 * al volver retoma con un botón.
 *
 * Sin confirmación de correo por enlace. La cuenta nace confirmada y el pago la
 * verifica de hecho: Stripe muestra el correo bloqueado en el checkout y le manda
 * el recibo. Es lo que hacen YNAB, Notion, Linear y Copilot; y en producción el
 * paso de confirmar por correo tardaba 48 horas en promedio — era donde la gente
 * se quedaba.
 *
 * Si el correo ya tiene cuenta, se intenta iniciar sesión con la contraseña dada:
 * quien abandonó en Stripe y vuelve por la landing cae acá con sus mismas
 * credenciales, y tiene que poder seguir sin que le digamos «ese correo ya
 * existe». Si la contraseña no coincide, sí se le dice.
 */
export async function empezarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = empezarSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    plan: formData.get("plan"),
  });
  // Nunca la contraseña: `values` vuelve al navegador dentro del estado.
  const values = {
    email: String(formData.get("email") ?? ""),
    plan: String(formData.get("plan") ?? ""),
  };
  if (!parsed.success) {
    return { ok: false, fieldErrors: zodToFieldErrors(parsed.error.issues), values };
  }
  const { email, password, plan } = parsed.data;

  const ip = clientIpFromHeaders(await headers());
  const rl = await rateLimit(`signup:ip:${ip}`, RATE_LIMITS.auth);
  if (!rl.ok) return { ok: false, message: TOO_MANY, values };

  const supabase = await createSupabaseServerClient();
  const admin = createServiceRoleClient();
  const { error: errCrear } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (errCrear) {
    const yaExiste = /already|exist|registered/i.test(errCrear.message);
    if (!yaExiste) {
      logger.warn("empezar: createUser falló", { code: errCrear.code });
      return {
        ok: false,
        message: "No pudimos crear tu cuenta. Intentá de nuevo en un momento.",
        values,
      };
    }
    const { error: errEntrar } = await supabase.auth.signInWithPassword({ email, password });
    if (errEntrar) {
      return {
        ok: false,
        fieldErrors: {
          email: "Ese correo ya tiene cuenta. Iniciá sesión con tu contraseña o recuperala.",
        },
        values,
      };
    }
  } else {
    const { error: errEntrar } = await supabase.auth.signInWithPassword({ email, password });
    if (errEntrar) {
      logger.error("empezar: cuenta creada pero no se pudo abrir sesión", { code: errEntrar.code });
      return {
        ok: false,
        message: "Tu cuenta quedó creada. Iniciá sesión para continuar al pago.",
        values,
      };
    }
  }

  redirect(`/empezar/pagar?plan=${plan}`);
}

/**
 * «Reanudar pago» de /empezar. Es una acción del servidor y no un <form
 * method="get"> hacia /empezar/pagar A PROPÓSITO: la CSP lleva `form-action
 * 'self'`, y Chrome la aplica también a la REDIRECCIÓN de un envío de
 * formulario — el 307 de /empezar/pagar hacia checkout.stripe.com quedaba
 * bloqueado en silencio y la persona se quedaba mirando la misma pantalla.
 * Con una acción, la redirección la ejecuta el router de Next, no el envío.
 */
export async function reanudarPagoAction(formData: FormData): Promise<void> {
  const plan = String(formData.get("plan") ?? "pro");
  const seguro = ["esencial", "pro", "max"].includes(plan) ? plan : "pro";
  redirect(`/empezar/pagar?plan=${seguro}`);
}

export async function signOutAction(next?: string | FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // `next` llega como string cuando se hace bind/llamada directa (móvil → "/m/login"); como
  // FormData cuando es la acción de un <form> web → cae al fallback. safeRelative solo admite
  // rutas internas (evita open-redirects a URLs absolutas/externas).
  //
  // El fallback web es la LANDING, no /login. Cerrar sesión te dejaba en una pantalla de
  // login sin ningún enlace de vuelta —ni el logotipo era un link—, y como / expulsaba a
  // quien tuviera sesión, la página principal quedaba inalcanzable. La landing es la puerta
  // con las dos acciones: volver a entrar, o registrarse. Es también el default de Rails y
  // Laravel; YNAB manda al login, pero su login sí tiene por dónde salir.
  redirect(safeRelative(typeof next === "string" ? next : null, "/"));
}
