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

export default function Page() {
  return <AssistantTab />;
}
