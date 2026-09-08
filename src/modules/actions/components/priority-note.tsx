"use client";

/**
 * La nota de la prioridad: una frase que explica el orden que la persona está viendo.
 *
 * Lleva la marca del agente porque es la voz del asesor — pero no la escribe un modelo: es una
 * plantilla determinista sobre los datos del plan (ver buildNote en el motor). Si alguna vez
 * dejara de serlo, esta marca pasaría de ser una firma a ser una promesa que no se cumple.
 */
import { AgentMark } from "@/components/ui/agent-mark";

export function PriorityNote({ note }: { note: string }) {
  return (
    <div className="card acc-note">
      <span className="acc-note-mark">
        <AgentMark />
      </span>
      <p>{note}</p>
    </div>
  );
}
