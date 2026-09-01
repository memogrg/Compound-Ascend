"use client";

/**
 * El cerebro de la calculadora de préstamos: estado del formulario + la simulación derivada.
 *
 * Vive acá y no dentro de una pantalla porque las DOS pieles —la de escritorio y la del móvil—
 * usan exactamente este hook. Si la lógica estuviera en el componente web, el móvil tendría que
 * reimplementarla y las dos versiones se irían separando con el primer arreglo que se le hiciera
 * a una sola.
 *
 * Todo se recalcula en cada tecla: el motor es puro y una tabla de 360 meses es trabajo
 * despreciable, así que no hay debounce ni botón de "calcular" que meter en el medio.
 *
 * Importa el engine DIRECTO y no el barrel del módulo: el barrel arrastra servicios `server-only`
 * y romperían el build del cliente.
 */

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  buildDebtSimInsights,
  escenarioParaAsesor,
  isSimulable,
  shorterTermOptions,
  simulateLoan,
  type LoanSim,
  type LoanSimInput,
  type ShorterTerm,
  type SimContext,
  type SimInsight,
  type Voz,
} from "@/modules/control/engine/debt-sim-insights";

export type TermUnit = "anos" | "meses";

/**
 * Un ejemplo con el que abrir, para que la pantalla muestre una tabla real desde el primer
 * segundo en vez de un formulario vacío. El capital se elige por moneda: 10 millones tiene
 * sentido en colones y sería absurdo en dólares.
 */
function ejemploPorMoneda(currency: string): { principal: number; apr: number; anos: number } {
  const grande = ["CRC", "COP", "CLP", "MXN"].includes(currency);
  return { principal: grande ? 10_000_000 : 20_000, apr: 12, anos: 15 };
}

/** Los números que se escriben a mano vienen como texto; acá se leen sin sorpresas. */
function num(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export interface LoanCalculator {
  principal: string;
  setPrincipal: (v: string) => void;
  apr: string;
  setApr: (v: string) => void;
  term: string;
  setTerm: (v: string) => void;
  termUnit: TermUnit;
  setTermUnit: (u: TermUnit) => void;
  insurance: string;
  setInsurance: (v: string) => void;
  currency: string;
  setCurrency: (c: string) => void;

  /** Lo que se le pasa al engine, ya normalizado a meses. */
  input: LoanSimInput;
  sim: LoanSim;
  shorter: ShorterTerm[];
  insights: SimInsight[];
  /** ¿Hay datos suficientes para mostrar resultados? */
  ready: boolean;
  /** Formateador de moneda de la simulación (la piel lo reusa para no divergir). */
  fmt: (n: number) => string;
  /** El escenario redactado para mandárselo al asesor. */
  escenario: string;
  /** Adopta uno de los plazos comparados (el botón "usar este plazo"). */
  usarPlazo: (termMonths: number) => void;
}

export function useLoanCalculator(opts: {
  /** Moneda de visualización: la que se ofrece por defecto. */
  currency: string;
  /** Datos reales del usuario para la lectura de capacidad. `null` = no hay. */
  context?: SimContext | null;
  /** Segunda persona de las lecturas: voseo en web (por defecto), "tú" en móvil. */
  voz?: Voz;
}): LoanCalculator {
  const ejemplo = ejemploPorMoneda(opts.currency);

  const [principal, setPrincipal] = useState(String(ejemplo.principal));
  const [apr, setApr] = useState(String(ejemplo.apr));
  const [term, setTerm] = useState(String(ejemplo.anos));
  const [termUnit, setTermUnit] = useState<TermUnit>("anos");
  const [insurance, setInsurance] = useState("0");
  const [currency, setCurrency] = useState(opts.currency);

  const termMonths = useMemo(() => {
    const v = num(term);
    // Los años admiten medios (4,5 años = 54 meses); los meses se redondean a entero.
    return termUnit === "anos" ? Math.round(v * 12) : Math.round(v);
  }, [term, termUnit]);

  const input = useMemo<LoanSimInput>(
    () => ({
      principal: num(principal),
      aprPct: num(apr),
      termMonths,
      insuranceMonthly: num(insurance),
    }),
    [principal, apr, termMonths, insurance],
  );

  const sim = useMemo(() => simulateLoan(input), [input]);
  const shorter = useMemo(() => shorterTermOptions(input, sim), [input, sim]);

  // Sin decimales el resumen se lee de un vistazo; en dólares dos decimales sí aportan.
  const fmt = useMemo(() => {
    const dec = ["CRC", "COP", "CLP", "MXN"].includes(currency) ? 0 : 2;
    return (n: number) => formatMoney(n, currency, dec);
  }, [currency]);

  const insights = useMemo(
    () =>
      buildDebtSimInsights({
        input,
        sim,
        shorter,
        context: opts.context ?? null,
        fmt,
        voz: opts.voz,
      }),
    [input, sim, shorter, opts.context, opts.voz, fmt],
  );

  const escenario = useMemo(
    () => escenarioParaAsesor({ input, sim, currency, fmt, voz: opts.voz }),
    [input, sim, currency, fmt, opts.voz],
  );

  const usarPlazo = (meses: number) => {
    if (termUnit === "anos" && meses % 12 === 0) setTerm(String(meses / 12));
    else {
      setTermUnit("meses");
      setTerm(String(meses));
    }
  };

  return {
    principal,
    setPrincipal,
    apr,
    setApr,
    term,
    setTerm,
    termUnit,
    setTermUnit,
    insurance,
    setInsurance,
    currency,
    setCurrency,
    input,
    sim,
    shorter,
    insights,
    ready: isSimulable(input) && sim.months > 0,
    fmt,
    escenario,
    usarPlazo,
  };
}
