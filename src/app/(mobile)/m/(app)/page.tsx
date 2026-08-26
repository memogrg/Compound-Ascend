import Link from "next/link";
import { getUser } from "@/lib/auth/session";
import { getDashboardData, getHomeCardsData } from "@/modules/dashboard";
import { userHour, userCurrentPeriod, userToday } from "@/lib/time/user-time";
import { listTransactions, type Transaction, type Period } from "@/modules/financial-base";
import { loadBaseView } from "@/modules/financial-base/services/base-view";
import { getExpenseJarsAsOf } from "@/modules/financial-base/services/expense-jars-service";
import { getLiquidityAfterByTxn } from "@/modules/financial-base/services/liquidity-service";
import { selectableCategoryLeaves } from "@/modules/financial-base/engine/classify";
import { ManagedTxnRows } from "./transacciones/mobile-txn-list";
import { MHomeCarousel } from "../components/home-carousel";
import {
  PresupuestoFicha,
  IngresosFicha,
  GastosFicha,
  AhorrosFicha,
  DeudasFicha,
  InversionesFicha,
  ProteccionFicha,
  PatrimonioFicha,
  LibertadFicha,
} from "../components/home-cards/ficha-cards";
import { MHomeCardError } from "../components/home-cards/card-shell";
import { MobileHeader } from "../components/mobile-header";
import { HomeAddLauncher } from "../components/home-add-launcher";
import { SetupHub, getSetupProgress } from "@/modules/setup";

/**
 * Pantalla de Inicio del móvil (/m) — "centro de mando" del diseño
 * (design-movil/project/CARTERA Movil.html, sección data-screen="inicio"),
 * con DATOS REALES: reutiliza los mismos services/engine de escritorio vía los
 * barrels (dashboard + financial-base), sin reimplementar cálculos. Texto es-MX, tú.
 */
export const dynamic = "force-dynamic"; // datos por sesión/usuario: nunca estático

