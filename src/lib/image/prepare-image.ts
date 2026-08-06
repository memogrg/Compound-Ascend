/**
 * Preparación de la foto del recibo ANTES de subirla. Corre en el navegador.
 *
 * POR QUÉ. El escáner fallaba intermitente con fotos perfectamente legibles, y la foto era la
 * causa. Una cámara de teléfono saca 12 MP (4032×3024) y escribe un JPEG de 3-5 MB; en base64
 * eso infla un 33% y roza —o pasa— el tope de la ruta. Aunque entre, hay que subir megabytes por
 * la red del celular y después la visión tiene que decodificarlos: la suma se comía el
 * presupuesto de la función serverless y el usuario veía un error genérico.
 *
 * Redimensionar a 1600px de lado mayor con calidad 0.8 baja de MBs a cientos de KB —un orden de
 * magnitud— sin perder legibilidad: el texto de un tiquete a 1600px sigue teniendo alto de sobra
 * para el OCR. Se gana en las cuatro puntas: sube más rápido, la visión responde más rápido, entra
 * holgado en el límite y cuesta menos tokens (el modelo cobra por mosaicos de 768px, así que menos
 * píxeles son literalmente menos tokens).
 *
 * TAMBIÉN RESUELVE HEIC. El iPhone manda HEIC por defecto, y aunque Gemini lo documenta como
 * formato soportado, después de este paso el servidor recibe JPEG SIEMPRE — el formato deja de ser
 * una variable. Si el navegador no sabe decodificar HEIC (Chrome en Android no trae el códec), la
 * compresión falla sola y se sube el archivo original: se degrada, no se rompe.
 *
 * Nada de esto puede tirar el escaneo: cualquier fallo (canvas bloqueado, formato exótico, imagen
 * corrupta) cae al archivo original tal cual, que es exactamente el comportamiento de antes.
 */

/** Lado mayor de la imagen que se sube. Suficiente para leer un tiquete; ~10× menos peso. */
export const MAX_LADO = 1600;
/** Calidad JPEG. 0.8 es el punto donde el texto sigue nítido y el peso ya cayó de golpe. */
export const CALIDAD_JPEG = 0.8;

export type ImagenPreparada = {
  /** Base64 SIN el prefijo `data:` — es lo que espera la ruta. */
  base64: string;
  mimeType: string;
  /** Peso del binario (no del base64) para logs y para el mensaje de "muy grande". */
  bytes: number;
  /** Largo de la cadena base64: es lo que el servidor mide contra su tope. */
  base64Length: number;
  /** false = se subió el archivo original (el navegador no pudo decodificarlo). */
  comprimida: boolean;
  ancho: number | null;
  alto: number | null;
};

/**
 * Dimensiones para que el lado mayor no pase de `max`, conservando la proporción.
 * NUNCA agranda: una foto ya chica se sube tal cual (reescalar hacia arriba solo agrega peso).
 * Puro: es la única parte con aritmética, así que es la única que hace falta probar.
 */
export function escalarAMax(
  ancho: number,
  alto: number,
  max: number = MAX_LADO,
): { ancho: number; alto: number } {
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ancho: 0, alto: 0 };
  }
  const lado = Math.max(ancho, alto);
  if (lado <= max) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const f = max / lado;
  // Mínimo 1px: una imagen con una dimensión ridículamente chica (1×5000) no puede quedar en 0,
  // que haría fallar el canvas.
  return { ancho: Math.max(1, Math.round(ancho * f)), alto: Math.max(1, Math.round(alto * f)) };
}

/** Blob → base64 sin el prefijo `data:`. FileReader y no btoa: btoa se atraganta con binarios. */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodifica el archivo a algo dibujable. `createImageBitmap` es el camino rápido y además
 * aplica la ORIENTACIÓN EXIF (`from-image`): sin eso, una foto sacada en vertical se sube
 * acostada y el modelo lee un recibo de lado. Si no está disponible o no soporta el formato,
 * cae a un <img> con object URL.
 */
async function decodificar(file: File): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, w: bmp.width, h: bmp.height };
    } catch {
      // Formato que el navegador no decodifica (HEIC en Chrome) → probar con <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** El archivo tal cual, sin comprimir. Es el plan B de todos los caminos de fallo. */
async function sinComprimir(file: File): Promise<ImagenPreparada> {
  const base64 = await blobABase64(file);
  return {
    base64,
    mimeType: file.type || "image/jpeg",
    bytes: file.size,
    base64Length: base64.length,
    comprimida: false,
    ancho: null,
    alto: null,
  };
}

/**
 * Foto del recibo lista para subir: redimensionada a `MAX_LADO` y recomprimida como JPEG.
 *
 * Best-effort por diseño. Si algo del pipeline de canvas falla —o si el JPEG resultante pesara
 * MÁS que el original, que pasa con capturas de pantalla PNG chicas— devuelve el archivo original.
 */
export async function prepararImagenRecibo(
  file: File,
  opts: { maxLado?: number; calidad?: number } = {},
): Promise<ImagenPreparada> {
  const maxLado = opts.maxLado ?? MAX_LADO;
  const calidad = opts.calidad ?? CALIDAD_JPEG;
  try {
    const { src, w, h } = await decodificar(file);
    const { ancho, alto } = escalarAMax(w, h, maxLado);
    if (ancho <= 0 || alto <= 0) return await sinComprimir(file);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return await sinComprimir(file);
    // Fondo BLANCO antes de dibujar: el JPEG no tiene canal alfa, así que un PNG con
    // transparencia saldría con el fondo negro y el recibo ilegible.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(src, 0, 0, ancho, alto);
    if ("close" in src && typeof src.close === "function") src.close(); // libera el ImageBitmap

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", calidad),
    );
    if (!blob || blob.size === 0) return await sinComprimir(file);
    // Comprimir y quedar MÁS pesado no tiene sentido (pasa con PNG chicos ya optimizados).
    if (file.size > 0 && blob.size >= file.size) return await sinComprimir(file);

    const base64 = await blobABase64(blob);
    return {
      base64,
      mimeType: "image/jpeg",
      bytes: blob.size,
      base64Length: base64.length,
      comprimida: true,
      ancho,
      alto,
    };
  } catch {
    return await sinComprimir(file);
  }
}
