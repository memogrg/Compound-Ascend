import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { PatrimonioReport, Hito } from "@/modules/wealth/engine/patrimonio-engine";
import type { EssentialBreakdown } from "@/modules/wealth/engine/essential-expense";
import { EssentialExpenseSummary } from "@/modules/wealth/components/essential-summary";
import { DefineLifestyleButton } from "@/modules/wealth/components/define-lifestyle-button";

/**
 * Escalera de hitos patrimoniales: Seguridad → Independencia → Libertad. Métrica
 * héroe del Marco Patrimonial. TODO viene del motor (N2): los tres números, los
 * progresos, el hito alcanzado y el próximo. Este componente NO recalcula nada —
 * solo mapea el output del engine a estados visuales (alcanzado/en curso/pendiente)
 * y resalta el hito ACTUAL (el próximo a conseguir), que es lo más accionable.
 */

const RANK: Record<Hito, number> = { ninguno: 0, seguridad: 1, independencia: 2, libertad: 3 };
type RungKey = "seguridad" | "independencia" | "libertad";
type RungState = "alcanzado" | "en_curso" | "pendiente";

const TOOLTIP: Record<RungKey, string> = {
  seguridad: "Tu capital genera lo suficiente para cubrir tus gastos esenciales.",
  independencia: "Tu capital sostiene tu estilo de vida actual completo.",
  libertad: "Tu capital sostiene la vida que querés vivir.",
};

function Tip({ text }: { text: string }) {
  return (
    <span
      className="tip tip-wrap"
      data-tip={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 15,
        height: 15,
        marginLeft: 6,
        borderRadius: "50%",
        border: "1px solid var(--line)",
        color: "var(--muted)",
        fontSize: 10,
        fontWeight: 700,
        cursor: "help",
        verticalAlign: "middle",
      }}
    >
      ?
    </span>
  );
}

const STATE_META: Record<RungState, { label: string; color: string; bg: string }> = {
  alcanzado: {
    label: "Alcanzado",
    color: "var(--pos)",
    bg: "color-mix(in srgb, var(--pos) 12%, transparent)",
  },
  en_curso: {
    label: "Tu meta actual",
    color: "var(--gold, #c79a3a)",
    bg: "color-mix(in srgb, var(--gold, #c79a3a) 14%, transparent)",
  },
  pendiente: { label: "Pendiente", color: "var(--muted)", bg: "transparent" },
};

