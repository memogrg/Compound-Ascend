/**
 * Preload de Node para las capturas de QA: congela el reloj DEL SERVIDOR y corta la red
 * externa. CommonJS y sin dependencias, porque entra por `--require`.
 *
 * Extensión `.js` y no `.cjs`: package.json no declara `type`, así que `.js` YA es
 * CommonJS, y `.cjs` sería el primero del repo — queda fuera de los globs de
 * eslint-config-next y ESLint revienta al resolver la config (el objeto final de
 * eslint.config.mjs fija reglas de react-hooks sin `files`, y sin el plugin en alcance
 * para ese archivo falla toda la corrida).
 *
 * Por qué existe: `--freeze` de snap.mjs congela el reloj del NAVEGADOR. Todo lo que la
 * app calcula en el servidor sigue corriendo con el reloj real, así que una base tomada
 * el 18-sep y una comparación del 20-sep difieren sin que nadie haya tocado el código:
 * `/empezar` mostraba «2 de octubre» (hoy + 14 días de prueba) y pasó a «4 de octubre».
 * Lo mismo con los precios de mercado en vivo, que mueven patrimonio y Rich Life.
 *
 * Sin `QA_FREEZE` ni `QA_BLOCK_EXTERNAL` definidas, este archivo no hace absolutamente
 * nada: es seguro dejarlo en NODE_OPTIONS.
 */

const partes = [];

// ── Reloj congelado ─────────────────────────────────────────────────────────────
if (process.env.QA_FREEZE) {
  const FROZEN = Date.parse(process.env.QA_FREEZE);
  if (Number.isNaN(FROZEN)) {
    throw new Error(
      `QA_FREEZE no es una fecha ISO válida: ${JSON.stringify(process.env.QA_FREEZE)}. ` +
        `Ejemplo: QA_FREEZE=2026-09-18T18:00:00Z`,
    );
  }

  const RealDate = Date;

  class FrozenDate extends RealDate {
    constructor(...args) {
      // `new Date()` sin argumentos = el instante congelado. Con argumentos, se comporta
      // como siempre: construir una fecha concreta no tiene nada que ver con "ahora".
      super(...(args.length ? args : [FROZEN]));
    }
    static now() {
      return FROZEN;
    }
  }

  // `Date()` llamado como FUNCIÓN (sin new) devuelve una cadena, no un objeto. Si no se
  // replica, cualquier `Date()` suelto rompe con "Class constructor cannot be invoked".
  const DateProxy = new Proxy(FrozenDate, {
    apply() {
      return String(new FrozenDate());
    },
  });

  // `parse` y `UTC` se HEREDAN por la cadena de prototipos de clase, no son propiedades
  // propias. Node plano las resuelve igual, pero el runtime de Turbopack reexpone los
  // globales copiando las propiedades PROPIAS, y ahí se pierden: cada módulo del bundle
  // que llamaba a Date.parse en su evaluación reventaba con "is not a function" y toda
  // página daba 500. Se copian como propias para que sobrevivan a esa reexposición.
  for (const clave of Object.getOwnPropertyNames(RealDate)) {
    if (Object.prototype.hasOwnProperty.call(FrozenDate, clave)) continue;
    Object.defineProperty(FrozenDate, clave, Object.getOwnPropertyDescriptor(RealDate, clave));
  }

  globalThis.Date = DateProxy;
  partes.push(`reloj congelado en ${new RealDate(FROZEN).toISOString()}`);
} else {
  partes.push("reloj libre");
}

// ── Red externa ─────────────────────────────────────────────────────────────────
if (process.env.QA_BLOCK_EXTERNAL === "1") {
  const permitidos = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  // El Supabase local vive en 127.0.0.1, pero se lee de la env por si cambia de puerto/host.
  try {
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supa) permitidos.add(new URL(supa).hostname);
  } catch {
    /* URL inválida: se queda solo con los locales */
  }

  const bloqueados = new Map();
  const fetchReal = globalThis.fetch;

  globalThis.fetch = function fetchQA(input, init) {
    let host = "";
    try {
      const url = typeof input === "string" ? input : (input?.url ?? String(input));
      host = new URL(url).hostname;
    } catch {
      // Sin URL parseable no hay host que bloquear: dejar pasar.
      return fetchReal.call(this, input, init);
    }
    if (!permitidos.has(host)) {
      bloqueados.set(host, (bloqueados.get(host) ?? 0) + 1);
      // Promesa RECHAZADA, no throw síncrono: así es como falla fetch ante un problema de
      // red, y es lo que las cadenas de respaldo de la app saben atrapar. Lanzarlo en
      // sincrónico se saltaba los .catch() y tumbaba el proceso.
      return Promise.reject(new TypeError(`fetch bloqueado por QA_BLOCK_EXTERNAL: ${host}`));
    }
    return fetchReal.call(this, input, init);
  };

  process.on("exit", () => {
    const total = [...bloqueados.values()].reduce((s, n) => s + n, 0);
    const detalle = [...bloqueados.entries()].map(([h, n]) => `${h}: ${n}`).join(", ");
    process.stderr.write(`[qa] fetch bloqueados: ${total}${detalle ? ` (${detalle})` : ""}\n`);
  });

  partes.push("red externa bloqueada");
} else {
  partes.push("red externa libre");
}

if (process.env.QA_FREEZE || process.env.QA_BLOCK_EXTERNAL === "1") {
  process.stderr.write(`[qa] ${partes.join(" · ")} · TZ=${process.env.TZ ?? "(sin fijar)"}\n`);
}
