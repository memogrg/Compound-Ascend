import type { Metadata } from "next";

import { AssistantTab } from "./assistant-tab";

/**
 * Asistente (/asistente) — la conversación con My Agent C+ a pantalla completa, dentro del
 * shell del dashboard. El panel flotante sigue existiendo en todas las pantallas; los dos
 * comparten componente (AssistantConversation) e hilo (chat_messages), así que no divergen.
 *
 * La protección de ruta la garantiza el middleware; la moneda de captura la aporta el
 * CurrencyProvider del shell.
 */
export const metadata: Metadata = { title: "Asistente · CARTERA+" };

/**
 * `?consulta=` deja el chat con una pregunta ya escrita en el campo, sin enviarla: es como llega
 * el escenario de la calculadora de préstamos. El usuario la lee, la edita y decide si la manda.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ consulta?: string }>;
}) {
  const { consulta } = await searchParams;
  return <AssistantTab initialDraft={consulta} />;
}
