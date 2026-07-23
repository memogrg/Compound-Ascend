import { MobileHeader } from "../../components/mobile-header";
import {
  getWealthSummary,
  getDefenseFundsReport,
  detectLongTermObligation,
} from "@/modules/wealth";
import { listDebts } from "@/modules/control";
import { DefenseFundsMobile } from "./defense-funds-mobile";
import {
  MSummaryCard,
  MSectionHeader,
  MContentCard,
  MMetricGrid,
  MMetricCard,
  MChip,
  mAmount,
  type MTone,
} from "../../components/content-kit";
import { ProteccionManager } from "./proteccion-manager";

/**
 * /m/proteccion — "Protección": score de defensa patrimonial, pólizas activas y
 * brechas de cobertura. Reutiliza el barrel wealth (getWealthSummary: protection
 * + policies). Sin reimplementar cálculos. Piel del diseño (data-screen="proteccion"),
 * es-MX "tú", tema claro.
 */
export const dynamic = "force-dynamic"; // datos por sesión

/** Estado de protección por score → etiqueta + tono del kit. */
function statusOf(score: number): { label: string; tone: MTone } {
  if (score >= 80) return { label: "Protegido", tone: "success" };
  if (score >= 50) return { label: "Parcial", tone: "warning" };
  return { label: "Expuesto", tone: "danger" };
}

/** Fecha corta ("dic 2026") para celdas estrechas; "—" si no hay. */
function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
}

export default async function MobileProteccion() {
  const summary = await getWealthSummary();
  const { protection: p, policies, currency } = summary;
  const st = statusOf(p.score);

  // Fondos de defensa (F1/F2), best-effort.
  const funds = await getDefenseFundsReport().catch(() => null);
  const mortgageCase = await listDebts()
    .then((debts) =>
      detectLongTermObligation(
        debts.map((d) => ({
          classification: d.classification ?? null,
          termMonths: d.termMonths ?? null,
          debtType: d.debtType ?? null,
          balance: Number(d.balance ?? 0),
        })),
      ),
    )
    .catch(() => false);

  // Prima mensual = anual / 12 (el engine da annualPremium, ya en la moneda de display).
  const monthlyPremium = p.annualPremium / 12;
  // Próximo vencimiento: la renovación más CERCANA entre las pólizas que tienen fecha.
  // Deriva de datos ya cargados, sin consulta nueva (patrón de "meta más próxima" en Ahorro).
  const nextRenewal = policies
    .map((pol) => pol.renewalDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader
          variant="inner"
          eyebrow="Crecimiento"
          title="Defensa Patrimonial"
          backHref="/m"
          backLabel="Volver a Inicio"
        />

        {/* Resumen: cuánto tienes protegido + el estado (Protegido/Parcial/Expuesto) como
            chip. Los agregados YA vienen en la moneda de display (wealth-service convierte
            coverage/premium antes del engine) → en crudo, sin reconvertir. */}
        <MSummaryCard
          eyebrow="Cobertura total"
          value={mAmount(p.totalCoverage, currency, 11)}
          chip={<MChip tone={st.tone}>{st.label}</MChip>}
          sub={
            p.activePolicies === 0
              ? "Aún no proteges nada. Registra tu primera póliza."
              : p.gaps.length === 0
                ? `${p.activePolicies} ${p.activePolicies === 1 ? "póliza activa" : "pólizas activas"}. No detectamos brechas: buen trabajo.`
                : `${p.activePolicies} ${p.activePolicies === 1 ? "póliza activa" : "pólizas activas"}. Tienes ${p.gaps.length} ${p.gaps.length === 1 ? "brecha" : "brechas"} que dejan tu patrimonio expuesto.`
          }
          style={{ marginBottom: 16 }}
        />

        {funds ? <DefenseFundsMobile report={funds} mortgageCase={mortgageCase} /> : null}

        {/* Métricas. Brechas NO va aquí: tiene su propia sección abajo. */}
        <MSectionHeader title="Tu protección en números" />
        <MMetricGrid style={{ marginBottom: 16 }}>
          <MMetricCard label="Pólizas activas" value={String(p.activePolicies)} sub="cubriéndote hoy" />
          <MMetricCard label="Prima mensual" value={mAmount(monthlyPremium, currency, 8)} sub="lo que pagas" />
          <MMetricCard
            label="Nivel de protección"
            value={`${p.score}`}
            sub={`${st.label} · de 100`}
            tone={st.tone}
          />
          {/* Sin fecha no se puede afirmar que "renueva a tiempo": no se sabe. Se dice que
              falta el dato, que además es accionable. */}
          <MMetricCard
            label="Próximo vencimiento"
            value={fmtShort(nextRenewal)}
            sub={nextRenewal ? "renueva a tiempo" : "sin fecha registrada"}
          />
        </MMetricGrid>

        {/* Pólizas — CRUD (FAB alta · SwipeRow editar/eliminar) */}
        <MSectionHeader title="Tus pólizas" />
        <div style={{ marginBottom: p.gaps.length > 0 ? 16 : 0 }}>
          <ProteccionManager policies={policies} />
        </div>

        {/* Brechas de protección (diagnóstico del engine; su lógica no se toca). */}
        {p.gaps.length > 0 && (
          <div>
            <MSectionHeader title="Brechas de protección" />
            <MContentCard>
              {p.gaps.map((g, i) => (
                <div className="gap-row" key={`${g.type}-${i}`}>
                  <span className={`sev ${g.severity}`}>{g.severity.toUpperCase()}</span>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <strong>{g.type}</strong> — {g.description}
                  </div>
                </div>
              ))}
            </MContentCard>
          </div>
        )}
      </div>
    </div>
  );
}
