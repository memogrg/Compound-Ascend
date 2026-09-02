/**
 * Capa de ingesta de movimientos desacoplada de la fuente: correo, notificación
 * de banco, estado de cuenta, recibo (OCR) o agregador producen todos el MISMO
 * shape (RawMovement) que luego aterriza en el pipeline de transacciones. Puro:
 * solo tipos, sin IO ni "server-only".
 */

export type IngestionSourceKind =
  "bank_notification" | "email_notification" | "statement_import" | "receipt_ocr" | "aggregator";

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

/**
 * Propuesta de transacción pendiente de confirmación (recibo escaneado, chat con
 * el asesor o propuesta de ingesta por banco). `proposalId`/`cardLabel` solo vienen
 * de la cola `ingest_proposals`. La confirma el usuario en la app (web/móvil); el
 * mapeo puro `RawMovement → PendingAction` vive en `normalize.ts`.
 */
export type PendingAction = {
  kind: "gasto" | "ingreso";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchant?: string | null;
  origin: "scanned" | "ai_assisted" | "manual" | "notification" | "imported";
  source: "receipt" | "chat" | "notification" | "email";
  proposalId?: string; // fila de ingest_proposals que originó la propuesta
  cardLabel?: string | null; // etiqueta de tarjeta resuelta (último-4 → nombre)
};
