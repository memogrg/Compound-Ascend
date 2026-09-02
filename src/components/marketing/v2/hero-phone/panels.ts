/**
 * LO QUE SE VE DENTRO DE LA PANTALLA DEL TELÉFONO DEL HERO.
 *
 * Es un `<canvas>` 2D que se convierte en textura. Tres paneles que rotan cada 7 s: el centro de
 * mando, el plan de deudas y el asesor. Las cifras son las de la cuenta de demostración Familia
 * Ramírez — las mismas que aparecen escritas en la página, para que nadie encuentre dos verdades.
 *
 * Se dibuja a 540×1160 con supermuestreo 2× (1080×2320 reales). No 3×: la pantalla ocupa como mucho
 * ~350 px de ancho en pantalla, así que a 1080 de textura ya sobra resolución, y 3× significaba
 * 22 MB por cada re-subida a la GPU.
 */

/** Medidas lógicas del lienzo y el factor de supermuestreo. */
export const SW = 540;
export const SH = 1160;
export const SS = 2;

/** Los tres paneles, en orden de rotación. */
export const PANELES = ["Centro de mando", "Tus deudas", "My Agent C+"] as const;

/** Segundos que se queda cada panel antes de pasar al siguiente. */
export const SEG_POR_PANEL = 7;

type Fuentes = { display: string; cuerpo: string; mono: string };

/**
 * Las familias reales, leídas de las variables que planta `next/font` en el `<html>`.
 *
 * En CSS bastaría `var(--font-display)`, pero el contexto 2D no resuelve variables: necesita el
 * nombre de familia literal. `--font-sora` sí contiene ese nombre (el hash que genera next/font),
 * así que se lee de ahí y se le agrega un respaldo del sistema.
 */
export function leerFuentes(): Fuentes {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, alt: string): string => {
    const s = cs.getPropertyValue(n).trim();
    return s ? `${s}, ${alt}` : alt;
  };
  return {
    display: v("--font-sora", "Sora, system-ui, sans-serif"),
    cuerpo: v("--font-manrope", "Manrope, system-ui, sans-serif"),
    mono: v("--font-space-mono", '"Space Mono", ui-monospace, monospace'),
  };
}

/** Rectángulo redondeado. */
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export type Lienzo = {
  canvas: HTMLCanvasElement;
  dibujar: (panel: number, t: number) => void;
};

/**
 * Arma el lienzo y devuelve la función que lo pinta.
 *
 * `t` va de 0 a 3 dentro de cada panel y sirve para las entradas animadas (las barras que crecen,
 * la curva que se traza, la propuesta que aparece). Pasado ~2 no cambia nada más, y por eso el bucle
 * deja de redibujar: una textura quieta no se vuelve a subir a la GPU.
 */
