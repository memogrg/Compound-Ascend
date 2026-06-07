/**
 * Tira de resumen (KPIs) estilo "sobre" del diseño Claude (Budget.html).
 * Componente de presentación puro (servidor): recibe tarjetas ya formateadas.
 */
export type SumTone = "default" | "pos" | "neg";

export type SumCard = {
  ttl: string;
  val: string;
  sub?: string;
  tone?: SumTone;
};

const TONE: Record<SumTone, string | undefined> = {
  default: undefined,
  pos: "var(--pos)",
  neg: "var(--neg)",
};

export function SummaryStrip({ cards }: { cards: SumCard[] }) {
  return (
    <section className="summary-strip">
      {cards.map((c, i) => (
        <div key={`${c.ttl}-${i}`} className="card sum">
          <div className="ttl">{c.ttl}</div>
          <div className="val" style={{ color: TONE[c.tone ?? "default"] }}>
            {c.val}
          </div>
          {c.sub ? <div className="sub">{c.sub}</div> : null}
        </div>
      ))}
    </section>
  );
}
