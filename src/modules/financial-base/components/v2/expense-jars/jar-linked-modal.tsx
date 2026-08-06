"use client";

/**
 * Modal de un frasco vinculado (Libertad/Deudas/Defensa/Ahorro): despliega las
 * entidades reales del módulo origen (inversiones, deudas, pólizas, metas). Si
 * no hay, muestra el texto vacío exacto. CTA deep-link que abre el pop-up de
 * creación del módulo origen (?new=<kind>, lo atrapa useDeepLinkModal allá).
 * Ahorro suma los fondos fijos (Emergencia/Paz) siempre disponibles.
 */
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/format";
import type { Jar, JarItem } from "@/modules/financial-base/engine/expense-jars";

/**
 * Acción por sobre de ahorro, INYECTADA desde la página, indexada por id de la meta.
 *
 * Dos restricciones se cruzan acá y explican la forma. (1) El botón vive en `control` y no se
 * puede importar desde `financial-base`: la dependencia va control → financial-base y nunca al
 * revés (CLAUDE.md). (2) Es un MAPA de elementos ya construidos y no una función `(goal) =>
 * ReactNode`, porque `JarRow` es un client component y React no deja pasarle funciones desde un
 * server component ("Functions cannot be passed directly to Client Components"). Un elemento sí
 * viaja en la carga RSC; una función no.
 */
export type JarGoalActions = Record<string, ReactNode>;

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

/** Etiquetas del modo budget-aware por tipo de vínculo (Deudas vs Ahorro). */
const BUDGET_LABELS: Record<
  string,
  {
    header: string;
    done: string;
    unit: string;
    cta: string;
    tip: string;
    /** Checklist mensual: qué decir cuando el mes no tiene movimiento y cuando ya está cubierto. */
    sinMovimiento?: string;
    cubierto?: string;
  }
> = {
  debt: {
    header: "Obligaciones de este mes",
    done: "pagado",
    unit: "cuota",
    cta: "Agregar o editar deuda",
    // Ya no dice "solo lectura": la cuota se paga desde acá mismo, con el botón de la fila.
    tip: "Pagá la cuota desde la fila; el pago cuenta como gasto del mes y baja el saldo.",
    sinMovimiento: "Sin pago este mes",
    cubierto: "Cuota pagada",
  },
  goal: {
    header: "Aportes de este mes",
    done: "aportado",
    unit: "aporte",
    cta: "Agregar o editar objetivo",
    tip: "Aportá desde la fila; el aporte cuenta como gasto del mes y sube el acumulado.",
    sinMovimiento: "Sin aporte este mes",
    cubierto: "Aporte del mes cubierto",
  },
  // Inversiones: aportar a un holding es un APORTE, no un pago de cuota. Sin esta entrada
  // caía al fallback de deuda ("pagado/cuota"), incoherente con la fila (que dice "aportado").
  holding: {
    header: "Aportes de este mes",
    done: "aportado",
    unit: "aporte",
    cta: "Agregar o editar inversión",
    tip: "Solo lectura. Registra el aporte desde «Registrar gasto»; se reflejará aquí.",
  },
  // Pólizas: la prima SÍ se paga, pero la unidad es la prima, no una "cuota" de deuda.
  policy: {
    header: "Primas de este mes",
    done: "pagado",
    unit: "prima",
    cta: "Agregar o editar póliza",
    tip: "Solo lectura. Registra el pago desde «Registrar gasto»; se reflejará aquí.",
  },
};

export function JarLinkedModal({
  jar,
  currency,
  onClose,
  goalActions,
}: {
  jar: Extract<Jar, { kind: "linked" }>;
  currency: string;
  onClose: () => void;
  /** Solo Ahorro: botón de aporte por sobre, inyectado por la página. */
  goalActions?: JarGoalActions;
}) {
  const hasItems = jar.items.length > 0;
  // El aporte solo aplica a metas; en Deudas/Pólizas/Inversiones la fila sigue de solo lectura.
  // Metas y deudas: los dos frascos tienen compromiso mensual y se saldan desde la fila.
  // Pólizas e inversiones siguen de solo lectura.
  const accionesMeta =
    jar.linkedKind === "goal" || jar.linkedKind === "debt" ? goalActions : undefined;
  const fixed = jar.fixedFunds ?? [];
  const L = BUDGET_LABELS[jar.linkedKind] ?? BUDGET_LABELS.debt!;

  return (
    <Modal
      title={jar.name}
      sub={KIND_TITLE[jar.linkedKind] ?? "Elementos vinculados"}
      onClose={onClose}
    >
      <div className="modal-body">
        {jar.budgetAware ? (
          /* Budget-aware (Deudas/Ahorro): fondos fijos informativos + cada
             entidad con mini-barra (cuota|aporte / pagado|aportado / restante).
             Solo lectura — el pago/aporte se registra desde "Registrar gasto". */
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Fondos fijos (Ahorro): informativos, SIN barra. */}
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

            {hasItems ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>
                    {L.header}
                  </span>
                  <span
                    className="tip"
                    data-tip={L.tip}
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
                {jar.sections && jar.sections.length > 0
                  ? jar.sections.map((sec) => (
                      <Fragment key={sec.key}>
                        <div
                          className="muted"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            marginTop: 10,
                          }}
                        >
                          {sec.name}
                        </div>
                        {sec.items.map((it) => (
                          <BudgetItemRow
                            key={it.id}
                            it={it}
                            currency={currency}
                            jarColor={jar.color}
                            labels={L}
                            goalActions={accionesMeta}
                          />
                        ))}
                      </Fragment>
                    ))
                  : jar.items.map((it) => (
                      <BudgetItemRow
                        key={it.id}
                        it={it}
                        currency={currency}
                        jarColor={jar.color}
                        labels={L}
                        goalActions={accionesMeta}
                      />
                    ))}
              </>
            ) : fixed.length === 0 ? (
              <div
                className="muted"
                style={{ padding: "18px 0", textAlign: "center", fontSize: 13 }}
              >
                {jar.emptyText}
              </div>
            ) : null}
          </div>
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
          <Icon name="plus" width={2} /> {jar.budgetAware ? L.cta : jar.cta.label}
        </Link>
      </div>
    </Modal>
  );
}

