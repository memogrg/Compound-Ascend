/**
 * Capa de ingesta de movimientos desacoplada de la fuente: WhatsApp, correo,
 * estado de cuenta, recibo (OCR) o agregador producen todos el MISMO shape
 * (RawMovement) que luego aterriza en el pipeline de transacciones. Puro: solo
 * tipos, sin IO ni "server-only".
 */

export type IngestionSourceKind =
  | "whatsapp_notification"
  | "email_notification"
  | "statement_import"
  | "receipt_ocr"
  | "aggregator";

/** Movimiento crudo normalizado por una fuente, antes de aterrizar como transacción. */
export interface RawMovement {
  kind: "gasto" | "ingreso";
  amount: number; // > 0
  currency: string; // ISO (CRC, USD)
  occurredOn: string; // YYYY-MM-DD
  merchant: string | null;
  description: string;
  sourceKind: IngestionSourceKind;
  bankCode: string | null; // "BNCR","BCR","BAC",… null si desconocido
  confidence: number; // 0-1; <0.6 = revisar
  externalRef: string | null; // id/hash del origen para deduplicar
  cardLast4?: string | null; // últimos 4 de la tarjeta (etiqueta dentro de la cuenta)
  rawText: string | null; // texto crudo para auditoría/depuración
}

/** Una fuente de ingesta produce RawMovement[] a partir de su input propio. */
export interface IngestionSource<TInput> {
  readonly kind: IngestionSourceKind;
  parse(input: TInput): RawMovement[];
}
