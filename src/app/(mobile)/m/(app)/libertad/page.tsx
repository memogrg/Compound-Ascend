import Link from "next/link";
import { MobileHeader } from "../../components/mobile-header";
import { getPatrimonioReport, type PatrimonioServiceResult, type Hito } from "@/modules/wealth";
import { getDesiredMonthlyLifestyle } from "@/modules/wealth/services/lifestyle-service";
import { getPrimaryCurrency } from "@/modules/financial-base";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MDataRow,
  MProgress,
  MChip,
  MEmptyState,
  mAmount,
  type MTone,
} from "../../components/content-kit";
import { DefineLifestyleSheet } from "./define-lifestyle-sheet";

/**
 * /m/libertad — Escalera de hitos (Seguridad → Independencia → Libertad), paridad
 * móvil del bloque del Marco Patrimonial de la web (mi-rich-life). Consume el reporte
 * del motor tal cual: los tres números, sus progresos y el hito alcanzado/siguiente
 * vienen del engine (N2); esta pantalla NO recalcula nada. Piel del kit de contenido
 * móvil, es-MX "tú".
 */
export const dynamic = "force-dynamic"; // datos por sesión

const RANK: Record<Hito, number> = { ninguno: 0, seguridad: 1, independencia: 2, libertad: 3 };
type RungKey = "seguridad" | "independencia" | "libertad";
type RungState = "alcanzado" | "en_curso" | "pendiente";

const RUNGS: { key: RungKey; title: string; subtitle: string; icon: "protection" | "income" | "goal" }[] = [
  { key: "seguridad", title: "Seguridad", subtitle: "Tu capital cubre tus gastos esenciales.", icon: "protection" },
  { key: "independencia", title: "Independencia", subtitle: "Tu capital sostiene tu vida actual completa.", icon: "income" },
  { key: "libertad", title: "Libertad", subtitle: "Tu capital sostiene la vida que quieres vivir.", icon: "goal" },
];

const STATE_TONE: Record<RungState, MTone> = {
  alcanzado: "success",
  en_curso: "warning",
  pendiente: "neutral",
};
const STATE_LABEL: Record<RungState, string> = {
  alcanzado: "Alcanzado",
  en_curso: "Meta actual",
  pendiente: "Pendiente",
};

export default async function MobileLibertad() {
  let result: PatrimonioServiceResult | null = null;
  try {
    result = await getPatrimonioReport();
  } catch {
    result = null;
  }
  // Para el CTA de estilo de vida: la PRINCIPAL (importe libre, la elige el usuario) y el
  // valor ya definido (con su moneda), para precargar la edición. Best-effort.
  const [primaryCurrency, currentLifestyle] = await Promise.all([
    getPrimaryCurrency().catch(() => "CRC"),
    getDesiredMonthlyLifestyle().catch(() => null),
  ]);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Mi Rich Life"
          title="Tu escalera"
          backHref="/m"
          backLabel="Volver a Inicio"
        />

        {result ? (
          <Escalera
            result={result}
            primaryCurrency={primaryCurrency}
            currentLifestyle={currentLifestyle}
          />
        ) : (
          <MEmptyState
            icon="goal"
            title="Aún no podemos calcular tu escalera"
            description="Registra tus ingresos, gastos y activos para ver los tres hitos hacia vivir de tu patrimonio."
            actionLabel="Ir a Inicio"
            actionHref="/m"
          />
        )}
      </div>
    </div>
  );
}

