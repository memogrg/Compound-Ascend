"use client";

/**
 * Fondos de defensa en móvil (F2, paridad con la web): lectura + brecha de emergencia y paz,
 * recomendación mensual, ajuste de peaceMonths (3-6, recálculo en vivo), tooltips y el pop-up
 * del caso hipoteca. es-MX "tú". La app informa, no ordena.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpTip } from "@/components/shared/help-tip";
// Import DIRECTO de la server action (no del barrel @/modules/wealth, que arrastra server-only
// y rompe el build de este client component). Ver memoria: barrel-server-only-en-client.
import { setPeaceMonthsAction } from "@/modules/wealth/api/actions";
import {
  PEACE_MONTHS_MIN,
  PEACE_MONTHS_MAX,
  type DefenseFundsPlan,
  type FundSizing,
} from "@/modules/wealth/engine/fund-sizing";
import { MSectionHeader, MContentCard, MProgress, mAmount } from "../../components/content-kit";

type Report = DefenseFundsPlan & { currency: string };

const EMERGENCY_HELP =
  "Colchón de arranque para un imprevisto puntual (una emergencia médica, un electrodoméstico roto). Recomendado $1,000. No se dimensiona por meses.";
const PEACE_HELP =
  "Reserva para cubrir varios meses de tus gastos esenciales si tu ingreso se detiene. Se dimensiona como N meses de gasto esencial (tú eliges N, 3-6).";

function FundBlock({
  title,
  help,
  fund,
  currency,
  note,
}: {
  title: string;
  help: string;
  fund: FundSizing;
  currency: string;
  note?: string;
}) {
  return (
    <MContentCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>
          {title} <HelpTip text={help} />
        </div>
        {fund.covered ? (
          <span style={{ color: "var(--pos)", fontSize: 12.5, fontWeight: 600 }}>Cubierto ✓</span>
        ) : null}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{mAmount(fund.current, currency)}</div>
        <div className="muted" style={{ fontSize: 13 }}>de {mAmount(fund.target, currency)}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <MProgress value={fund.progressPct} height={8} />
      </div>
      {!fund.covered ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
          Te faltan <strong>{mAmount(fund.gap, currency)}</strong>.{" "}
          {fund.recommendedMonthly > 0 ? (
            <>
              Aparta <strong>{mAmount(fund.recommendedMonthly, currency)}/mes</strong> por ~12 meses.
            </>
          ) : note ? (
            note
          ) : null}
        </div>
      ) : null}
    </MContentCard>
  );
}

export function DefenseFundsMobile({ report, mortgageCase }: { report: Report; mortgageCase: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { emergency, peace, currency } = report;

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
    <div style={{ marginTop: 8 }}>
      <MSectionHeader title="Tus fondos de defensa" />
      <div className="muted" style={{ fontSize: 12.5, margin: "-4px 0 8px" }}>
        Primero el fondo de emergencia; luego el de paz. Te decimos cuánto apartar — tú decides.
      </div>

      <FundBlock title="Fondo de emergencia" help={EMERGENCY_HELP} fund={emergency} currency={currency} />
      <div style={{ height: 10 }} />
      <FundBlock
        title="Fondo de paz"
        help={PEACE_HELP}
        fund={peace}
        currency={currency}
        note={peace.blockedByEmergency ? "Primero completa tu fondo de emergencia." : undefined}
      />

      <MContentCard style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13.5 }}>
          Dimensiona tu fondo de paz en{" "}
          <select
            className="m-select"
            value={peace.months}
            disabled={pending}
            onChange={(e) => onMonths(Number(e.target.value))}
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
          {pending ? <span className="muted" style={{ fontSize: 12 }}> Recalculando…</span> : null}
        </div>
      </MContentCard>

      {mortgageCase && !peace.covered ? (
        <MContentCard style={{ marginTop: 10, background: "var(--accent-soft)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
            Tienes una hipoteca — por eso la reserva importa
          </div>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            {mortgageNote}
          </div>
        </MContentCard>
      ) : null}

      <div className="muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
        Son recomendaciones para orientarte, no una orden ni asesoría financiera. Tú eliges tu meta y
        tu ritmo.
      </div>

      {showPopup ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={dismissPopup}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(0,0,0,.5)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div className="card card-p" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 8 }}>Tu paz mental</div>
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {mortgageNote}
            </p>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
              Tu meta: <strong>{mAmount(peace.target, currency)}</strong>.{" "}
              {peace.blockedByEmergency
                ? "Primero completa tu fondo de emergencia."
                : `Aparta ${mAmount(peace.recommendedMonthly, currency)}/mes para cerrarla en ~12 meses.`}
            </p>
            <button type="button" className="m-btn m-btn-primary" onClick={dismissPopup} style={{ marginTop: 14 }}>
              Entendido
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
