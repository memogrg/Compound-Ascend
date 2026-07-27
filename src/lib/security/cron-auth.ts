/**
 * Autorización de crons: puro y testeable (sin leer env ni Request). Acepta el secreto por
 * el header `X-Cron-Secret` o `Authorization: Bearer <secret>` (el que agrega Vercel Cron y el
 * que usa el GitHub Action). Sin secreto configurado → NUNCA autoriza.
 */
export function cronAuthorized(
  headers: { authorization?: string | null; xCronSecret?: string | null },
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  if (headers.xCronSecret === secret) return true;
  return headers.authorization === `Bearer ${secret}`;
}
