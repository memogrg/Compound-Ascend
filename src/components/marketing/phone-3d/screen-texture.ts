/**
 * LA PANTALLA DEL TELÉFONO DEL HERO — dibujada en un canvas 2D.
 *
 * Es la UI de CARTERA+ pintada a mano, no una captura: una imagen pesaría cientos de KB, se vería
 * borrosa al acercarse y habría que re-exportarla cada vez que cambie un color de la marca. Acá son
 * unos cientos de bytes de código y escala sola.
 *
 * Las cifras son de MUESTRA y ficticias — es material de marketing, no la cuenta de nadie.
 *
 * No importa `three`: devuelve el canvas y quien lo pide arma la textura. Así esto se puede mirar
 * (y cambiar) sin cargar el motor 3D encima.
 */

/** Escala de dibujo. A 2× el texto se lee nítido cuando el teléfono se acerca a la cámara. */
const ESCALA = 2;

/** Tamaño lógico de la pantalla, en las mismas unidades que usa la geometría del teléfono. */
export const PANTALLA = { ancho: 284, alto: 610 } as const;

const VERDE = "#378451";
const VERDE_AGUA = "#2b7d6a";
const AMBAR = "#b07a2e";
const TINTA = "#1e1c16";
const MUTE = "#625e57";
const PAPEL = "#f7f6f2";
const LINEA = "#eceae3";
const RIEL = "#eeece5";

/** La misma familia que el resto de la landing, para que la pantalla no desentone. */
const fuente = (px: number, peso = 400): string =>
  `${peso} ${px}px -apple-system, "Helvetica Neue", Arial, sans-serif`;

