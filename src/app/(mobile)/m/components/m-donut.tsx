/**
 * Donut de distribución + leyenda (presentacional, server). Reutilizado por
 * /m/patrimonio y /m/inversiones. Recibe porciones ya calculadas por los engines
 * (assetsByClass / allocation) y solo dibuja; no computa datos de negocio.
 */
export type MSlice = { label: string; value: number; color: string };

export function MDonut({
  slices,
  centerValue,
  centerLabel,
}: {
  slices: MSlice[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const segs = slices.map((s) => {
    const pct = (s.value / total) * 100;
    const seg = { color: s.color, len: pct, offset: 25 - acc };
    acc += pct;
    return seg;
  });

  return (
    <div className="card card-p">
      <div className="row" style={{ gap: 20 }}>
        <div className="ring-wrap">
          <svg width="112" height="112" viewBox="0 0 42 42" aria-hidden>
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" strokeWidth={5} />
            {segs.map((s, i) => (
              <circle
                key={i}
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={s.color}
                strokeWidth={5}
                strokeDasharray={`${s.len} ${100 - s.len}`}
                strokeDashoffset={s.offset}
              />
            ))}
          </svg>
          <div className="ring-center">
            <div>
              <div className="display" style={{ fontSize: 15 }}>
                {centerValue}
              </div>
              <div className="muted" style={{ fontSize: 9 }}>
                {centerLabel}
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {slices.map((s, i) => (
            <div key={i} className="between">
              <span style={{ fontSize: 13 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 9,
                    height: 9,
                    borderRadius: 3,
                    background: s.color,
                    marginRight: 8,
                  }}
                />
                {s.label}
              </span>
              <span className="mono" style={{ fontSize: 12.5 }}>
                {Math.round((s.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
