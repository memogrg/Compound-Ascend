/**
 * Self-contained inline-SVG charts for the report. Pure string output, fully
 * DETERMINISTIC (no ids, no random, no timestamps) so the same series yields the
 * same markup — the report is seed-stable. No CDN, no runtime JS: the SVG renders
 * standalone when the HTML is opened offline.
 */

/** Integer with thousands separators — locale-free so output is deterministic. */
export function fmtNum(v: number): string {
  const r = Math.round(v);
  const sign = r < 0 ? "-" : "";
  const digits = Math.abs(r).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface ChartLine {
  name: string;
  values: number[];
  color: string;
}

/**
 * Multi-line chart over `months` (x) with one polyline per series. Y axis is
 * auto-scaled including 0. Legend + min/max + month ticks are drawn as SVG text.
 */
export function lineChart(months: number[], lines: ChartLine[], title: string): string {
  const width = 640;
  const height = 240;
  const pad = { l: 72, r: 16, t: 30, b: 30 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = months.length;

  const allVals = lines.flatMap((l) => l.values);
  const min = Math.min(0, ...(allVals.length ? allVals : [0]));
  const max = Math.max(1, ...(allVals.length ? allVals : [1]));
  const span = max - min || 1;

  const x = (i: number): number => (n <= 1 ? pad.l + iw / 2 : pad.l + (i / (n - 1)) * iw);
  const y = (v: number): number => pad.t + ih - ((v - min) / span) * ih;

  const gridY = pad.t + ih;
  const axis =
    `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${gridY}" stroke="var(--grid)" stroke-width="1"/>` +
    `<line x1="${pad.l}" y1="${gridY}" x2="${width - pad.r}" y2="${gridY}" stroke="var(--grid)" stroke-width="1"/>`;

  const yLabels =
    `<text x="${pad.l - 8}" y="${y(max) + 4}" text-anchor="end" class="tick">${fmtNum(max)}</text>` +
    `<text x="${pad.l - 8}" y="${y(min) + 4}" text-anchor="end" class="tick">${fmtNum(min)}</text>`;

  const xLabels = months
    .map((mo, i) => `<text x="${x(i).toFixed(1)}" y="${gridY + 18}" text-anchor="middle" class="tick">m${mo}</text>`)
    .join("");

  const polylines = lines
    .map((l) => {
      const pts = l.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      return `<polyline fill="none" stroke="${l.color}" stroke-width="2" points="${pts}"/>`;
    })
    .join("");

  const legend = lines
    .map((l, i) => {
      const lx = pad.l + i * 150;
      return (
        `<rect x="${lx}" y="8" width="10" height="10" fill="${l.color}"/>` +
        `<text x="${lx + 16}" y="17" class="tick">${escapeText(l.name)}</text>`
      );
    })
    .join("");

  return (
    `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="${escapeText(title)}">` +
    `${legend}${axis}${yLabels}${xLabels}${polylines}</svg>`
  );
}

/** Escape text destined for SVG/HTML text nodes. */
export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
