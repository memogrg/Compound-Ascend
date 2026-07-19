import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getDashboardData } from "@/modules/dashboard";
import { listTransactions, type Transaction, type Period } from "@/modules/financial-base";
import { getExpenseRangeView } from "@/modules/financial-base/services/expense-range-service";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import { MHomeCarousel } from "../components/home-carousel";
import { BudgetCard } from "../components/home-cards/budget-card";
import { NetWorthCard } from "../components/home-cards/networth-card";
import { formatMoney } from "@/lib/format";
import { MobileHeader } from "../components/mobile-header";

/**
 * Pantalla de Inicio del móvil (/m) — "centro de mando" del diseño
 * (design-movil/project/CARTERA Movil.html, sección data-screen="inicio"),
 * con DATOS REALES: reutiliza los mismos services/engine de escritorio vía los
 * barrels (dashboard + financial-base), sin reimplementar cálculos. Texto es-MX, tú.
 */
export const dynamic = "force-dynamic"; // datos por sesión/usuario: nunca estático

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Ventana rodante (~3 meses) para "movimientos recientes". listTransactions solo usa from/to. */
function recentPeriod(now: Date): Period {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  const from = start.toISOString().slice(0, 10);
  return { month: now.getMonth() + 1, year: now.getFullYear(), from, to, label: "recientes" };
}

