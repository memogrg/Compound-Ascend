"use client";

/**
 * Pestaña «Decisiones»: las tres preguntas que una recomendación deja abiertas.
 *
 *  (a) ¿Abonar o invertir el excedente? — se REUTILIZA <SurplusDecision>, que ya se renderiza en
 *      el servidor y llega acá como nodo. Duplicarlo sería tener dos versiones de la misma
 *      matemática, y tarde o temprano una de las dos mentiría.
 *  (b) ¿Avalancha, bola de nieve o híbrido? — la tabla con el puesto de cada deuda en cada
 *      método, y el veredicto del motor. Si los dos métodos dan el mismo orden, se dice: elegir
 *      entre dos caminos idénticos es una decisión falsa.
 *  (c) ¿Pausar un objetivo? — las dos columnas, con la misma amortización de la deuda.
 *
 * El selector de deuda navega (`?deuda=`) en vez de recalcular en el cliente: así el número lo
 * sigue produciendo el mismo servicio del servidor y no hay una segunda implementación.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
// Tipo desde el servicio y no desde el barrel: el barrel exporta ActionsView, que llega hasta
// acá, y un import (aunque sea de tipos) cerraría el círculo.
import type { DecisionsView } from "@/modules/actions/services/actions-service";

const METODO_LABEL: Record<string, string> = {
  avalancha: "Avalancha (primero la tasa más alta)",
  bola_nieve: "Bola de nieve (primero el saldo más chico)",
  hibrido: "Híbrido (dos victorias rápidas, después la tasa)",
};

function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "setiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return `${meses[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;
}

export function DecisionsTab({
  view,
  comparador,
}: {
  view: DecisionsView;
  /** <SurplusDecision report={…}/> ya renderizado en el servidor. */
  comparador: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const c = (n: number) => formatMoney(n, view.currency);

  const elegirDeuda = (id: string) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("tab", "decisiones");
    if (id) next.set("deuda", id);
    else next.delete("deuda");
    start(() => router.replace(`/mis-acciones?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* (a) El excedente. */}
      <section>
        {view.selectable.length > 1 ? (
          <label className="acc-select">
            <span className="muted">Comparar contra</span>
            <select
              value={view.selectedDebtId ?? ""}
              disabled={pending}
              onChange={(e) => elegirDeuda(e.target.value)}
            >
              <option value="">Automático (la que más te cuesta)</option>
              {view.selectable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.apr}%
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {comparador}
      </section>

      {/* (b) La estrategia de deudas. */}
      {view.debts.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">¿Avalancha, bola de nieve o híbrido?</div>
              <div className="card-sub">
                El mismo saldo, dos órdenes de ataque. La diferencia es cuánto interés pagás y
                cuándo ves la primera victoria.
              </div>
            </div>
          </div>
          <div className="acc-table-wrap">
            <table className="acc-table">
              <thead>
                <tr>
                  <th>Deuda</th>
                  <th>Saldo</th>
                  <th>Tasa</th>
                  <th>Cuota</th>
                  <th>Avalancha</th>
                  <th>Bola de nieve</th>
                </tr>
              </thead>
              <tbody>
                {view.debts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="mono">{c(d.balance)}</td>
                    <td className="mono">{d.apr}%</td>
                    <td className="mono">{c(d.payment)}</td>
                    <td className="mono">#{d.ordenAvalancha}</td>
                    <td className="mono">#{d.ordenBolaNieve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="acc-verdict">
            {view.methodsAgree ? (
              <p>
                <strong>Los dos métodos coinciden</strong> en el orden de ataque: no hay nada que
                elegir acá. Empezá por la #1 y seguí bajando.
              </p>
            ) : null}
            {view.method ? (
              <p>
                <strong>{METODO_LABEL[view.method.method] ?? view.method.method}:</strong>{" "}
                {view.method.reason}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* (c) Pausar un objetivo. */}
      {view.pauses.map((p) => (
        <section key={p.goalId} className="card card-pad">
          <div className="card-title" style={{ fontSize: 15 }}>
            ¿Y si pauso &quot;{p.goalName}&quot;?
          </div>
          <div className="card-sub" style={{ marginBottom: 12 }}>
            {p.reason} Son {c(p.monthly)}/mes.
          </div>
          <div className="acc-two">
            <div className="acc-two-col acc-two-a">
              <div className="eyebrow">Si lo pausás 90 días</div>
              <div className="acc-two-v">{c(p.interestSaved)}</div>
              <div className="muted">de interés que no pagás en {p.debtName}</div>
              <ul>
                <li>Liquidás {p.monthsSaved} meses antes</li>
                <li>Fecha de liquidación: {fechaLarga(p.payoffPausando)}</li>
                <li>Tu objetivo se corre ~{p.goalShiftMonths} meses</li>
              </ul>
            </div>
            <div className="acc-two-col">
              <div className="eyebrow">Si lo mantenés</div>
              <div className="acc-two-v">{c(0)}</div>
              <div className="muted">de interés ahorrado</div>
              <ul>
                <li>La deuda sigue su curso</li>
                <li>Fecha de liquidación: {fechaLarga(p.payoffManteniendo)}</li>
                <li>Tu objetivo llega en la fecha prevista</li>
              </ul>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            Las dos columnas son válidas. Pausar compra intereses; mantener compra el objetivo a
            tiempo. La decisión es tuya.
          </p>
        </section>
      ))}
    </div>
  );
}