/** Fila budget-aware de una obligación (cuota|aporte / pagado|aportado / restante). */
function BudgetItemRow({
  it,
  currency,
  jarColor,
  labels,
  goalActions,
}: {
  it: JarItem;
  currency: string;
  jarColor: string;
  labels: { done: string; unit: string; sinMovimiento?: string; cubierto?: string };
  goalActions?: JarGoalActions;
}) {
  const budget = it.budget ?? 0;
  const spent = it.spent ?? 0;
  const remaining = it.remaining ?? budget - spent;
  const advanced = it.advanced ?? false;
  const over = budget > 0 && spent > budget;
  const color = over ? "var(--neg)" : jarColor;
  const extra = it.extraordinary ?? 0;
  // Pendiente = este mes todavía no tiene NINGÚN aporte. Se marca con un borde de aviso a la
  // izquierda: en una lista de ocho sobres, el que falta se pierde entre barras a medio llenar.
  const accion = goalActions?.[it.id];
  const sinAporte = !!accion && !advanced && spent <= 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 0 10px",
        borderBottom: "1px solid var(--line)",
        ...(sinAporte
          ? { borderLeft: "3px solid var(--warn)", paddingLeft: 8, marginLeft: -8 }
          : null),
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
          {advanced ? (
            <span
              className="chip"
              style={{
                fontSize: 10,
                background: "var(--info-soft, var(--chip))",
                color: "var(--info)",
              }}
            >
              Adelantado
            </span>
          ) : (
            <>
              <div className="tnum" style={{ fontSize: 13, fontWeight: 600 }}>
                {formatMoney(budget, currency)}
              </div>
              <div className="muted" style={{ fontSize: 10.5 }}>
                {labels.unit}
              </div>
            </>
          )}
        </div>
      </div>
      {advanced ? (
        // Aporte del mes ya pagado por adelantado: sin barra ni brecha (no se cobra este mes).
        <div className="muted" style={{ fontSize: 11.5 }}>
          Ya pagado por adelantado · no se cobra este mes.
        </div>
      ) : (
        <>
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
              {formatMoney(spent, currency)} {labels.done}
            </span>
            <span>
              {over
                ? `excedido ${formatMoney(Math.abs(remaining), currency)}`
                : `${formatMoney(remaining, currency)} restante`}
            </span>
          </div>
        </>
      )}
      {!advanced && extra > 0 ? (
        <span
          className="chip"
          style={{
            alignSelf: "flex-start",
            fontSize: 10,
            background: "var(--warn-soft)",
            color: "var(--warn)",
          }}
        >
          incluye {formatMoney(extra, currency)} extraordinario
        </span>
      ) : null}
      {/* Aporte del mes + acción. La línea repite el avance en palabras porque la barra sola no
          distingue "todavía no aporté" de "aporté poco", y esa distinción es justo la que hace
          accionable el frasco. Los importes van en la moneda de VISUALIZACIÓN, como el resto de
          la fila; el modal de aporte carga los suyos en la moneda de la meta. */}
      {accion && !advanced ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 2,
          }}
        >
          <span style={{ fontSize: 11.5, color: sinAporte ? "var(--warn)" : "var(--muted)" }}>
            {sinAporte
              ? budget > 0
                ? `${labels.sinMovimiento ?? "Sin movimiento este mes"} · ${labels.unit} ${formatMoney(budget, currency)}`
                : (labels.sinMovimiento ?? "Sin movimiento este mes")
              : budget > 0 && spent >= budget
                ? // "Cuota pagada" dice de una lo que "₡X de ₡X" obliga a deducir comparando.
                  `${labels.cubierto ?? "Cubierto"}${spent > budget ? ` · ${formatMoney(spent - budget, currency)} extra` : ""}`
                : budget > 0
                  ? `${formatMoney(spent, currency)} de ${formatMoney(budget, currency)} este mes`
                  : `${formatMoney(spent, currency)} este mes`}
          </span>
          {accion}
        </div>
      ) : null}
    </div>
  );
}