function greeting(h: number): string {
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

  // Agregados EN PARALELO, cada uno con su propio `.catch`: si uno falla, los demás siguen.
  // `data` (panel) alimenta el saludo, los accesos y la próxima acción; `homeCards` (Delta 1)
  // alimenta las 9 fichas; `view`+`liq` dan a "Movimientos recientes" la MISMA capacidad que
  // Transacciones (editar/borrar + detalle del viaje del dinero).
  const [data, recent, homeCards, view, liq] = await Promise.all([
    getDashboardData({ previewDemo: preview }),
    preview
      ? Promise.resolve([] as Transaction[])
      : listTransactions(recentPeriod(now), {}, 6).catch(() => [] as Transaction[]),
    preview ? Promise.resolve(null) : getHomeCardsData().catch(() => null),
    preview ? Promise.resolve(null) : loadBaseView().catch(() => null),
    preview ? Promise.resolve(null) : getLiquidityAfterByTxn().catch(() => null),
  ]);

  const { panel, insights } = data;

  // Datos de EDICIÓN de las filas recientes (mismos que Transacciones, vía loadBaseView). Los
  // jars —para el sobre del editor— dependen del árbol de la vista, así que van en una lectura
  // aparte. Sin sesión/vista (demo) queda null y la sección cae a su mensaje vacío.
  const recentJars = view
    ? await getExpenseJarsAsOf({
        tree: view.tree,
        period: await userCurrentPeriod(),
        asOf: await userToday(),
        currency: view.currency,
      }).catch(() => [])
    : [];

  // Hub de configuración (paridad con el panel web): mismo motor, mismo estado
  // derivado del dato real. Best-effort: sin sesión o si falla, no se pinta.
  const setupProgress = preview ? [] : await getSetupProgress().catch(() => []);

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
        <MobileHeader variant="home" greeting={greeting(await userHour())} name={data.name} />

        {/* Hub de los cuatro asistentes. Se colapsa solo cuando todo está listo. */}
        {setupProgress.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            <SetupHub progress={setupProgress} mobile />
          </div>
        ) : null}

        {/* El "Flujo del mes" ya no va como strip suelto: es la PRIMERA ficha del carrusel
            (misma cifra que este strip mostraba), así no se repite el número. */}

        {/* Carrusel de las 9 fichas del brief lockeado (piloto · Delta 2), sobre el mismo
            chasis compartido (MHomeCard) y en el orden fijo: Presupuesto · Ingresos ·
            Gastos · Ahorros · Deudas · Inversiones · Protección · Patrimonio · Libertad
            (Patrimonio y Libertad al final). Los datos vienen de getHomeCardsData (Delta 1);
            si esa capa no cargó (`null`: vista demo o fallo), cada ficha degrada a su estado
            "no cargó". El destino /m/* de cada ficha viaja en su propio `href`. La mecánica
            del carrusel (swipe, dots) es la misma: MHomeCarousel no se toca.

            La pista sangra a los bordes (.m-carousel-wrap) para que la ficha siguiente asome
            —esa es la afordancia de que se desliza—. */}
        <div style={{ marginBottom: 14 }}>
          <MHomeCarousel
            cards={[
              {
                name: "Flujo del mes",
                node: homeCards?.presupuesto ? (
                  <PresupuestoFicha c={homeCards.presupuesto} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Flujo del mes" icon="rules" />
                ),
              },
              {
                name: "Ingresos",
                node: homeCards?.ingresos ? (
                  <IngresosFicha c={homeCards.ingresos} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Ingresos" icon="income" />
                ),
              },
              {
                name: "Gastos",
                node: homeCards?.gastos ? (
                  <GastosFicha c={homeCards.gastos} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Gastos" icon="food" />
                ),
              },
              {
                name: "Ahorros",
                node: homeCards?.ahorros ? (
                  <AhorrosFicha c={homeCards.ahorros} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Ahorros" icon="goal" />
                ),
              },
              {
                name: "Deudas",
                node: homeCards?.deudas ? (
                  <DeudasFicha c={homeCards.deudas} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Deudas" icon="debt" />
                ),
              },
              {
                name: "Inversiones",
                node: homeCards?.inversiones ? (
                  <InversionesFicha c={homeCards.inversiones} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Inversiones" icon="investment" />
                ),
              },
              {
                name: "Protección",
                node: homeCards?.proteccion ? (
                  <ProteccionFicha c={homeCards.proteccion} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Protección" icon="protection" />
                ),
              },
              {
                name: "Patrimonio",
                node: homeCards?.patrimonio ? (
                  <PatrimonioFicha c={homeCards.patrimonio} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Patrimonio" icon="household" />
                ),
              },
              {
                name: "Libertad",
                node: homeCards?.libertad ? (
                  <LibertadFicha c={homeCards.libertad} currency={homeCards.currency} />
                ) : (
                  <MHomeCardError eyebrow="Libertad" icon="goal" />
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

        {/* Movimientos recientes: MISMA capacidad que Transacciones — swipe editar/borrar en las
            filas gestionables + tap→detalle del viaje del dinero (origen→destino, efecto en
            liquidez, "Ver en X" para vinculadas). Reusa ManagedTxnRows. */}
        <section>
          <div className="between" style={{ marginBottom: 10 }}>
            <div className="sec-title">Movimientos recientes</div>
          </div>
          {view && recent.length > 0 ? (
            <ManagedTxnRows
              transactions={recent}
              currency={view.currency}
              categoryNames={view.categoryNames}
              categories={selectableCategoryLeaves(view.categories)}
              jars={recentJars}
              accounts={view.accounts}
              incomeCats={view.incomeTree
                .flatMap((g) => g.children)
                .map((c) => ({ id: c.id, name: c.name }))}
              incomeGroupId={view.incomeTree[0]?.id ?? null}
              balanceAfter={liq?.afterByTxn}
            />
          ) : (
            <div className="wgt" style={{ padding: "4px 18px" }}>
              <div className="muted" style={{ padding: "16px 0", fontSize: 13.5 }}>
                Aún no hay movimientos recientes. Registra un gasto o ingreso para empezar.
              </div>
            </div>
          )}
        </section>
      </div>
      {/* El "+" de Inicio. Va FUERA de .m-pad: se posiciona respecto al scroll, no al
          contenido, para quedarse fijo sobre la barra inferior. */}
      {preview ? null : <HomeAddLauncher />}
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
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
  } as const;
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
