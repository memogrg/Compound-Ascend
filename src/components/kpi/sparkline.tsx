"use client";

/**
 * Doce puntos de contexto junto a un número. SVG propio, sin Recharts: es una línea y un
 * punto, y montar un motor de gráficos entero para eso metería su peso en cada tarjeta.
 *
 * Va `aria-hidden` **porque el valor ya está en texto al lado**. No es un gráfico que se lea:
 * es la forma de la tendencia. Quien no la ve tiene el número, que es el dato.
 */
const RELLENO = 2;

/**
 * El `d` del `<path>`. Pura, y con los tres casos que rompen una sparkline escrita a la
 * ligera: sin puntos (no hay nada que dibujar), un punto (no hay línea) y todos iguales (una
 * división por cero que daría `NaN` en cada coordenada).
 */
export function pathSparkline(puntos: readonly number[], ancho: number, alto: number): string {
  const finitos = puntos.filter((p) => Number.isFinite(p));
  if (finitos.length === 0) return "";

  const min = Math.min(...finitos);
  const max = Math.max(...finitos);
  const span = max - min;
  const usable = alto - RELLENO * 2;

  const x = (i: number) => (finitos.length === 1 ? ancho / 2 : (i * ancho) / (finitos.length - 1));
  // Serie plana: se dibuja a media altura en vez de dividir por cero.
  const y = (v: number) => (span === 0 ? alto / 2 : RELLENO + (1 - (v - min) / span) * usable);

  if (finitos.length === 1) return `M${x(0).toFixed(1)} ${y(finitos[0]!).toFixed(1)}`;

  return finitos
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
}

export function Sparkline({
  puntos,
  ancho = 72,
  alto = 24,
}: {
  puntos: readonly number[];
  ancho?: number;
  alto?: number;
}) {
  const d = pathSparkline(puntos, ancho, alto);
  if (!d) return null;

  const finitos = puntos.filter((p) => Number.isFinite(p));
  const min = Math.min(...finitos);
  const max = Math.max(...finitos);
  const span = max - min;
  const ultimoX = finitos.length === 1 ? ancho / 2 : ancho;
  const ultimoY =
    span === 0
      ? alto / 2
      : RELLENO + (1 - (finitos[finitos.length - 1]! - min) / span) * (alto - RELLENO * 2);

  return (
    <svg
      className="kpi-spark"
      width={ancho}
      height={alto}
      viewBox={`0 0 ${ancho} ${alto}`}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--chart-1)"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* El último punto en acento y con anillo de superficie: es «dónde estamos ahora», y
          el anillo lo separa de la línea cuando cae encima de ella. */}
      <circle
        cx={ultimoX}
        cy={ultimoY}
        r="2.5"
        fill="var(--accent)"
        stroke="var(--surface)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