export function dibujarPantalla(): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  cv.width = PANTALLA.ancho * ESCALA;
  cv.height = PANTALLA.alto * ESCALA;
  const g = cv.getContext("2d");
  // Sin contexto 2D no hay pantalla que dibujar. El teléfono se arma igual, apagado: es preferible
  // a no mostrar nada.
  if (!g) return null;
  g.scale(ESCALA, ESCALA);

  /** Rectángulo redondeado (el `roundRect` nativo todavía no está en todos lados). */
  const rr = (x: number, y: number, w: number, h: number, r: number): void => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  const tarjeta = (y: number, h: number): void => {
    g.fillStyle = "#fff";
    rr(16, y, 252, h, 13);
    g.fill();
    g.strokeStyle = LINEA;
    g.lineWidth = 1;
    rr(16, y, 252, h, 13);
    g.stroke();
  };

  // ── Fondo y barra de título ──
  g.fillStyle = PAPEL;
  g.fillRect(0, 0, PANTALLA.ancho, PANTALLA.alto);
  g.fillStyle = TINTA;
  g.font = fuente(12.5, 600);
  g.fillText("Centro de mando", 16, 56);
  g.fillStyle = "#fff";
  rr(222, 44, 46, 16, 8);
  g.fill();
  g.strokeStyle = "#e7e4dc";
  g.lineWidth = 1;
  rr(222, 44, 46, 16, 8);
  g.stroke();
  g.fillStyle = MUTE;
  g.font = fuente(9);
  g.fillText("₡ CRC", 231, 55.5);

  // ── Salud financiera: anillo + KPIs ──
  tarjeta(70, 88);
  g.strokeStyle = "#e7e4dc";
  g.lineWidth = 6.5;
  g.beginPath();
  g.arc(60, 114, 24, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = VERDE;
  g.lineCap = "round";
  g.beginPath();
  g.arc(60, 114, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.78);
  g.stroke();
  g.fillStyle = TINTA;
  g.font = fuente(17, 700);
  g.textAlign = "center";
  g.fillText("78", 60, 119);
  g.font = fuente(6.5);
  g.fillStyle = MUTE;
  g.fillText("salud", 60, 128);
  g.textAlign = "left";

  const kpi = (y: number, etiqueta: string, valor: string, color?: string): void => {
    g.fillStyle = MUTE;
    g.font = fuente(9.5);
    g.fillText(etiqueta, 100, y);
    g.fillStyle = color ?? TINTA;
    g.font = fuente(9.5, 700);
    g.textAlign = "right";
    g.fillText(valor, 258, y);
    g.textAlign = "left";
  };
  kpi(96, "Ingresos", "₡1.240.000");
  kpi(114, "Gastado", "₡742.300");
  kpi(132, "Disponible", "₡497.700", VERDE);

  // ── Sobres por categoría ──
  tarjeta(168, 96);
  const sobre = (y: number, etiqueta: string, pct: number, color: string): void => {
    g.fillStyle = MUTE;
    g.font = fuente(9.5);
    g.fillText(etiqueta, 28, y);
    g.fillStyle = TINTA;
    g.font = fuente(9.5, 700);
    g.textAlign = "right";
    g.fillText(`${pct}%`, 256, y);
    g.textAlign = "left";
    g.fillStyle = RIEL;
    rr(28, y + 5, 228, 4.5, 2.2);
    g.fill();
    g.fillStyle = color;
    rr(28, y + 5, (228 * pct) / 100, 4.5, 2.2);
    g.fill();
  };
  sobre(186, "Alimentación", 68, VERDE);
  sobre(214, "Transporte", 41, VERDE);
  sobre(242, "Disfrute", 55, AMBAR);

  // ── El consejo del asesor ──
  tarjeta(276, 66);
  g.fillStyle = VERDE;
  g.beginPath();
  g.arc(37, 297, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#fff";
  g.font = fuente(8, 700);
  g.textAlign = "center";
  g.fillText("C+", 37, 300);
  g.textAlign = "left";
  g.fillStyle = "#eef4ef";
  rr(52, 286, 204, 46, 10);
  g.fill();
  g.fillStyle = "#2a352d";
  g.font = fuente(9);
  g.fillText("Tu tarjeta al 24%: si abonas ₡45.000", 60, 302);
  g.fillText("extra, la liquidas 8 meses antes.", 60, 316);

  // ── Patrimonio neto + su curva ──
  tarjeta(354, 84);
  g.fillStyle = MUTE;
  g.font = fuente(9.5);
  g.fillText("Patrimonio neto", 28, 372);
  g.fillStyle = VERDE;
  g.font = fuente(9.5, 700);
  g.textAlign = "right";
  g.fillText("+4,2%", 256, 372);
  g.textAlign = "left";
  g.fillStyle = TINTA;
  g.font = fuente(15, 700);
  g.fillText("₡12.480.000", 28, 392);
  const puntos: [number, number][] = [
    [0, 21],
    [12, 19],
    [24, 20],
    [36, 15],
    [48, 16],
    [60, 11],
    [72, 12],
    [84, 7],
    [100, 4],
  ];
  g.beginPath();
  puntos.forEach((p, i) => {
    const x = 28 + p[0] * 2.28;
    const y = 400 + p[1] * 1.2;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.strokeStyle = VERDE;
  g.lineWidth = 2;
  g.lineJoin = "round";
  g.stroke();
  g.lineTo(28 + 228, 432);
  g.lineTo(28, 432);
  g.closePath();
  g.fillStyle = "rgba(55,132,81,.10)";
  g.fill();

  // ── Rich Life Score + fondo de paz ──
  tarjeta(450, 74);
  g.fillStyle = MUTE;
  g.font = fuente(9.5);
  g.fillText("Rich Life Score", 28, 468);
  g.fillStyle = TINTA;
  g.font = fuente(9.5, 700);
  g.textAlign = "right";
  g.fillText("72 / 100", 256, 468);
  g.textAlign = "left";
  g.fillStyle = RIEL;
  rr(28, 474, 228, 4.5, 2.2);
  g.fill();
  g.fillStyle = VERDE;
  rr(28, 474, 228 * 0.72, 4.5, 2.2);
  g.fill();
  g.fillStyle = MUTE;
  g.font = fuente(9.5);
  g.fillText("Fondo de paz", 28, 496);
  g.fillStyle = VERDE;
  g.font = fuente(9.5, 700);
  g.textAlign = "right";
  g.fillText("4,1 meses", 256, 496);
  g.textAlign = "left";
  g.fillStyle = RIEL;
  rr(28, 502, 228, 4.5, 2.2);
  g.fill();
  g.fillStyle = VERDE_AGUA;
  rr(28, 502, 228 * 0.57, 4.5, 2.2);
  g.fill();

  // ── Barra de navegación ──
  g.fillStyle = "#fff";
  rr(16, 556, 252, 34, 11);
  g.fill();
  g.strokeStyle = LINEA;
  rr(16, 556, 252, 34, 11);
  g.stroke();
  [0, 1, 2, 3].forEach((i) => {
    g.fillStyle = i ? "#dcd9d0" : VERDE;
    rr(44 + i * 56, 566, 14, 14, 4.5);
    g.fill();
  });

  // ── Isla dinámica, al final para que quede por encima de todo ──
  g.fillStyle = "#000";
  rr(94, 10, 96, 26, 13);
  g.fill();
  const lente = g.createRadialGradient(172, 22, 1, 172, 23, 5.5);
  lente.addColorStop(0, "#3a4a6b");
  lente.addColorStop(0.5, "#10131c");
  lente.addColorStop(1, "#000");
  g.fillStyle = lente;
  g.beginPath();
  g.arc(172, 23, 5, 0, Math.PI * 2);
  g.fill();

  return cv;
}
