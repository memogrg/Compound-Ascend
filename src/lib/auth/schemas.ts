/** Validación Zod de los flujos de autenticación (mensajes en español). */
import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "El correo es obligatorio")
  .email("Ingresa un correo válido")
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña es demasiado larga");

/**
 * La casilla de aceptación. Un checkbox no marcado NO viaja en el FormData — llega
 * `null`, no `"off"` — así que el mensaje tiene que salir de un `literal` que falla
 * tanto con `null` como con cualquier otro valor. `z.boolean()` no sirve: FormData
 * entrega strings.
 */
export const aceptaTerminosSchema = z.literal("on", {
  message: "Necesitás aceptar los Términos y la Política de privacidad para crear tu cuenta.",
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().min(1, "Dinos cómo llamarte").max(80),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
    acepta_terminos: aceptaTerminosSchema,
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

/**
 * Alta desde la web (/empezar): SOLO correo y contraseña. Nombre y confirmación
 * se piden adentro, después de pagar. Baymard: cada campo antes del pago es
 * abandono; la confirmación de contraseña sobra si el campo se puede mostrar.
 */
export const empezarSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  plan: z.enum(["esencial", "pro", "max"], { message: "Elegí un plan" }),
  acepta_terminos: aceptaTerminosSchema,
});

export const requestResetSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