function relativeDay(iso: string, now: Date): string {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return d.toLocaleDateString("es-MX", { weekday: "short" });
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const KIND_LABEL: Record<Transaction["kind"], string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

/** Ruta móvil por pilar para los accesos rápidos (pantallas /m ya construidas).
 *  "ahorro" apunta a las metas de ahorro (/m/ingresos sigue accesible por URL). */
const M_ROUTE: Record<string, string> = {
  flujo: "/m/gastos",
  ahorro: "/m/metas",
  deudas: "/m/deudas",
  inversiones: "/m/inversiones",
};

/**
 * Etiquetas de los accesos rápidos. Son CORTAS a propósito, y solo aquí: "Deudas y
 * Préstamos" y "Portafolio de inversiones" envuelven a dos y tres líneas en una fila de
 * cuatro, y desequilibran la cuadrícula. El destino es el mismo, y al llegar la pantalla
 * se presenta con su nombre completo.
 *
 * NO toques nav.ts por esto: los títulos de pantalla y el menú siguen con los nombres
 * canónicos. Lo que se acorta es el atajo, no la sección.
 */
const M_LABEL: Record<string, string> = {
  flujo: "Gastos",
  ahorro: "Ahorro",
  deudas: "Deudas",
  inversiones: "Portafolio",
};

export default async function MobileHome() {
  const now = new Date();
  // Con sesión, todo es real. La vista DEMO solo aplica si está la bandera
  // MOBILE_DEMO_PREVIEW=1 (por defecto off: sin sesión el layout ya redirige a /m/login,
  // así que aquí siempre hay usuario). getDashboardData({previewDemo}) usa el camino de
  // datos de ejemplo del dashboard; los movimientos (que exigen sesión) se omiten.
  const user = await getUser();
  const preview = !user && process.env.MOBILE_DEMO_PREVIEW === "1";
  const data = await getDashboardData({ previewDemo: preview });
  const recent = preview
    ? ([] as Transaction[])
    : await listTransactions(recentPeriod(now), {}, 6).catch(() => [] as Transaction[]);

  // Presupuesto del mes para la primera tarjeta. Es el agregador más barato de los
  // siete (cero llamadas de red) y va en paralelo con los movimientos, así que no
  // añade latencia a la carga: el arranque sigue costando lo que costaba.
  const expenseView = preview
    ? null
    : await getExpenseRangeView("1m", monthPeriod(now.getFullYear(), now.getMonth() + 1)).catch(() => null);

  const { currency, panel, insights } = data;
  const ind = data.summary.indicators;
  const norte = panel.norte;
  const firstInsight = insights.insights[0];

  return (
    <div className="m-scroll">
      <div className="m-pad">
        {preview && (
          <Link
            href="/m/login"
            className="wgt"
            style={{
              display: "block",
              marginBottom: 14,
              background: "var(--warning-soft)",
              borderColor: "color-mix(in srgb, var(--warning) 30%, var(--border))",
              padding: "12px 16px",
            }}
          >
            <div className="wlabel" style={{ color: "var(--warning)" }}>
              Vista demo · sin sesión
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>
              Datos de ejemplo. Inicia sesión para ver los tuyos. →
            </div>
          </Link>
        )}
        {/* Header sticky de cristal unificado (variant home): logo + saludo + chat/campana/menú. */}
        <MobileHeader variant="home" greeting={greeting(now)} name={data.name} />

        {/* Carrusel de tarjetas financieras (sustituye al hero de patrimonio).
            El carrusel entero va DENTRO de .m-pad pero su pista sangra a los bordes
            (.m-carousel-wrap) para que la tarjeta siguiente asome: esa es la
            afordancia de que se desliza.

            En esta fase hay dos tarjetas, y ninguna añade una llamada: Presupuesto usa
            getExpenseRangeView (solo BD, el agregador más barato de los siete) y
            Patrimonio reusa los datos que Inicio ya cargaba para el hero. Las otras
            cinco entran en la Fase 2 envueltas cada una en su <Suspense>, para que la
            cara —getPortfolioReport, con precios en vivo y timeout de 3 s por
            proveedor— degrade SU tarjeta y no el arranque de la app. */}
        <div style={{ marginBottom: 14 }}>
          <MHomeCarousel
            cards={[
              {
                name: "Presupuesto",
                node: (
                  <BudgetCard
                    budget={expenseView?.budgetExpense ?? 0}
                    spent={expenseView?.realExpense ?? 0}
                    currency={currency}
                    now={now}
                  />
                ),
              },
              {
                name: "Patrimonio",
                node: (
                  <NetWorthCard
                    netWorth={norte.netWorth}
                    velocity={norte.velocity}
                    income={ind.incomeMonthly}
                    expense={ind.expenseMonthly}
                    flow={ind.freeCashflow}
                    currency={currency}
                  />
                ),
              },
            ]}
          />
        </div>

        {/* Accesos rápidos: los 4 pilares reales, enlazados a su pantalla móvil (/m/*). */}
        <div className="action-strip" style={{ marginBottom: 16 }}>
          {panel.pillars.map((p) => (
            <Link key={p.key} href={M_ROUTE[p.key] ?? p.href} className="qact">
              <span className="qc" style={{ color: p.accent }}>
                <PillarIcon k={p.key} />
              </span>
              <span>{M_LABEL[p.key] ?? p.label}</span>
            </Link>
          ))}
        </div>

        {/* Alerta de próxima acción (real: insights.nextBestAction) */}
        <Link href="/m/patrimonio" className="wgt wgt-nba" style={{ marginBottom: 14 }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 13 }}>
            <span
              className="wic"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              aria-hidden
            >
              <StarIcon />
            </span>
            <div style={{ flex: 1 }}>
              <div className="wlabel" style={{ color: "var(--accent)" }}>
                Próxima mejor acción
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 5, lineHeight: 1.4 }}>
                {insights.nextBestAction}
              </div>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.4}
              style={{ width: 18, height: 18, flex: "none", marginTop: 4 }}
              aria-hidden
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </Link>

        {/* Un insight (real: primer insight del engine) */}
        {firstInsight && (
          <div className="wgt" style={{ marginBottom: 16 }}>
            <div className="between" style={{ marginBottom: 8 }}>
              <span className="wlabel">{firstInsight.h}</span>
              <span className="wic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
                <StarIcon />
              </span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{firstInsight.d}</div>
          </div>
        )}

        {/* Movimientos recientes (reales) */}
        <section>
          <div className="between" style={{ marginBottom: 10 }}>
            <div className="sec-title">Movimientos recientes</div>
          </div>
          <div className="wgt" style={{ padding: "4px 18px" }}>
            {recent.length === 0 ? (
              <div className="muted" style={{ padding: "16px 0", fontSize: 13.5 }}>
                Aún no hay movimientos recientes. Registra un gasto o ingreso para empezar.
              </div>
            ) : (
              recent.map((t) => <MovementRow key={t.id} t={t} now={now} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


function MovementRow({ t, now }: { t: Transaction; now: Date }) {
  const income = t.kind === "ingreso";
  const sign = income ? "+" : t.kind === "gasto" ? "−" : "";
  const name = t.merchantOrSource || t.description || KIND_LABEL[t.kind];
  return (
    <div className="lrow">
      <span
        className="lic"
        style={income ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
        aria-hidden
      >
        {income ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
            <path d="M6 6 5 3H3M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <div>
        <div className="lname">{name}</div>
        <div className="lsub">
          {KIND_LABEL[t.kind]} · {relativeDay(t.occurredOn, now)}
        </div>
      </div>
      <div className={`lamt ${income ? "pos" : ""}`}>
        {sign}
        {formatMoney(Math.abs(t.amount), t.currency)}
      </div>
    </div>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 19, height: 19 }}>
      <path d="M12 2 9.6 8.4 3 9.2l4.9 4.4L6.4 21 12 17.3 17.6 21l-1.5-7.4L21 9.2l-6.6-.8Z" />
    </svg>
  );
}

function PillarIcon({ k }: { k: "flujo" | "ahorro" | "deudas" | "inversiones" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  if (k === "inversiones") {
    return (
      <svg {...common}>
        <path d="M3 17l6-6 4 4 8-9M14 6h6v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (k === "ahorro") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    );
  }
  if (k === "deudas") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" />
    </svg>
  );
}
