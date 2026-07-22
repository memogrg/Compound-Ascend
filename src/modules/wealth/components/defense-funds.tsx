"use client";

/**
 * Fondos de defensa (F2): lectura + brecha de emergencia y paz, con recomendación mensual,
 * ajuste de peaceMonths (3-6, recálculo en vivo), tooltips y el pop-up del caso hipoteca.
 *
 * La app INFORMA, no ordena: muestra objetivo, progreso y cuánto apartar/mes; el usuario decide.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { HelpTip } from "@/components/shared/help-tip";
import { setPeaceMonthsAction } from "@/modules/wealth/api/actions";
import {
  PEACE_MONTHS_MIN,
  PEACE_MONTHS_MAX,
  type DefenseFundsPlan,
  type FundSizing,
} from "@/modules/wealth/engine/fund-sizing";

type Report = DefenseFundsPlan & { currency: string };

const EMERGENCY_HELP =
  "Colchón de arranque para un imprevisto puntual (una emergencia médica, un electrodoméstico roto). Recomendado $1.000. No se dimensiona por meses.";
const PEACE_HELP =
  "Reserva para cubrir varios meses de tus gastos esenciales si tu ingreso se detiene. Se dimensiona como N meses de gasto esencial (vos elegís N, 3-6).";

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", background: color }} />
    </div>
  );
}

function FundCard({
  title,
  help,
  fund,
  currency,
  priority,
  note,
}: {
  title: string;
  help: string;
  fund: FundSizing;
  currency: string;
  priority?: boolean;
  note?: string;
}) {
  const color = fund.covered ? "var(--pos)" : priority ? "var(--accent)" : "var(--gold)";
  return (
    <div className="card card-pad" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <div className="card-title" style={{ fontSize: 15 }}>
          {title} <HelpTip text={help} />
        </div>
        {fund.covered ? (
          <span style={{ color: "var(--pos)", fontSize: 12.5, fontWeight: 600 }}>Cubierto ✓</span>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
        <div>
          <div className="label">Acumulado</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(fund.current, currency)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label">Objetivo</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-2)" }}>
            {formatMoney(fund.target, currency)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <Bar pct={fund.progressPct} color={color} />
      </div>

      {!fund.covered ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
          Te faltan <strong>{formatMoney(fund.gap, currency)}</strong>.{" "}
          {fund.recommendedMonthly > 0 ? (
            <>
              Para cerrarlo, apartá{" "}
              <strong>{formatMoney(fund.recommendedMonthly, currency)}/mes</strong> durante ~12 meses.
            </>
          ) : note ? (
            note
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DefenseFunds({ report, mortgageCase }: { report: Report; mortgageCase: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { emergency, peace, currency } = report;

  // Pop-up del caso hipoteca: una vez, descartable. Recordamos el descarte en localStorage
  // (por-dispositivo; el objetivo es no ser intrusivo, no un candado duro).
  const showable = mortgageCase && !peace.covered;
  const [showPopup, setShowPopup] = useState(false);
  useEffect(() => {
    if (!showable) return;
    if (typeof window !== "undefined" && window.localStorage.getItem("ca_peace_mortgage_dismissed")) return;
    setShowPopup(true);
  }, [showable]);
  const dismissPopup = () => {
    setShowPopup(false);
    if (typeof window !== "undefined") window.localStorage.setItem("ca_peace_mortgage_dismissed", "1");
  };

  const onMonths = (months: number) =>
    startTransition(async () => {
      await setPeaceMonthsAction(months);
      router.refresh();
    });

  const mortgageNote =
    "Aunque saliste de deudas de consumo, tu hipoteca es una obligación fija que sigue si tu ingreso se detiene. " +
    `Por eso conviene tener ${peace.months} meses de reserva: para cubrir tus gastos esenciales y la cuota sin angustia. Es tu paz mental.`;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card-title" style={{ fontSize: 16 }}>
        Tus fondos de defensa
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
        Primero el fondo de emergencia; luego el de paz. Te decimos el objetivo y cuánto apartar por
        mes — la decisión es tuya.
      </div>

      <FundCard
        title="Fondo de emergencia"
        help={EMERGENCY_HELP}
        fund={emergency}
        currency={currency}
        priority
      />

      <FundCard
        title="Fondo de paz"
        help={PEACE_HELP}
        fund={peace}
        currency={currency}
        note={
          peace.blockedByEmergency
            ? "Primero completá tu fondo de emergencia; después empezás con el de paz."
            : undefined
        }
      />

      {/* Ajuste de meses del fondo de paz (recálculo en vivo). */}
      <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5 }}>
          Dimensioná tu fondo de paz en{" "}
          <select
            value={peace.months}
            disabled={pending}
            onChange={(e) => onMonths(Number(e.target.value))}
            className="sel"
            style={{ width: "auto", display: "inline-block", padding: "4px 8px" }}
          >
            {Array.from({ length: PEACE_MONTHS_MAX - PEACE_MONTHS_MIN + 1 }, (_, i) => PEACE_MONTHS_MIN + i).map(
              (n) => (
                <option key={n} value={n}>
                  {n} meses
                </option>
              ),
            )}
          </select>{" "}
          de gasto esencial.
        </div>
        {pending ? <span className="muted" style={{ fontSize: 12 }}>Recalculando…</span> : null}
      </div>

      {/* Lectura del caso hipoteca (inline, siempre visible cuando aplica). */}
      {mortgageCase && !peace.covered ? (
        <div className="card card-pad" style={{ background: "var(--accent-soft)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
            Tenés una hipoteca — por eso la reserva importa
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            {mortgageNote}
          </div>
        </div>
      ) : null}

      <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Estas son recomendaciones para orientarte, no una orden ni asesoría financiera. Vos elegís tu
        objetivo y tu ritmo.
      </div>

      {/* Pop-up informativo del caso hipoteca (una vez, descartable). */}
      {showPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={dismissPopup}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            className="card card-pad"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420, background: "var(--surface)" }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Tu paz mental</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {mortgageNote}
            </p>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
              Tu objetivo: <strong>{formatMoney(peace.target, currency)}</strong>. Apartá{" "}
              {peace.blockedByEmergency ? (
                <>primero completá tu fondo de emergencia.</>
              ) : (
                <>
                  <strong>{formatMoney(peace.recommendedMonthly, currency)}/mes</strong> para cerrarlo
                  en ~12 meses.
                </>
              )}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={dismissPopup}
              style={{ marginTop: 14 }}
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
