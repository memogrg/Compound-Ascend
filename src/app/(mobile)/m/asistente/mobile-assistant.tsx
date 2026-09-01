"use client";

import Link from "next/link";

import { AssistantConversation } from "@/components/ai/assistant-conversation";

/**
 * Asistente IA en móvil (/m/asistente): chat + escáner de recibos, con la piel de
 * mobile.css. La conversación es <AssistantConversation> — EL MISMO componente que usan
 * el panel flotante y el tab de página completa de la web — con la piel "mobile": así las
 * tres superficies comparten lógica, hilo (chat_messages) y tarjetas de confirmación, y
 * solo cambian las clases CSS.
 *
 * Aquí queda únicamente el chrome propio del móvil: el header con "Atrás".
 * Voz es-MX ("tú"), a diferencia del voseo de la web.
 *
 * Las acciones propuestas por la IA NUNCA se auto-ejecutan: se muestran en una tarjeta
 * de confirmación (Confirmar / Cancelar), igual que en la web.
 */

const GREETING =
  "¡Hola! Soy tu asistente de CARTERA+. Pregúntame sobre tus finanzas, o escanea un recibo con la cámara y lo registro por ti (siempre con tu confirmación).";

export function MobileAssistant({
  primaryCurrency,
  timezone,
  initialDraft,
}: {
  primaryCurrency: string;
  /** Zona del perfil; null = todavía sin capturar → se usa la del dispositivo. */
  timezone: string | null;
  /** Pregunta ya redactada que llega por `?consulta=` (calculadora de préstamos). */
  initialDraft?: string;
}) {
  return (
    <div className="m-chat">
      <header className="m-chat-head">
        <Link href="/m" className="icon-btn" aria-label="Volver">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div className="m-chat-title">Asistente IA</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Chat + escáner de recibos
          </div>
        </div>
      </header>

      {/* La moneda y la zona de captura van por prop: esta ruta vive fuera del grupo (app),
          que es donde se montan CurrencyProvider y TimezoneProvider. */}
      <AssistantConversation
        variant="mobile"
        greeting={GREETING}
        captureCurrency={primaryCurrency}
        timezone={timezone}
        scanner
        initialDraft={initialDraft}
      />
    </div>
  );
}