export function crearLienzo(): Lienzo | null {
  const canvas = document.createElement("canvas");
  canvas.width = SW * SS;
  canvas.height = SH * SS;
  const sx = canvas.getContext("2d");
  if (!sx) return null;
  sx.setTransform(SS, 0, 0, SS, 0, 0);

  const F = leerFuentes();

  const txt = (
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight = 400,
    font = F.cuerpo,
  ) => {
    sx.fillStyle = color;
    sx.font = `${weight} ${size}px ${font}`;
    sx.fillText(s, x, y);
  };

  /**
   * La ISLA DINÁMICA. Va al final del dibujo, por encima de todo, igual que en
   * `phone-3d/screen-texture.ts` — de donde viene tal cual. Las coordenadas de aquel lienzo
   * (284 px de ancho) se escalan a este con `K`.
   */
  const K = SW / 284;
  const isla = () => {
    sx.fillStyle = "#000";
    rr(sx, 94 * K, 10 * K, 96 * K, 26 * K, 13 * K);
    sx.fill();
    const lente = sx.createRadialGradient(172 * K, 22 * K, 1 * K, 172 * K, 23 * K, 5.5 * K);
    lente.addColorStop(0, "#3a4a6b");
    lente.addColorStop(0.5, "#10131c");
    lente.addColorStop(1, "#000");
    sx.fillStyle = lente;
    sx.beginPath();
    sx.arc(172 * K, 23 * K, 5 * K, 0, Math.PI * 2);
    sx.fill();
  };

  const centroDeMando = (t: number) => {
    txt("Hola, José", 40, 172, 40, "#1e1c16", 600, F.display);
    txt("Tu liquidez hoy", 40, 236, 22, "#4b463f");
    txt("₡1.354.594", 40, 300, 52, "#1e1c16", 700, F.mono);
    rr(sx, 40, 344, SW - 80, 150, 18);
    sx.fillStyle = "#f7f5ef";
    sx.fill();
    sx.strokeStyle = "#eae7de";
    sx.lineWidth = 2;
    sx.stroke();
    txt("MY AGENT C+", 64, 386, 16, "#378451", 700, F.mono);
    txt("Tu próxima jugada", 64, 424, 24, "#1e1c16", 600, F.display);
    txt("Atacá el préstamo del vehículo", 64, 460, 20, "#4b463f");
    const filas: [string, string, number][] = [
      ["Deuda total", "₡32.166.147", 0.38],
      ["Fondo de emergencia", "₡1.520.000", 0.43],
      ["Ahorro del mes", "₡296.403", 0.62],
    ];
    filas.forEach(([etiqueta, cifra, frac], i) => {
      const y = 566 + i * 118;
      txt(etiqueta, 40, y, 21, "#4b463f");
      sx.textAlign = "right";
      txt(cifra, SW - 40, y, 22, "#1e1c16", 700, F.mono);
      sx.textAlign = "left";
      rr(sx, 40, y + 18, SW - 80, 10, 5);
      sx.fillStyle = "#ece9e0";
      sx.fill();
      const w = (SW - 80) * frac * Math.min(1, Math.max(0, (t - 0.2 - i * 0.12) * 1.6));
      if (w > 0) {
        rr(sx, 40, y + 18, w, 10, 5);
        sx.fillStyle = "#378451";
        sx.fill();
      }
    });
  };

  const deudas = (t: number) => {
    txt("Deuda total", 40, 172, 22, "#4b463f");
    txt("₡32.166.147", 40, 236, 48, "#1e1c16", 700, F.mono);
    rr(sx, 40, 266, 306, 44, 22);
    sx.fillStyle = "rgba(55,132,81,.12)";
    sx.fill();
    txt("Libre de deudas · jul 2030", 60, 295, 20, "#2c6e43", 700);
    txt("ORDEN DE ATAQUE · AVALANCHA", 40, 376, 16, "#6f6a60", 700, F.mono);
    const deuda: [string, string, string, boolean][] = [
      ["1", "Préstamo vehículo — BCR", "13,5%", true],
      ["2", "Hipoteca casa — BAC", "10,5%", false],
    ];
    deuda.forEach(([n, nombre, tasa, activa], i) => {
      const y = 406 + i * 96;
      rr(sx, 40, y, SW - 80, 76, 16);
      sx.fillStyle = "#fbfaf6";
      sx.fill();
      sx.strokeStyle = "#eeebe3";
      sx.lineWidth = 2;
      sx.stroke();
      rr(sx, 62, y + 22, 34, 34, 10);
      sx.fillStyle = activa ? "#378451" : "#e0ddd4";
      sx.fill();
      sx.textAlign = "center";
      txt(n, 79, y + 46, 20, activa ? "#fff" : "#6f6a60", 700, F.mono);
      sx.textAlign = "left";
      txt(nombre, 114, y + 46, 21, "#1e1c16", 600);
      sx.textAlign = "right";
      txt(tasa, SW - 62, y + 46, 20, "#4b463f", 700, F.mono);
      sx.textAlign = "left";
    });
    txt("Te ahorra en intereses", 40, 662, 21, "#4b463f");
    txt("₡5.303.319", 40, 714, 40, "#378451", 700, F.mono);
    sx.strokeStyle = "#378451";
    sx.lineWidth = 4;
    sx.beginPath();
    for (let i = 0; i <= 60; i += 1) {
      const f = i / 60;
      if (f > Math.min(1, t * 1.4)) break;
      const X = 40 + f * (SW - 80);
      const Y = 800 + f * 170 - Math.sin(f * Math.PI) * 24;
      if (i === 0) sx.moveTo(X, Y);
      else sx.lineTo(X, Y);
    }
    sx.stroke();
    txt("Hoy", 40, 1006, 17, "#6f6a60", 400, F.mono);
    sx.textAlign = "right";
    txt("jul 2030", SW - 40, 1006, 17, "#6f6a60", 400, F.mono);
    sx.textAlign = "left";
  };

  const asesor = (t: number) => {
    txt("Un asesor que", 40, 172, 34, "#1e1c16", 600, F.display);
    txt("conoce tus números", 40, 214, 34, "#1e1c16", 600, F.display);
    rr(sx, 120, 266, SW - 160, 110, 22);
    sx.fillStyle = "#378451";
    sx.fill();
    txt("¿Abono ₡300.000 al carro", 148, 306, 21, "#fff");
    txt("o al fondo de emergencia?", 148, 338, 21, "#fff");
    rr(sx, 40, 400, SW - 160, 250, 22);
    sx.fillStyle = "#f7f5ef";
    sx.fill();
    sx.strokeStyle = "#eae7de";
    sx.lineWidth = 2;
    sx.stroke();
    [
      "Al fondo, y te digo por qué",
      "con tus números.",
      "",
      "El vehículo está al 13,5%: te",
      "ahorrás ~₡40.500 al año. Pero",
      "tu fondo cubre menos de dos meses.",
    ].forEach((l, i) => txt(l, 66, 440 + i * 34, 20, "#1e1c16"));
    sx.globalAlpha = Math.min(1, Math.max(0, (t - 0.45) * 3));
    rr(sx, 40, 690, SW - 160, 190, 20);
    sx.fillStyle = "#f2f7f2";
    sx.fill();
    sx.setLineDash([8, 6]);
    sx.strokeStyle = "#cfd8cc";
    sx.lineWidth = 2;
    sx.stroke();
    sx.setLineDash([]);
    txt("PENDIENTE DE TU CONFIRMACIÓN", 66, 728, 15, "#2c6e43", 700, F.mono);
    txt("Aporte al fondo de emergencia", 66, 768, 22, "#1e1c16", 600, F.display);
    txt("₡300.000 · hoy · Ahorro BAC", 66, 804, 20, "#4b463f", 700, F.mono);
    txt("La decisión siempre es tuya.", 66, 844, 19, "#4b463f");
    sx.globalAlpha = 1;
  };

  const dibujar = (panel: number, t: number) => {
    sx.fillStyle = "#ffffff";
    sx.fillRect(0, 0, SW, SH);
    sx.save();
    sx.translate(0, 30); // deja libre la franja de la isla

    const titulo = PANELES[panel] ?? PANELES[0];
    txt(titulo.toUpperCase(), 40, 72, 20, "#6f6a60", 700, F.mono);
    sx.strokeStyle = "#eeebe3";
    sx.lineWidth = 2;
    sx.beginPath();
    sx.moveTo(40, 98);
    sx.lineTo(SW - 40, 98);
    sx.stroke();

    if (panel === 0) centroDeMando(t);
    else if (panel === 1) deudas(t);
    else asesor(t);

    sx.restore();

    // Viñeta suave: un panel real no es un blanco parejo de borde a borde.
    const vg = sx.createRadialGradient(
      SW * 0.5,
      SH * 0.42,
      SW * 0.25,
      SW * 0.5,
      SH * 0.5,
      SH * 0.62,
    );
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(0.72, "rgba(24,22,18,.020)");
    vg.addColorStop(1, "rgba(24,22,18,.055)");
    sx.fillStyle = vg;
    sx.fillRect(0, 0, SW, SH);

    isla();
  };

  return { canvas, dibujar };
}
