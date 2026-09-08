"use client";

/**
 * Una acción numerada. Muestra siempre lo mismo, en el mismo orden: qué hacer, por qué importa,
 * cuánto vale y cuánto cuesta hacerlo — y recién después los botones.
 *
 * El «¿Por qué esto primero?» es la única explicación que NO va en un tooltip: es contenido
 * colapsado a propósito, porque quien quiere entender el orden merece un párrafo, no una burbuja.
 * Bloqueada = borde punteado, candado y su razón, SIN botones: ofrecer un botón que no se puede
 * usar es peor que no ofrecerlo.
 */
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { Action, ActionKind } from "@/modules/actions/types";
import { ActionButtons } from "./action-buttons";

/** Tono por dominio: el mismo color que cada sección usa en el resto de la app. */
export const KIND_TONE: Record<ActionKind, { label: string; color: string }> = {
  deuda: { label: "Deuda", color: "var(--neg)" },
  orden: { label: "Orden", color: "var(--info)" },
  proteger: { label: "Protección", color: "var(--gold)" },
  crecer: { label: "Crecimiento", color: "var(--pos)" },
};

export function KindChip({ kind }: { kind: ActionKind }) {
  const t = KIND_TONE[kind];
  return (
    <span
      className="chip"
      style={{
        background: `color-mix(in srgb, ${t.color} 14%, transparent)`,
        color: t.color,
        fontWeight: 600,
      }}
    >
      {t.label}
    </span>
  );
}

export function ActionCard({ action, index }: { action: Action; index: number }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <article className={`card acc-card${action.locked ? " acc-card-lock" : ""}`}>
      <div className="acc-card-head">
        <span className="acc-num">{String(index).padStart(2, "0")}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <KindChip kind={action.kind} />
            <span className="muted" style={{ fontSize: 11.5 }}>
              {action.effort}
            </span>
          </div>
          <h3 className="card-title" style={{ fontSize: 15 }}>
            {action.title}
          </h3>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: "6px 0 0" }}>
            {action.why}
          </p>
        </div>
      </div>

      <div className="acc-impact">
        <span className="acc-impact-k">Impacto</span>
        <span className="acc-impact-v">{action.impact.label}</span>
      </div>

      {action.locked ? (
        <div className="acc-lock">
          <Icon name="lock" width={2} />
          <span>{action.lockReason}</span>
        </div>
      ) : (
        <div className="acc-actions">
          <ActionButtons action={action} />
          <Link className="btn btn-ghost" href={action.route}>
            Ir a hacerlo →
          </Link>
        </div>
      )}

      <button type="button" className="acc-why" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "▾" : "▸"} ¿Por qué esto primero?
      </button>
      {abierto ? <div className="acc-teach">{renderTeach(action.teach)}</div> : null}
    </article>
  );
}

/**
 * `teach` es markdown CORTO y de nuestra propia autoría (plantillas deterministas, nunca texto
 * de un modelo): alcanza con resolver **negritas**. Traer un parser para esto sería peso muerto.
 */
export function renderTeach(texto: string): React.ReactNode {
  return texto
    .split(/(\*\*[^*]+\*\*)/g)
    .map((trozo, i) =>
      trozo.startsWith("**") && trozo.endsWith("**") ? (
        <strong key={i}>{trozo.slice(2, -2)}</strong>
      ) : (
        <span key={i}>{trozo}</span>
      ),
    );
}