export function MilestoneLadder({
  report: r,
  essential,
  currency,
}: {
  report: PatrimonioReport;
  essential: EssentialBreakdown | null;
  currency: string;
}) {
  const stateOf = (key: RungKey): RungState => {
    if (RANK[key] <= RANK[r.hitoAlcanzado]) return "alcanzado";
    if (key === r.siguienteHito) return "en_curso";
    return "pendiente";
  };

  return (
    <div className="card card-pad">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div className="card-title">Tu escalera patrimonial</div>
          <div className="card-sub">
            Tres hitos hacia vivir de tu patrimonio. Cada número es el capital que, invertido al 8%,
            cubriría ese nivel de gasto para siempre.
          </div>
        </div>
        {/* Capital que trabaja: el numerador de los tres progresos (una sola vez). */}
        <div style={{ textAlign: "right", minWidth: 180 }}>
          <div className="label" style={{ justifyContent: "flex-end", display: "flex" }}>
            Capital que trabaja
            <Tip
              text={
                "Inversión + activos productivos + tu líquido invertible. " +
                (r.defenseFundsBalance > 0
                  ? `Excluimos tus fondos de defensa (${formatMoney(r.defenseFundsBalance, currency)}): son tu colchón de emergencia/paz, no capital que genera renta. Por eso tu progreso puede verse más bajo de lo esperado — es a propósito, no un error.`
                  : "Excluye los fondos de defensa (emergencia/paz): son colchón, no capital que genera renta.")
              }
            />
          </div>
          <div className="num-xl" style={{ fontSize: 30, marginTop: 4 }}>
            {formatMoney(r.investableWealth, currency)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        <Rung
          rungKey="seguridad"
          title="Seguridad"
          numero={r.numeroDeSeguridad}
          progreso={r.progresoSeguridad}
          state={stateOf("seguridad")}
          currency={currency}
          // Estado vacío: sin nada marcado esencial, el número de seguridad es 0 y no
          // significa nada. Invitamos a marcar gastos esenciales en vez de mostrar "$0".
          emptyWhen={r.numeroDeSeguridad <= 0}
          empty={
            <EmptyRow>
              Marca tus gastos <strong>esenciales</strong> para calcular tu número de seguridad: el
              capital que ya cubre lo indispensable.{" "}
              <Link href="/gastos" style={{ color: "var(--accent)", fontWeight: 600 }}>
                Ir a Gastos
              </Link>
            </EmptyRow>
          }
        />
        <Rung
          rungKey="independencia"
          title="Independencia"
          numero={r.numeroDeIndependencia}
          progreso={r.progresoIndependencia}
          state={stateOf("independencia")}
          currency={currency}
          emptyWhen={r.numeroDeIndependencia <= 0}
          empty={
            <EmptyRow>
              Registra tus gastos mensuales para ver cuánto capital sostendría tu vida actual
              completa.{" "}
              <Link href="/gastos" style={{ color: "var(--accent)", fontWeight: 600 }}>
                Ir a Gastos
              </Link>
            </EmptyRow>
          }
        />
        <Rung
          rungKey="libertad"
          title="Libertad"
          numero={r.numeroDeLibertad}
          progreso={r.progresoLibertad}
          state={stateOf("libertad")}
          currency={currency}
          // Estado vacío: sin estilo de vida deseado, no hay número (nunca se inventa).
          emptyWhen={r.numeroDeLibertad == null}
          empty={
            <EmptyRow>
              <span>
                Definí el gasto mensual de la vida que <strong>querés vivir</strong> y calculamos tu
                Número de Libertad.
              </span>
              <span style={{ marginTop: 8, display: "inline-block" }}>
                <DefineLifestyleButton variant="btn-secondary" />
              </span>
            </EmptyRow>
          }
        />
      </div>

      {/* Sensibilidad de tasa: accesible pero secundaria (no compite con el número). */}
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--muted)" }}>
          ¿Y si el retorno no fuera 8%?
        </summary>
        <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          Para sostener tu estilo de vida actual, el capital necesario cambia con el retorno que
          asumas. Usamos 8%; a modo de comparación:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
            {(["0.04", "0.06", "0.08", "0.10"] as const).map((k) => (
              <span
                key={k}
                style={{
                  fontWeight: k === "0.08" ? 700 : 400,
                  color: k === "0.08" ? "var(--ink-2)" : undefined,
                }}
              >
                {Math.round(Number(k) * 100)}%:{" "}
                <strong className="tnum">{formatMoney(r.sensibilidadTasa[k], currency)}</strong>
                {k === "0.08" ? " (actual)" : ""}
              </span>
            ))}
          </div>
        </div>
      </details>

      {/* Transparencia del número de seguridad: desglose por origen + exclusiones #2. */}
      {r.numeroDeSeguridad > 0 && essential ? (
        <div style={{ marginTop: 16 }}>
          <EssentialExpenseSummary data={essential} currency={currency} />
          <Link href="/gastos" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }}>
            Ajustar qué es esencial
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

function Rung({
  rungKey,
  title,
  numero,
  progreso,
  state,
  currency,
  emptyWhen,
  empty,
}: {
  rungKey: RungKey;
  title: string;
  numero: number | null;
  progreso: number;
  state: RungState;
  currency: string;
  emptyWhen: boolean;
  empty: React.ReactNode;
}) {
  const meta = STATE_META[state];
  const pct = Math.min(100, Math.round(progreso * 100));
  const highlighted = state === "en_curso";

  return (
    <div
      style={{
        border: `1px solid ${highlighted ? meta.color : "var(--line)"}`,
        borderRadius: 12,
        padding: "13px 15px",
        background: highlighted ? meta.bg : "transparent",
      }}
    >
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}
      >
        <div className="label" style={{ margin: 0 }}>
          {title}
          <Tip text={TOOLTIP[rungKey]} />
        </div>
        <span
          className="chip"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: meta.color,
            background: state === "pendiente" ? "transparent" : meta.bg,
            border: `1px solid ${state === "pendiente" ? "var(--line)" : meta.color}`,
          }}
        >
          {meta.label}
        </span>
      </div>

      {emptyWhen ? (
        <div style={{ marginTop: 8 }}>{empty}</div>
      ) : (
        <>
          <div className="num-xl" style={{ fontSize: 22, marginTop: 8 }}>
            {formatMoney(numero ?? 0, currency)}
          </div>
          <div className="bar-track" style={{ marginTop: 10, height: 8 }}>
            <div
              className="bar-fill"
              style={{
                width: `${pct}%`,
                background:
                  state === "alcanzado"
                    ? "var(--pos)"
                    : "linear-gradient(90deg, var(--gold, #c79a3a), var(--teal, #2bb6a3))",
              }}
            />
          </div>
          <div className="muted fs12" style={{ marginTop: 6 }}>
            {state === "alcanzado" ? "Alcanzado ✓" : `${pct}% construido`}
          </div>
        </>
      )}
    </div>
  );
}
