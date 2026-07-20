import { MChip, mAmount } from "../content-kit";
import { MHomeCard, MHomeCardEmpty, MHomeCardError } from "./card-shell";
import { MHomeMeter } from "./meter";

/**
 * Tarjeta 6 — PROTECCIÓN.
 *
 * Entra en esta fase porque NO cuesta una llamada: `getWealthSummary()` —que Inicio ya
 * pide— llama a `listPolicies()` por dentro y devuelve el diagnóstico completo. Lo único
 * que faltaba era dejar de descartarlo antes de llegar a la vista.
 *
 * La cifra es la COBERTURA, no el número de pólizas: tres pólizas malas cubren menos que
 * una buena, y lo que importa es cuánto te respalda. Las pólizas van al mensaje.
 *
 * La cobertura ya viene normalizada a la moneda principal (wealth-service normaliza cada
 * póliza antes del diagnóstico), así que sumar aquí no mezcla monedas.
 */
export function DefenseCard({
  score,
  activePolicies,
  totalCoverage,
  currency,
}: {
  /** 0-100: cuánto de la protección recomendada está cubierta. */
  score: number;
  activePolicies: number;
  totalCoverage: number;
  currency: string;
}) {
  if (activePolicies === 0) {
    return (
      <MHomeCardEmpty
        eyebrow="Protección"
        icon="protection"
        title="Una póliza evita que un imprevisto se lleve lo que construiste."
        cta="Registra tu protección"
        href="/m/proteccion"
      />
    );
  }

  return (
    <MHomeCard
      eyebrow="Protección"
      value={mAmount(totalCoverage, currency, 11)}
      chip={
        // Chips CORTOS: el chip es flex:none y se queda el ancho que pida, así que uno
        // largo empuja al eyebrow contra la elipsis. Medido a 320px, "Cobertura parcial"
        // dejaba "Protección" en 69,6px cuando necesita 76,2 y salía "Protecció…".
        score >= 80 ? (
          <MChip tone="success">Cubierto</MChip>
        ) : score >= 50 ? (
          <MChip tone="warning">Parcial</MChip>
        ) : (
          <MChip tone="danger">Expuesto</MChip>
        )
      }
      sub={`cobertura · ${activePolicies} ${activePolicies === 1 ? "póliza" : "pólizas"}`}
      vis={
        <MHomeMeter
          pct={score / 100}
          label="protegido"
          color={score >= 80 ? "var(--accent)" : score >= 50 ? "var(--warning)" : "var(--danger)"}
        />
      }
      message={
        // Lo que la cifra no dice: si eso basta.
        score >= 80
          ? "Tus riesgos clave están cubiertos."
          : score >= 50
            ? "Te faltan coberturas clave."
            : "Un imprevisto hoy te costaría caro."
      }
      href="/m/proteccion"
      ariaLabel="Cobertura de protección. Ver protección"
    />
  );
}

/** El resumen de patrimonio no cargó: distinto de no tener pólizas. */
export function DefenseCardError() {
  return <MHomeCardError eyebrow="Protección" icon="protection" />;
}
