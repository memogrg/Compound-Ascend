/**
 * Visual "un ratio contra su meta": el porcentaje, una barra proporcional y una etiqueta
 * que dice DE QUÉ es ese porcentaje.
 *
 * Existe para no repetir el donut en todas las tarjetas. El donut significa "cuánto de
 * una bolsa se consumió" y solo Presupuesto habla de eso; Ahorro, Deudas, Inversiones y
 * Protección dicen otra cosa —cuánto de un objetivo llevas—, y merecen su propia forma.
 * Que las cuatro compartan ESTA es deliberado: significan lo mismo, así que el usuario
 * aprende el gráfico una vez.
 *
 * La `marca` es el umbral (la meta del 20% de ahorro, el límite del 40% de deuda). Se
 * dibuja dentro de la pista y por encima del relleno para que siga leyéndose cuando el
 * relleno ya la pasó, que es justo cuando más importa verla.
 */
export function MHomeMeter({
  pct,
  label,
  color,
  marca,
  mostrarPct = true,
}: {
  /** 0-1. Se recorta al pintar: un 140% de deuda no puede desbordar la pista. */
  pct: number;
  /** Qué mide. Sin esto el gráfico necesitaría que alguien lo explicara. */
  label: string;
  color: string;
  /** Umbral de referencia, 0-1. */
  marca?: number;
  /**
   * Si la CIFRA de la tarjeta ya es un porcentaje, este número sobra y además confunde:
   * en Ahorro convivían un "14%" (la tasa) y un "70%" (el avance hacia la meta), los dos
   * grandes, y de un vistazo no se distinguía cuál era el dato del usuario. Cuando el
   * titular es dinero —Inversiones, Protección— el porcentaje sí aporta algo nuevo.
   */
  mostrarPct?: boolean;
}) {
  const ancho = Math.max(0, Math.min(1, pct));
  return (
    <span className="m-hcard-meter">
      {mostrarPct ? <span className="m-hcard-meter-pct">{Math.round(pct * 100)}%</span> : null}
      <span className="m-hcard-meter-track" aria-hidden>
        <span
          className="m-hcard-meter-fill"
          style={{ width: `${ancho * 100}%`, background: color }}
        />
        {marca != null && marca > 0 && marca < 1 ? (
          <span className="m-hcard-meter-mark" style={{ left: `${marca * 100}%` }} />
        ) : null}
      </span>
      <span className="m-hcard-meter-l">{label}</span>
    </span>
  );
}
