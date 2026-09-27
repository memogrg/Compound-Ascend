#!/usr/bin/env node
/**
 * ¿Está la base local al día con `supabase/migrations/`?
 *
 * Existe por un caso concreto que costó una sesión entera: `/patrimonio` mostraba ₡0 con dos
 * posiciones en la tabla. La causa no estaba en el código sino en la base local, que iba 24
 * migraciones por detrás: `investment_holdings` no tenía las columnas `payout_*`, el `select`
 * de `listHoldings` devolvía 400 y `(data ?? [])` lo convertía en «este usuario no tiene
 * inversiones». Una pantalla vacía y correcta según la app.
 *
 * Nada lo avisaba. El job «Migraciones aplican en BD fresca» prueba que las migraciones corren
 * sobre una base vacía, no que la base de nadie esté al día. Así que lo avisa el arranque de QA:
 * capturar una pantalla contra una base atrasada produce evidencia falsa, y es peor que no
 * capturar nada.
 *
 * El estado se lee con `supabase migration list --local`, que es la fuente de la verdad
 * (`supabase_migrations.schema_migrations`) y no pide ni `psql` ni adivinar el nombre del
 * contenedor de Docker. Devuelve JSON con un par por migración: `local` es el fichero del repo,
 * `remote` la versión aplicada — vacía cuando falta.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

/**
 * Las que están en el repo y NO en la base, en orden.
 *
 * Pura: recibe los pares tal cual los da el CLI. El resto del fichero es IO, y esto es lo único
 * que puede equivocarse de cuenta.
 */
/**
 * @param {Array<{ local?: string, remote?: string } | null | undefined>} pares
 *   Los pares tal cual los da `supabase migration list --local`.
 * @returns {string[]} Las versiones que están en el repo y no en la base, en orden.
 */
export function migracionesFaltantes(pares) {
  return pares
    .filter((m) => m && m.local && !m.remote)
    .map((m) => String(m.local))
    .sort();
}

/** El comando que las aplica, para no obligar a nadie a recordarlo. */
/**
 * @param {string[]} faltantes
 * @returns {string|null} El comando que las aplica, o `null` si no falta ninguna.
 */
export function comandoParaAplicar(faltantes) {
  if (faltantes.length === 0) return null;
  return `supabase db push --local   # o, si ya están aplicadas a mano: supabase migration repair --status applied ${faltantes.join(" ")}`;
}

/**
 * Lee el estado de la base local. Devuelve `null` cuando no se puede leer —CLI ausente, stack
 * apagado—, que NO es lo mismo que «está al día»: quien llama decide qué hacer con la duda.
 */
/**
 * @param {{ cwd?: string }} [opciones]
 * @returns {Promise<Array<{ local?: string, remote?: string }>|null>} `null` si no se pudo leer.
 */
export async function leerEstado({ cwd = process.cwd() } = {}) {
  try {
    const { stdout } = await ejecutar("supabase", ["migration", "list", "--local"], {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
    });
    // El CLI imprime una línea de cortesía («Connecting to local database…») antes del JSON.
    const i = stdout.indexOf("{");
    if (i === -1) return null;
    const datos = JSON.parse(stdout.slice(i));
    return Array.isArray(datos?.migrations) ? datos.migrations : null;
  } catch {
    return null;
  }
}

/**
 * La guarda: revienta si falta alguna, nombrándolas.
 *
 * `QA_SKIP_MIGRACIONES=1` la salta, y lo dice en voz alta. Existe para no dejar a nadie
 * bloqueado, no para usarse a diario: una captura tomada con la guarda saltada no vale como
 * evidencia, por el mismo motivo que la guarda existe.
 */
/**
 * @param {{ cwd?: string, log?: { warn: (m: string) => void, error: (m: string) => void } }} [opciones]
 * @returns {Promise<{ saltada: boolean, faltantes: string[] }>}
 */
export async function exigirBaseAlDia({ cwd = process.cwd(), log = console } = {}) {
  if (process.env.QA_SKIP_MIGRACIONES === "1") {
    log.warn("\n  ⚠ QA_SKIP_MIGRACIONES=1: no se comprobó la paridad de la base.");
    log.warn("    Lo que se capture así NO vale como evidencia.\n");
    return { saltada: true, faltantes: [] };
  }

  const pares = await leerEstado({ cwd });
  if (pares === null) {
    log.error("\n  ✖ No se pudo leer el estado de las migraciones de la base local.");
    log.error("    Hace falta el CLI de Supabase y el stack levantado:");
    log.error("      supabase start");
    log.error("    Para arrancar igualmente, a sabiendas: QA_SKIP_MIGRACIONES=1\n");
    process.exit(2);
  }

  const faltantes = migracionesFaltantes(pares);
  if (faltantes.length === 0) return { saltada: false, faltantes };

  log.error(`\n  ✖ La base local va ${faltantes.length} migración(es) por detrás del repo.\n`);
  log.error("    Faltan por aplicar:");
  for (const v of faltantes) log.error(`      ${v}`);
  log.error("\n    Aplicalas con:");
  log.error(`      ${comandoParaAplicar(faltantes)}`);
  log.error(
    "\n    No se arranca: una captura contra una base atrasada es evidencia falsa. Una\n" +
      "    columna que el código pide y la base no tiene sale como 400, y el servicio la\n" +
      "    convierte en «sin datos» — la pantalla queda vacía y parece correcta.\n",
  );
  process.exit(2);
}
