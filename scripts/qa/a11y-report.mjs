#!/usr/bin/env node
/**
 * Convierte los JSON crudos de `npm run test:a11y` en el informe legible que sí se versiona.
 *
 * Los crudos viven en `qa-snapshots/a11y/` (ignorado por git, como el resto de capturas);
 * el informe va a `docs/cartera-plus-redesign/qa/a11y-baseline.md`, que es lo que se lee y
 * se compara entre corridas.
 *
 *   node scripts/qa/a11y-report.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const ENTRADA = "qa-snapshots/a11y";
const SALIDA = "docs/cartera-plus-redesign/qa/a11y-baseline.md";
const IMPACTOS = ["critical", "serious", "moderate", "minor"];

const archivos = (await readdir(ENTRADA)).filter((f) => f.endsWith(".json")).sort();
if (archivos.length === 0) {
  console.error(`No hay JSON en ${ENTRADA}. Corré primero: npm run test:a11y`);
  process.exit(1);
}

const corridas = [];
for (const f of archivos) {
  corridas.push(JSON.parse(await readFile(path.join(ENTRADA, f), "utf8")));
}

/** Nodos por impacto de una corrida. Se cuenta por NODO, no por regla: una regla puede
 *  afectar 40 elementos y eso es lo que hay que arreglar. */
function porImpacto(c) {
  const out = Object.fromEntries(IMPACTOS.map((i) => [i, 0]));
  for (const v of c.violations) {
    const k = IMPACTOS.includes(v.impact) ? v.impact : "minor";
    out[k] += v.nodes.length;
  }
  return out;
}

/**
 * Totales y reglas de un SUBCONJUNTO de corridas. Antes se agregaba todo junto; desde que
 * `/m` entró al inventario hace falta por superficie: son dos apps distintas y sumar sus
 * nodos daría un número que no le sirve a ninguna de las dos para compararse consigo misma.
 */
function agregar(corridasDe) {
  const totales = Object.fromEntries(IMPACTOS.map((i) => [i, 0]));
  const porRegla = new Map();
  for (const c of corridasDe) {
    const imp = porImpacto(c);
    for (const i of IMPACTOS) totales[i] += imp[i];
    for (const v of c.violations) {
      const prev = porRegla.get(v.id) ?? {
        id: v.id,
        impact: v.impact,
        nodos: 0,
        rutas: new Set(),
        ejemplo: v.nodes[0]?.target?.join(" ") ?? "",
        descripcion: v.help,
      };
      prev.nodos += v.nodes.length;
      prev.rutas.add(c.route);
      if (!prev.ejemplo && v.nodes[0]) prev.ejemplo = v.nodes[0].target?.join(" ") ?? "";
      porRegla.set(v.id, prev);
    }
  }
  return { totales, porRegla };
}

const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const motor = corridas[0]?.testEngine;

/** Una sección completa del informe para una superficie. */
function seccion(titulo, intro, corridasDe) {
  if (corridasDe.length === 0) return "";
  const { totales, porRegla } = agregar(corridasDe);
  const top = [...porRegla.values()].sort((a, b) => b.nodos - a.nodos).slice(0, 5);
  const filas = corridasDe
    .map((c) => {
      const i = porImpacto(c);
      const total = IMPACTOS.reduce((s, k) => s + i[k], 0);
      return `| \`${c.route}\` | ${c.width} | ${i.critical} | ${i.serious} | ${i.moderate} | ${i.minor} | **${total}** |`;
    })
    .join("\n");

  return `
## ${titulo}

${intro}

### Totales

| Impacto | Nodos |
| --- | --- |
${IMPACTOS.map((i) => `| ${i} | ${totales[i]} |`).join("\n")}
| **total** | **${IMPACTOS.reduce((s, k) => s + totales[k], 0)}** |

### Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
${top
  .map(
    (r) =>
      `| \`${r.id}\` | ${r.impact ?? "—"} | ${r.nodos} | ${r.rutas.size} | \`${(r.ejemplo || "—").slice(0, 60)}\` |`,
  )
  .join("\n")}

${top.map((r) => `- **\`${r.id}\`** — ${r.descripcion}`).join("\n")}

### Por ruta y ancho

| Ruta | Ancho | critical | serious | moderate | minor | total |
| --- | --- | --- | --- | --- | --- | --- |
${filas}
`;
}

// `superficie` la escribe `routes.spec.ts`; los JSON anteriores a ese campo son web.
const web = corridas.filter((c) => (c.superficie ?? "web") === "web");
const movil = corridas.filter((c) => c.superficie === "m");

const md = `# Línea base de accesibilidad

Inventario, no puerta: **este informe no corrige nada y el spec no falla**. Mide el estado
actual para que cada pantalla que se rediseñe pueda compararse contra él.

Las dos superficies van **separadas**: la web (\`/dashboard\`, \`/gastos\`…) y la app móvil
(\`/m/*\`). Son dos apps con su propio shell y su propia hoja de estilos, y un total común
no le serviría a ninguna para compararse consigo misma con el tiempo.

- **SHA**: \`${sha}\`
- **Instante congelado**: \`${process.env.QA_FREEZE ?? "(sin QA_FREEZE)"}\`
- **Motor**: ${motor ? `${motor.name} ${motor.version}` : "(desconocido)"}
- **Reglas**: \`wcag2a\`, \`wcag2aa\`, \`wcag21a\`, \`wcag21aa\`
- **Combinaciones**: ${corridas.length} · web ${web.length} · \`/m\` ${movil.length} · tema claro

Regenerar:

\`\`\`bash
# Terminal A
QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
# Terminal B
E2E_EMAIL=… E2E_PASSWORD=… npm run test:a11y
node scripts/qa/a11y-report.mjs
\`\`\`

El servidor va congelado a propósito: sin eso, una fecha o un precio distinto cambia el DOM
y con él el conteo de nodos, y el inventario deja de ser comparable entre días.

El conteo es por **nodos** afectados, no por reglas: una sola regla puede afectar decenas de
elementos, y eso es lo que hay que arreglar.
${seccion("Web", "Anchos 1280 y 390.", web)}${seccion(
  "Superficie `/m` (app móvil)",
  "Solo a 390: `/m` es un shell de teléfono con el viewport bloqueado, y a 1280 se vería una pantalla que en un dispositivo real no existe.",
  movil,
)}
Los JSON crudos de cada corrida (con el detalle de cada nodo) quedan en \`qa-snapshots/a11y/\`,
fuera de git.
`;

await writeFile(SALIDA, md);
console.log(`${SALIDA} — ${corridas.length} corridas (web ${web.length}, /m ${movil.length})`);
for (const [etiqueta, grupo] of [
  ["web", web],
  ["/m ", movil],
]) {
  if (grupo.length === 0) continue;
  const { totales, porRegla } = agregar(grupo);
  const total = IMPACTOS.reduce((s, k) => s + totales[k], 0);
  console.log(
    `${etiqueta}: ${total} nodos · ${IMPACTOS.map((i) => `${i} ${totales[i]}`).join(" · ")} · ` +
      `${porRegla.size} reglas → ${[...porRegla.values()]
        .sort((a, b) => b.nodos - a.nodos)
        .map((r) => `${r.id} (${r.nodos})`)
        .join(", ")}`,
  );
}
