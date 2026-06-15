"use client";

/**
 * Modal de un frasco vinculado (Libertad/Deudas/Defensa/Ahorro): despliega las
 * entidades reales del módulo origen (inversiones, deudas, pólizas, metas). Si
 * no hay, muestra el texto vacío exacto. CTA deep-link que abre el pop-up de
 * creación del módulo origen (?new=<kind>, lo atrapa useDeepLinkModal allá).
 * Ahorro suma los fondos fijos (Emergencia/Paz) siempre disponibles.
 */
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";

const KIND_TITLE: Record<string, string> = {
  holding: "Inversiones del portafolio",
  debt: "Deudas mapeadas",
  policy: "Pólizas activas",
  goal: "Objetivos de ahorro",
};

function pct(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function JarLinkedModal({
  jar,
  currency,
  onClose,
}: {
  jar: Extract<Jar, { kind: "linked" }>;
  currency: string;
  onClose: () => void;
}) {
  const hasItems = jar.items.length > 0;
  const fixed = jar.fixedFunds ?? [];

  return (
    <Modal
      title={jar.name}
      sub={KIND_TITLE[jar.linkedKind] ?? "Elementos vinculados"}
      onClose={onClose}
    >
      <div className="modal-body">
        {jar.budgetAware ? (
          /* Deudas: obligaciones con mini-barra (cuota/pagado/restante). Solo
             lectura — el pago se registra desde "Registrar gasto". */
          hasItems ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>
                  Obligaciones de este mes
                </span>
                <span
                  className="tip"
                  data-tip="Solo lectura. Registra el pago desde «Registrar gasto»; se reflejará aquí."
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    border: "1px solid var(--line)",
                    color: "var(--muted)",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  ?
                </span>
              </div>
              {jar.items.map((it) => {
                const budget = it.budget ?? 0;
                const spent = it.spent ?? 0;
                const remaining = it.remaining ?? budget - spent;
                const over = budget > 0 && spent > budget;
                const color = over ? "var(--neg)" : jar.color;
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      padding: "10px 0",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.name}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {it.sub}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>
                          {formatMoney(budget, currency)}
                        </div>
                        <div className="muted" style={{ fontSize: 10.5 }}>
                          cuota
                        </div>
                      </div>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${pct(spent, budget)}%`, background: color }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11.5,
                        color: "var(--muted)",
                      }}
                    >
                      <span style={over ? { color: "var(--neg)" } : undefined}>
                        {formatMoney(spent, currency)} pagado
                      </span>
                      <span>
                        {over
                          ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                          : `${formatMoney(remaining, currency)} restante`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted" style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}>
              {jar.emptyText}
            </div>
          )
        ) : (
          <>
            {/* Fondos fijos (solo Ahorro) — siempre disponibles. */}
            {fixed.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: hasItems ? 12 : 0,
                }}
              >
                {fixed.map((f) => (
                  <div
                    key={f.name}
                    className="list-row"
                    style={{ gridTemplateColumns: "1fr auto" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {f.sub}
                      </div>
                    </div>
                    <span
                      className="chip"
                      style={{ fontSize: 10, background: "var(--chip)", color: "var(--muted)" }}
                    >
                      fijo
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Entidades reales o texto vacío exacto. */}
            {hasItems ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {jar.items.map((it) => (
                  <div key={it.id} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {it.name}
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {it.sub}
                      </div>
                    </div>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 500 }}>
                      {it.amount}
                    </span>
                  </div>
                ))}
              </div>
            ) : fixed.length === 0 ? (
              <div
                className="muted"
                style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}
              >
                {jar.emptyText}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
        <Link href={jar.cta.href} className="btn btn-primary" style={{ textDecoration: "none" }}>
          <Icon name="plus" width={2} />{" "}
          {jar.budgetAware ? "Agregar o editar deuda" : jar.cta.label}
        </Link>
      </div>
    </Modal>
  );
}
