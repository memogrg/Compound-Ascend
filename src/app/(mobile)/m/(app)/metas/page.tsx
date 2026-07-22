import { getControlSummary } from "@/modules/control";
import { getDisplayCurrency, listCategoryTree } from "@/modules/financial-base";
import { convertCurrency } from "@/lib/fx";
import { formatMoney, formatPercent } from "@/lib/format";
import { MobileHeader } from "../../components/mobile-header";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MMetricGrid,
  MMetricCard,
  MChip,
  MProgress,
  mAmount,
} from "../../components/content-kit";
import { GoalManager } from "./goal-manager";

/**
 * /m/metas — "Metas": metas de ahorro con progreso + lectura del MOTOR DE
 * PRIORIDADES. Reutiliza el barrel control (getControlSummary: goals +
 * diagnosis del priority-engine). Sin reimplementar cálculos. Piel del diseño
 * (data-screen="metas"), es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

const SEMAFORO: Record<string, { label: string; color: string }> = {
  verde: { label: "Saludable", color: "var(--accent)" },
  amarillo: { label: "Atención", color: "var(--warning)" },
  rojo: { label: "En riesgo", color: "var(--danger)" },
};
export default async function MobileMetas() {
  const [summary, currency, tree] = await Promise.all([
    getControlSummary(),
    getDisplayCurrency(),
    listCategoryTree("expense"),
  ]);
  const { goals, diagnosis, fxRates } = summary;
  const sem = SEMAFORO[diagnosis.semaforo] ?? SEMAFORO.amarillo!;

  // Cada meta guarda SU moneda: sumarlas en crudo daría un total falso al mezclar ₡ y $.
  // Se convierten a la moneda de display con las tasas que ya trae el summary — el mismo
  // patrón que /m/ingresos. Es agregación de datos ya cargados, no una consulta nueva.
  const conv = (amount: number, from: string) => convertCurrency(amount, from, currency, fxRates);
  // Los "sobres" (kind='sobre') no tienen objetivo: cuentan para lo ahorrado, no para la meta.
  const conMeta = goals.filter((g) => g.kind !== "sobre" && g.targetAmount > 0);
  const totalSaved = goals.reduce((s, g) => s + conv(g.currentAmount, g.currency), 0);
  const totalTarget = conMeta.reduce((s, g) => s + conv(g.targetAmount, g.currency), 0);
  const pct = totalTarget > 0 ? totalSaved / totalTarget : 0;
  const missing = Math.max(0, totalTarget - totalSaved);
  // `monthlyContribution` es lo que PLANEAS aportar al mes, no lo aportado: la etiqueta
  // lo dice. Lo real vive en transactions y traerlo sería una consulta nueva.
  const planned = goals.reduce((s, g) => s + conv(g.monthlyContribution, g.currency), 0);
  const sobres = goals.length - conMeta.length;
  // Meta con la fecha límite más cercana (las que no tienen fecha no compiten).
  const next = conMeta
    .filter((g) => g.targetDate)
    .sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1))[0];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        {/* /m/metas no es una pestaña y era la ÚNICA pantalla no-pestaña sin backHref: se
            entraba desde Inicio y no había forma de volver salvo saltar a otra sección. */}
        <MobileHeader variant="inner" eyebrow="Control" title="Ahorro" backHref="/m" backLabel="Volver a Inicio" />

        {/* Resumen: lo ahorrado (exacto mientras quepa) sobre el objetivo global. */}
        <MSummaryCard
          eyebrow="Total ahorrado"
          value={mAmount(totalSaved, currency, 11)}
          chip={totalTarget > 0 ? <MChip tone={pct >= 1 ? "success" : "neutral"}>{formatPercent(pct)}</MChip> : undefined}
          sub={
            totalTarget > 0
              ? `De ${formatMoney(totalTarget, currency)} en objetivos. Te faltan ${formatMoney(missing, currency)}.`
              : "Aún no tienes metas con objetivo: lo que guardes aquí se acumula sin tope."
          }
          slot={totalTarget > 0 ? <MProgress value={pct} tone={pct >= 1 ? "success" : "success"} height={9} /> : undefined}
          style={{ marginBottom: 16 }}
        />

        {/* Métricas. El % global y el objetivo ya viven en el resumen: aquí, lo que no está. */}
        <MSectionHeader title="Tu ahorro en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard
            label="Metas activas"
            value={String(goals.length)}
            sub={sobres > 0 ? `${sobres} ${sobres === 1 ? "es sobre" : "son sobres"}` : "con objetivo"}
          />
          <MMetricCard
            label="Aporte mensual"
            value={mAmount(planned, currency, 8)}
            sub="lo que planeaste"
          />
          <MMetricCard
            label="Te falta"
            value={totalTarget > 0 ? mAmount(missing, currency, 8) : "—"}
            sub={totalTarget > 0 ? "para tus objetivos" : "sin objetivos aún"}
            tone={totalTarget > 0 && missing === 0 ? "success" : "neutral"}
          />
          <MMetricCard
            label="Meta más próxima"
            value={next?.targetDate ? fmtShort(next.targetDate) : "—"}
            sub={next?.name ?? "sin fecha límite"}
          />
        </MMetricGrid>

        {/* Motor de prioridades: conserva su tinte de acento (es su identidad), con el
            contenedor del kit. */}
        <MSectionHeader title={`Prioridades · ${sem.label}`} />
        <MContentCard style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
          <div className="between" style={{ marginBottom: 8 }}>
            <span className="ov" style={{ color: sem.color }}>
              Score de control
            </span>
            <span className="display" style={{ fontSize: 20, color: sem.color }}>
              {diagnosis.scoreControl}
            </span>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{diagnosis.nextBestAction}</div>
        </MContentCard>

        {/* Metas gestionables: SwipeRow (editar/eliminar) + Aporte/Retirar + FAB de alta */}
        <MSectionHeader
          title="Tus metas"
          action={
            goals.length > 0 ? (
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
                {goals.length} {goals.length === 1 ? "meta" : "metas"}
              </span>
            ) : undefined
          }
        />
        <GoalManager goals={goals} currency={currency} tree={tree} />
      </div>
    </div>
  );
}

/** Fecha corta para la celda de métrica, que es estrecha y no parte línea: "dic 2026". */
function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
}
