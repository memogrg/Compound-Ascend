"use client";

import { AgentMark } from "@/components/ui/agent-mark";
import { AssistantConversation } from "@/components/ai/assistant-conversation";

/**
 * Tab de página completa del asistente (/asistente). Ocupa el área de contenido, como
 * Patrimonio o Gastos, y renderiza la MISMA <AssistantConversation> que el panel flotante
 * y el móvil — solo cambia el contenedor (.ac-page: cuerpo 15px, burbujas amplias, chips
 * e input grandes fijos abajo).
 *
 * El hilo es el mismo: las tres superficies leen la conversación de hoy de chat_messages,
 * así que pasar del panel a este tab no pierde nada.
 */

const GREETING =
  "Hola, soy **My Agent C+**. Preguntame sobre tu dinero: gastos, deudas, inversiones o si te conviene abonar o invertir. Si propongo registrar algo, te pediré confirmación.";

const CHIPS = [
  "¿Cómo está mi salud financiera?",
  "¿Dónde puedo recortar gastos?",
  "¿Me conviene abonar a la deuda o invertir?",
  "¿Cómo va mi portafolio?",
  "¿Voy bien para mi Rich Life?",
];

export function AssistantTab() {
  return (
    <div className="ac-page">
      <div className="ac-page-top">
        <span className="spark">
          <AgentMark />
        </span>
        <div>
          <div className="ac-page-title">My Agent C+</div>
          <div className="ac-page-sub">Tu asesor financiero</div>
        </div>
      </div>
      <AssistantConversation variant="page" greeting={GREETING} chips={CHIPS} scanner />
    </div>
  );
}
