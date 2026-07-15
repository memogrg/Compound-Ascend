import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getDashboardData } from "@/modules/dashboard";
import { listTransactions, type Transaction, type Period } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";
import { MobileMenu } from "../components/mobile-menu";

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

/** Labels canónicos (nav.ts) para los accesos rápidos: el pilar "flujo" es Gastos, etc. */
const M_LABEL: Record<string, string> = {
  flujo: "Gastos",
  ahorro: "Ahorro",
  deudas: "Deudas y Préstamos",
  inversiones: "Portafolio de inversiones",
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
        {/* Header: saludo + nombre real. Piloto "Cristal Cálido": topbar de cristal que
            escarcha el contenido al hacer scroll (chrome, con fallback sólido garantizado). */}
        <header className="between m-topbar m-glass" style={{ marginBottom: 18, padding: "12px 14px" }}>
          <div className="row">
            <span className="iso" aria-hidden>
              <svg viewBox="0 0 64 64" fill="none">
                <path
                  d="M44 19 A 18 18 0 1 0 44 45"
                  stroke="currentColor"
                  strokeWidth={6.4}
                  strokeLinecap="round"
                  fill="none"
                />
                <path d="M45 27 V37 M40 32 H50" stroke="#51AF6F" strokeWidth={3.6} strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                {greeting(now)}
              </div>
              <div className="m-greeting">{data.name}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {/* Acceso al Asistente IA (chat + escáner de recibos) */}
            <Link href="/m/asistente" className="icon-btn" aria-label="Asistente IA" title="Asistente IA">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
                <path d="M12 8.5v4M10 10.5h4" />
              </svg>
            </Link>
            {/* Menú de navegación (replica el sidebar web) */}
            <MobileMenu />
          </div>
        </header>

        {/* Hero: patrimonio neto + mini-tendencia del mes */}
        <Link href="/m/patrimonio" className="wgt-nw" style={{ marginBottom: 14 }}>
          <div className="between">
            <span className="wlabel">Patrimonio neto</span>
            {norte.velocity != null && (
              <span className={`wchip ${norte.velocity >= 0 ? "pos" : "neg"}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  style={{ width: 11, height: 11 }}
                >
                  {norte.velocity >= 0 ? (
                    <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
                {formatMoney(norte.velocity, currency)}
              </span>
            )}
          </div>
          <div className="hero-amt">
            {norte.netWorth != null ? formatMoney(norte.netWorth, currency) : "—"}
          </div>
          <div className="row" style={{ marginTop: 13, gap: 16 }}>
            <MiniStat label="Ingresos" value={formatMoney(ind.incomeMonthly, currency)} cls="pos" />
            <span className="hero-divider" />
            <MiniStat label="Gastos" value={formatMoney(ind.expenseMonthly, currency)} cls="neg" />
            <span className="hero-divider" />
            <MiniStat
              label="Flujo"
              value={formatMoney(ind.freeCashflow, currency)}
              cls={ind.freeCashflow >= 0 ? "pos" : "neg"}
            />
          </div>
          {/* mini-tendencia decorativa (la serie real llega en un delta posterior) */}
          <svg viewBox="0 0 320 54" preserveAspectRatio="none" className="spark" aria-hidden>
            <defs>
              <linearGradient id="m-hg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,44 C40,40 60,36 90,30 C130,22 150,26 190,18 C230,12 260,14 320,4"
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <path
              d="M0,44 C40,40 60,36 90,30 C130,22 150,26 190,18 C230,12 260,14 320,4 L320,54 L0,54 Z"
              fill="url(#m-hg)"
            />
          </svg>
        </Link>

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

function MiniStat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className={`mono ${cls ?? ""}`} style={{ fontSize: 13.5, marginTop: 2 }}>
        {value}
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