function Escalera({
  result,
  primaryCurrency,
  currentLifestyle,
}: {
  result: PatrimonioServiceResult;
  primaryCurrency: string;
  currentLifestyle: { amount: number; currency: string } | null;
}) {
  const r = result.report;
  const currency = result.currency;
  const essential = result.essentialBreakdown;

  const numeroOf = (k: RungKey): number | null =>
    k === "seguridad" ? r.numeroDeSeguridad : k === "independencia" ? r.numeroDeIndependencia : r.numeroDeLibertad;
  const progresoOf = (k: RungKey): number =>
    k === "seguridad" ? r.progresoSeguridad : k === "independencia" ? r.progresoIndependencia : r.progresoLibertad;
  const stateOf = (k: RungKey): RungState =>
    RANK[k] <= RANK[r.hitoAlcanzado] ? "alcanzado" : k === r.siguienteHito ? "en_curso" : "pendiente";

  return (
    <>
      {/* Resumen héroe: el capital que trabaja (numerador de los tres progresos). */}
      <MSummaryCard
        eyebrow="Capital que trabaja"
        value={mAmount(r.investableWealth, currency, 11)}
        sub={
          r.defenseFundsBalance > 0
            ? `Excluye tus fondos de defensa (${mAmount(r.defenseFundsBalance, currency)}): son tu colchón, no capital que genera renta.`
            : "Inversión + activos productivos + tu líquido invertible."
        }
        style={{ marginBottom: 16 }}
      />

      <MSectionHeader title="Tus tres hitos" />
      <MContentCard style={{ marginBottom: 16 }}>
        {RUNGS.map((rung) => {
          const numero = numeroOf(rung.key);
          const state = stateOf(rung.key);
          const tone = STATE_TONE[state];
          const pct = Math.round(Math.min(1, progresoOf(rung.key)) * 100);

          // Seguridad sin gasto esencial marcado: no hay número, se guía a Gastos.
          if (rung.key === "seguridad" && r.numeroDeSeguridad <= 0) {
            return (
              <MDataRow
                key={rung.key}
                icon={rung.icon}
                title={rung.title}
                subtitle="Marca tus gastos esenciales para calcular este número."
                slot={
                  <Link href="/m/gastos" className="m-btn m-btn-secondary" style={{ minHeight: 40, fontSize: 13 }}>
                    Marcar esenciales en Gastos
                  </Link>
                }
              />
            );
          }

          // Libertad sin estilo de vida deseado: CTA para definirlo (nunca un número inventado).
          if (rung.key === "libertad" && numero == null) {
            return (
              <MDataRow
                key={rung.key}
                icon={rung.icon}
                title={rung.title}
                subtitle={rung.subtitle}
                slot={
                  <DefineLifestyleSheet
                    primaryCurrency={primaryCurrency}
                    current={currentLifestyle}
                    label="Definir mi estilo de vida"
                    variant="m-btn-secondary"
                  />
                }
              />
            );
          }

          return (
            <MDataRow
              key={rung.key}
              icon={rung.icon}
              iconTone={tone}
              title={rung.title}
              subtitle={rung.subtitle}
              value={mAmount(numero ?? 0, currency, 10)}
              valueTone={tone}
              slot={
                <>
                  <MProgress value={progresoOf(rung.key)} tone={tone} height={8} />
                  <div className="between" style={{ marginTop: 8 }}>
                    <MChip tone={tone}>{STATE_LABEL[state]}</MChip>
                    <span className="mono muted" style={{ fontSize: 12 }}>
                      {state === "alcanzado" ? "100%" : `${pct}%`}
                    </span>
                  </div>
                </>
              }
            />
          );
        })}
      </MContentCard>

      {/* Transparencia del número de seguridad: de dónde sale el gasto esencial. */}
      {r.numeroDeSeguridad > 0 && essential ? (
        <>
          <MSectionHeader title="De dónde sale tu número de seguridad" />
          <MContentCard style={{ marginBottom: 16 }}>
            <MDataRow dense title="Gasto esencial mensual" value={mAmount(essential.total, currency, 10)} />
            {(
              [
                ["Sobres", essential.byOrigin.sobres],
                ["Deudas", essential.byOrigin.debts],
                ["Ahorros esenciales", essential.byOrigin.goals],
                ["Pólizas", essential.byOrigin.policies],
              ] as const
            )
              .filter(([, v]) => v > 0)
              .map(([label, v]) => (
                <MDataRow key={label} dense title={label} value={mAmount(v, currency, 10)} valueTone="neutral" />
              ))}
            {essential.excludedPolicies.map((p) => (
              <MDataRow
                key={p.id}
                dense
                title={`Prima de ${p.policyName}`}
                subtitle={`Excluida: ya la pagas vía el ahorro ${p.viaGoalName}`}
                value={`−${mAmount(p.monthly, currency, 9)}`}
                valueTone="neutral"
              />
            ))}
          </MContentCard>
          <Link
            href="/m/gastos"
            style={{ color: "var(--accent)", fontWeight: 600, fontSize: 13, display: "inline-block", marginBottom: 16 }}
          >
            Ajustar qué es esencial →
          </Link>
        </>
      ) : null}

      {/* Sensibilidad de tasa: secundaria (el cálculo usa 8%). */}
      <details>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 13, padding: "4px 0" }}>
          ¿Y si el retorno no fuera 8%?
        </summary>
        <MContentCard style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 4px" }}>
            El capital para sostener tu vida actual cambia con el retorno que asumas. Usamos 8%:
          </p>
          {(["0.04", "0.06", "0.08", "0.10"] as const).map((k) => (
            <MDataRow
              key={k}
              dense
              title={`${Math.round(Number(k) * 100)}% de retorno${k === "0.08" ? " · actual" : ""}`}
              value={mAmount(r.sensibilidadTasa[k], currency, 10)}
              valueTone={k === "0.08" ? "success" : "neutral"}
            />
          ))}
        </MContentCard>
      </details>
    </>
  );
}
