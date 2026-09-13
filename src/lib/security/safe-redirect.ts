/**
 * Validación de un `next` antes de redirigir. UN solo lugar, porque este control
 * estaba escrito tres veces —callback de auth, OAuth nativo y las server actions— y
 * las tres copias tenían el mismo agujero.
 *
 * El agujero: `startsWith("/") && !startsWith("//")` deja pasar `/\evil.com`, y el
 * parser de URL lo resuelve a `https://evil.com/`. Verificado:
 *
 *   new URL("/\\evil.com", "https://carteraplus.vercel.app").href
 *   // → "https://evil.com/"
 *
 * No es una curiosidad de Node: los navegadores tratan `\` como `/` al resolver una
 * URL, así que un `Location: /\evil.com` saca a la persona del sitio. En un callback
 * de autenticación eso es una página de phishing con la sesión recién creada.
 *
 * La defensa no es agregar otro `startsWith`: es dejar de confiar en la cadena. Se
 * resuelve contra un origen ficticio y se exige que el origen NO haya cambiado; lo que
 * se devuelve es lo que el parser reconstruyó, nunca el texto original.
 */

/** Origen ficticio. No importa cuál sea: solo importa que la resolución no lo cambie. */
const ORIGEN_CENTINELA = "https://cartera.invalid";

/** Un `Location` enorme no tiene uso legítimo y sí sirve para abusar de proxies. */
const LARGO_MAXIMO = 2048;

/**
 * Devuelve una ruta interna segura, o `fallback`.
 *
 * Acepta solo rutas del propio sitio (`/algo?x=1#y`). Cualquier cosa que huela a
 * salida —origen absoluto, protocolo, `//`, contrabarras, saltos de línea— cae al
 * fallback en silencio: quien manda un `next` hostil no merece un mensaje de error
 * que le diga qué filtro tocar.
 */
export function safeInternalPath(next: unknown, fallback: string): string {
  if (typeof next !== "string") return fallback;

  const valor = next.trim();
  if (!valor || valor.length > LARGO_MAXIMO) return fallback;

  // Debe ser una ruta absoluta del sitio. Descarta `https://…`, `javascript:` y las
  // protocol-relative `//host`.
  if (!valor.startsWith("/") || valor.startsWith("//")) return fallback;

  // Contrabarras, en cualquier posición y en cualquier forma. `%5C` se rechaza sin
  // decodificar: si algo la decodifica más adelante —un proxy, un cliente— vuelve a
  // ser una contrabarra, y para entonces la validación ya pasó.
  if (valor.includes("\\") || /%5c/i.test(valor)) return fallback;

  // Caracteres de control: CR y LF permiten inyectar cabeceras (`/a\r\nLocation: …`),
  // y el TAB lo ignoran los parsers de URL, así que sirve para colar `/\tevil.com`.
  if (/[\u0000-\u001F\u007F]/.test(valor)) return fallback;

  let u: URL;
  try {
    u = new URL(valor, ORIGEN_CENTINELA);
  } catch {
    return fallback;
  }

  // La prueba de fondo: si al resolver cambió el origen, la ruta apuntaba afuera.
  if (u.origin !== ORIGEN_CENTINELA) return fallback;

  // Se devuelve lo RECONSTRUIDO, no la cadena de entrada: lo que sale ya pasó por el
  // parser y no puede traer sorpresas que el parser normalizó al leerla.
  return `${u.pathname}${u.search}${u.hash}`;
}
