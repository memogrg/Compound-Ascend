/**
 * Manejo centralizado de errores.
 *
 * - `AppError`: error de dominio con código, status HTTP y mensaje seguro para
 *   el usuario (en español). Nunca expone detalles internos.
 * - `toSafeResponse`: convierte cualquier error en una respuesta JSON segura,
 *   registrando el detalle solo en el servidor.
 */
import { logger } from "@/lib/logger";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "CONFLICT"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  CONFLICT: 409,
  INTERNAL: 500,
};

/** Mensajes amigables por defecto, en español. */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Necesitas iniciar sesión para continuar.",
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  NOT_FOUND: "No encontramos lo que buscabas.",
  VALIDATION: "Revisa los datos ingresados.",
  RATE_LIMITED: "Demasiadas solicitudes. Inténtalo de nuevo en un momento.",
  PROVIDER_ERROR: "Un servicio externo no respondió. Inténtalo más tarde.",
  CONFLICT: "Esta operación entra en conflicto con datos existentes.",
  INTERNAL: "Algo salió mal de nuestro lado. Ya estamos al tanto.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Mensaje seguro para mostrar al usuario. */
  readonly userMessage: string;
  /** Detalle interno para logs (no se envía al cliente). */
  readonly detail?: unknown;

  constructor(code: ErrorCode, userMessage?: string, detail?: unknown) {
    super(userMessage ?? DEFAULT_MESSAGE[code]);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.userMessage = userMessage ?? DEFAULT_MESSAGE[code];
    this.detail = detail;
  }
}

export type SafeErrorBody = {
  error: { code: ErrorCode; message: string };
};

/**
 * Convierte cualquier error en una respuesta JSON segura.
 * Registra el detalle internamente; nunca filtra stack traces al cliente.
 */
export function toSafeResponse(err: unknown): {
  status: number;
  body: SafeErrorBody;
} {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error("AppError", { code: err.code, detail: err.detail });
    } else {
      logger.warn("AppError", { code: err.code });
    }
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.userMessage } },
    };
  }

  logger.error("UnhandledError", {
    message: err instanceof Error ? err.message : String(err),
  });
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: DEFAULT_MESSAGE.INTERNAL } },
  };
}
