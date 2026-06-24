import { DonutChart, type DonutDatum } from "@/components/charts/lazy";
import { DeleteButton } from "./delete-button";
import { EditRichButton, AddRichButton } from "./rich-actions";
import { formatMoney, formatCompact, formatPercent } from "@/lib/format";
import type { RichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import type { PatrimonioServiceResult } from "@/modules/wealth";
import type { RichTrend, Asset, Liability } from "@/modules/rich-life/types";

const TREND: Record<RichTrend, { label: string; cls: string; delta: string }> = {
  mas_rico: { label: "Te estás haciendo más rico", cls: "var(--pos)", delta: "up" },
  estable: { label: "Patrimonio estable", cls: "var(--muted)", delta: "flat" },
  mas_pobre: { label: "Te estás haciendo más pobre", cls: "var(--neg)", delta: "down" },
  sin_historico: { label: "Tu punto de partida", cls: "var(--muted)", delta: "flat" },
};

export function RichLifeDashboard({
  summary,
  patrimonio,
}: {
  summary: RichLifeSummary;
  patrimonio?: PatrimonioServiceResult;
}) {
  const { snapshot: s, assets, liabilities, currency } = summary;
  const ind = s.indicators;
  const trend = TREND[ind.trend];

  const assetDonut: DonutDatum[] = s.assetsByClass.map((a) => ({
    name: a.label,
    value: a.value,
    color: a.color,
  }));
  const liabDonut: DonutDatum[] = s.liabilitiesByClass.map((a) => ({
    name: a.label,
    value: a.value,
    color: a.color,
  }));
  const freedomPct = Math.min(100, Math.round(ind.financialFreedomIndex * 100));

  return (
    <div className="grid">
      {/* Hero: patrimonio neto + Rich Life Score */}
      <section className="dash-hero">
        <div className="card card-pad">
          <div className="label">Patrimonio neto</div>
          <div className="num-xl" style={{ fontSize: 46, marginTop: 8 }}>
            {formatMoney(ind.netWorth, currency)}
          </div>
          <span className={`delta ${trend.delta}`} style={{ marginTop: 12, color: trend.cls }}>
            {trend.label}
            {ind.wealthVelocity !== null
              ? ` · ${formatMoney(ind.wealthVelocity, currency)}/mes`
              : ""}
          </span>
          <div
            style={{
              display: "flex",
              gap: 22,
              marginTop: 16,
              fontSize: 12.5,
              color: "var(--muted)",
              flexWrap: "wrap",
            }}
          >
            <div>
              Activos{" "}
              <strong style={{ color: "var(--pos)" }}>
                {formatMoney(ind.totalAssets, currency)}
              </strong>
            </div>
            <div>
              Pasivos{" "}
              <strong style={{ color: "var(--ink-2)" }}>
                {formatMoney(ind.totalLiabilities, currency)}
              </strong>
            </div>
            <div>
              Activos/Pasivos{" "}
              <strong style={{ color: "var(--ink-2)" }}>
                {ind.assetLiabilityRatio === Infinity ? "∞" : ind.assetLiabilityRatio}
              </strong>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {(() => {
            // Con datos reales: Índice Patrimonial + nivel aspiracional. Sin ellos
            // (demo): Rich Life Score de siempre.
            const ringValue = patrimonio ? patrimonio.report.indice : s.score.score;
            const ringLabel = patrimonio ? "Índice" : "Rich Life";
            const titleLabel = patrimonio ? "Índice Patrimonial" : "Rich Life Score";
            const chipText = patrimonio ? patrimonio.level.name : s.score.state;
            const reading = patrimonio ? patrimonio.level.reading : s.reading;
            return (
              <>
                <div className="ring-wrap">
                  <svg width="120" height="120" viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--chip)" strokeWidth="4" />
                    <circle
                      cx="21"
                      cy="21"
                      r="15.915"
                      fill="none"
                      stroke="var(--gold)"
                      strokeWidth="4"
                      strokeLinecap={ringValue >= 100 ? "butt" : "round"}
                      pathLength={100}
                      strokeDasharray={`${ringValue} 100`}
                      strokeDashoffset="25"
                      transform="rotate(-90 21 21)"
                    />
                  </svg>
                  <div className="ring-center">
                    <div>
                      <div className="num-xl" style={{ fontSize: 36 }}>
                        {ringValue}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{ringLabel}</div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="label">
                    {titleLabel}
                    {patrimonio ? (
                      <TipQ text="Tu Índice Patrimonial (0-100) resume qué tan sólido y libre es tu patrimonio: combina cuánto trabaja para ti, tu liquidez, protección y calidad de deuda. Sube cuando aumentas patrimonio invertible y reduces deuda cara." />
                    ) : null}
                  </div>
                  <div
                    className="chip"
                    style={{
                      marginTop: 8,
                      background: "color-mix(in srgb,var(--gold) 18%, transparent)",
                      color: "var(--gold)",
                    }}
                  >
                    {chipText}
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
                    {reading}
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {patrimonio ? <PatrimonioSections p={patrimonio} currency={currency} /> : null}

      {/* Indicadores (solo en modo sin Marco Patrimonial; las §12 los sustituyen). */}
      {!patrimonio ? (
        <section className="cols-4">
          <Ind
            label="Activos productivos"
            value={formatPercent(ind.productiveAssetsPct)}
            note="trabajan para ti"
          />
          <Ind
            label="Activos líquidos"
            value={formatPercent(ind.liquidAssetsPct)}
            note="disponibles"
          />
          <Ind
            label="Meses de independencia"
            value={String(ind.monthsOfIndependence)}
            note="sin nuevos ingresos"
          />
          <Ind
            label="Endeudamiento patrimonial"
            value={formatPercent(ind.debtToAssets)}
            note="pasivos / activos"
          />
        </section>
      ) : null}

      {/* Donuts activos / pasivos */}
      <section className="cols-2">
        <DonutCard
          title="Composición de activos"
          data={assetDonut}
          total={ind.totalAssets}
          currency={currency}
          empty="Agrega tus activos."
        />
        <DonutCard
          title="Composición de pasivos"
          data={liabDonut}
          total={ind.totalLiabilities}
          currency={currency}
          empty="Sin pasivos registrados."
        />
      </section>

      {/* Termómetro de libertad financiera (solo en modo sin Marco Patrimonial). */}
      {!patrimonio ? (
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="card-title">Libertad financiera</div>
            <span className="muted" style={{ fontSize: 12 }}>
              Ingresos pasivos cubren {freedomPct}% de tus gastos
            </span>
          </div>
          <div className="bar-track" style={{ marginTop: 14, height: 12 }}>
            <div
              className="bar-fill"
              style={{
                width: `${freedomPct}%`,
                background: "linear-gradient(90deg, var(--pos), var(--teal))",
              }}
            />
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Meta: 100% = tus ingresos pasivos cubren todos tus gastos (independencia financiera).
          </div>
        </div>
      ) : null}

      {/* Próxima mejor acción */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="card-title">Tu próxima mejor acción</div>
          <span
            className="chip"
            style={{
              background: "linear-gradient(140deg,var(--pos-soft),var(--info-soft))",
              color: "var(--ink-2)",
            }}
          >
            Rich Life Snapshot
          </span>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--ink)", margin: 0 }}>
          {s.nextBestAction}
        </p>
      </div>

      {/* Listas */}
      <section className="dash-split">
        <ListCard
          title="Mis activos"
          sub={`${assets.length} registrado(s)`}
          currency={currency}
          addKind="asset"
          items={assets.map((a) => ({
            id: a.id,
            name: a.name,
            sub: a.assetClass.replace("_", " "),
            amount: formatMoney(a.value, a.currency),
            color: "var(--pos)",
            kind: "asset" as const,
            entity: a,
          }))}
          emptyText="Agrega tu casa, carro, inversiones…"
        />
        <ListCard
          title="Mis pasivos"
          sub={`${liabilities.length} registrado(s)`}
          currency={currency}
          addKind="liability"
          items={liabilities.map((l) => ({
            id: l.id,
            name: l.name,
            sub: l.liabilityClass,
            amount: formatMoney(l.balance, l.currency),
            color: "var(--neg)",
            kind: "liability" as const,
            entity: l,
          }))}
          emptyText="Agrega hipotecas u otras deudas grandes."
        />
      </section>
    </div>
  );
}

/** Ícono "?" con tooltip explicativo (reusa .tip/.tip-wrap globales). */
function TipQ({ text }: { text: string }) {
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

/** Card compacta del §12: etiqueta + tooltip "?" + valor + nota. */
function MetricCard({
  label,
  value,
  note,
  tip,
}: {
  label: string;
  value: string;
  note: string;
  tip: string;
}) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="label">
        {label}
        <TipQ text={tip} />
      </div>
      <div className="num-xl" style={{ fontSize: 26, marginTop: 10 }}>
        {value}
      </div>
      <div className="muted fs12" style={{ marginTop: 8 }}>
        {note}
      </div>
    </div>
  );
}

/**
 * Secciones del Marco Patrimonial (§12-13): métrica héroe "Número de Libertad",
 * cards compactas con tooltip, y Fragilidad Financiera desde el diagnóstico.
 * Lenguaje aspiracional, nunca humillante.
 */
function PatrimonioSections({
  p,
  currency,
}: {
  p: PatrimonioServiceResult;
  currency: string;
}) {
  const r = p.report;
  const libertadPct = Math.min(100, Math.round(r.ratioLibertad * 100));
  const anios = r.añosDeLibertad;
  // §13 · microcopy aspiracional según qué tan construido está el patrimonio.
  const heroReading =
    r.ratioLibertad >= 1
      ? "¡Lo lograste! Tu patrimonio invertible ya cubre tu Número de Libertad."
      : r.ratioLibertad >= 0.5
        ? "Vas a buen ritmo: ya construiste buena parte del capital que te haría libre."
        : "Tu patrimonio está en etapa de construcción; tu mayor oportunidad ahora es aumentar tu patrimonio invertible y elevar tus meses de libertad.";

  return (
    <>
      {/* Métrica héroe: Tu Número de Libertad */}
      <div className="card card-pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="label">
            Tu Número de Libertad
            <TipQ text="Es el capital que, invertido, podría sostener tu estilo de vida sin depender de tu trabajo. Lo comparamos con tu patrimonio invertible para saber cuánto camino llevas." />
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            Te compra <strong style={{ color: "var(--ink-2)" }}>{anios}</strong> años de tu estilo de
            vida
          </span>
        </div>
        <div className="num-xl" style={{ fontSize: 42, marginTop: 8 }}>
          {formatMoney(r.numeroDeLibertad, currency)}
        </div>
        <div className="bar-track" style={{ marginTop: 14, height: 12 }}>
          <div
            className="bar-fill"
            style={{
              width: `${libertadPct}%`,
              background: "linear-gradient(90deg, var(--gold), var(--teal))",
            }}
          />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
          Llevas <strong style={{ color: "var(--ink-2)" }}>{libertadPct}%</strong> construido. {heroReading}
        </div>
      </div>

      {/* Cards §12 */}
      <section className="cols-4">
        <MetricCard
          label="Patrimonio invertible"
          value={formatMoney(r.investableWealth, currency)}
          note="capital que trabaja para ti"
          tip="Qué es: tus inversiones + activos productivos. Por qué importa: es la parte que puede generar ingresos y acercarte a la libertad. Qué hago: muévelo desde activos que solo se usan o que están parados."
        />
        <MetricCard
          label="Años de Libertad"
          value={`${anios}`}
          note="años que cubre tu patrimonio"
          tip="Qué es: cuántos años de tu estilo de vida cubre tu patrimonio invertible. Por qué importa: traduce tu capital a tiempo de tranquilidad. Qué hago: súbelo invirtiendo más y conteniendo el gasto."
        />
        <MetricCard
          label="Meses de Libertad"
          value={`${r.mesesDeLibertad}`}
          note="liquidez vs. gasto mensual"
          tip="Qué es: cuántos meses cubrirías con tu dinero líquido si se cortaran tus ingresos. Por qué importa: es tu colchón de seguridad. Qué hago: apunta primero a 3-6 meses de gastos."
        />
        <MetricCard
          label="Cobertura de ingreso pasivo"
          value={formatPercent(r.coberturaPasiva)}
          note="del gasto, sin trabajar"
          tip="Qué es: qué parte de tu gasto pagan tus ingresos pasivos. Por qué importa: al 100% eres financieramente independiente. Qué hago: construye activos que generen renta o dividendos."
        />
        <MetricCard
          label="Calidad del patrimonio"
          value={`${r.calidadPatrimonio}/100`}
          note="qué tan sano es tu mix"
          tip="Qué es: mezcla de activos productivos, líquidos, protección y deuda sana. Por qué importa: dos patrimonios del mismo tamaño no son iguales. Qué hago: diversifica, protégete y baja la deuda cara."
        />
        <FragilidadCard diagnosis={p.diagnosis} />
      </section>
    </>
  );
}

/** Fragilidad Financiera: hints de las banderas activas (§15) o estado positivo. */
function FragilidadCard({ diagnosis }: { diagnosis: PatrimonioServiceResult["diagnosis"] }) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="label">
        Fragilidad financiera
        <TipQ text="Qué es: señales de riesgo en tu patrimonio (deuda cara, baja liquidez, concentración…). Por qué importa: son lo primero a resolver. Qué hago: atiende un punto a la vez, empezando por el de arriba." />
      </div>
      {diagnosis.length === 0 ? (
        <div className="muted fs12" style={{ marginTop: 10, lineHeight: 1.5, color: "var(--pos)" }}>
          Tu base se ve sólida: no detectamos fragilidades. Sigue construyendo patrimonio invertible.
        </div>
      ) : (
        <ul style={{ margin: "10px 0 0", paddingLeft: 16, display: "grid", gap: 6 }}>
          {diagnosis.map((d) => (
            <li key={d.code} style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-2)" }}>
              {d.hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Ind({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card kpi" style={{ padding: "16px 18px" }}>
      <div className="label">{label}</div>
      <div className="num-xl" style={{ fontSize: 26, marginTop: 10 }}>
        {value}
      </div>
      <div className="muted fs12" style={{ marginTop: 8 }}>
        {note}
      </div>
    </div>
  );
}

function DonutCard({
  title,
  data,
  total,
  currency,
  empty,
}: {
  title: string;
  data: DonutDatum[];
  total: number;
  currency: string;
  empty: string;
}) {
  return (
    <div className="card card-pad">
      <div className="card-title">{title}</div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, flexWrap: "wrap" }}
      >
        <DonutChart data={data} centerLabel={formatCompact(total, currency)} />
        <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}>
          {data.length === 0 ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {empty}
            </span>
          ) : (
            data.map((d) => (
              <div
                key={d.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "10px 1fr auto",
                  gap: 9,
                  alignItems: "center",
                  fontSize: 12.5,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />
                <span style={{ color: "var(--ink-2)" }}>{d.name}</span>
                <span className="muted tnum">{formatMoney(d.value, currency)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ListCard({
  title,
  sub,
  items,
  emptyText,
  currency,
  addKind,
}: {
  title: string;
  sub: string;
  items: {
    id: string;
    name: string;
    sub: string;
    amount: string;
    color: string;
    kind: "asset" | "liability";
    entity: Asset | Liability;
  }[];
  emptyText: string;
  currency: string;
  addKind: "asset" | "liability";
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div
          className="muted"
          style={{
            padding: "20px 24px",
            fontSize: 13,
            display: "grid",
            gap: 12,
            justifyItems: "start",
          }}
        >
          <span>{emptyText}</span>
          <AddRichButton
            kind={addKind}
            currency={currency}
            variant={addKind === "asset" ? "btn-primary" : "btn-secondary"}
          />
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="list-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.name}</div>
              <div
                className="muted"
                style={{ fontSize: 11.5, marginTop: 2, textTransform: "capitalize" }}
              >
                {it.sub}
              </div>
            </div>
            <span className="tnum" style={{ fontSize: 13.5, fontWeight: 500, color: it.color }}>
              {it.amount}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <EditRichButton kind={it.kind} item={it.entity} currency={currency} />
              <DeleteButton id={it.id} kind={it.kind} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
