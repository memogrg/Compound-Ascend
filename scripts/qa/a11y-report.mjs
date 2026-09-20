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

const totales = Object.fromEntries(IMPACTOS.map((i) => [i, 0]));
const porRegla = new Map();

for (const c of corridas) {
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

const top = [...porRegla.values()].sort((a, b) => b.nodos - a.nodos).slice(0, 5);
const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const motor = corridas[0]?.testEngine;

const filas = corridas
  .map((c) => {
    const i = porImpacto(c);
    const total = IMPACTOS.reduce((s, k) => s + i[k], 0);
    return `| \`${c.route}\` | ${c.width} | ${i.critical} | ${i.serious} | ${i.moderate} | ${i.minor} | **${total}** |`;
  })
  .join("\n");

const md = `# Línea base de accesibilidad

Inventario, no puerta: **este informe no corrige nada y el spec no falla**. Mide el estado
actual para que cada pantalla que se rediseñe pueda compararse contra él.

- **SHA**: \`${sha}\`
- **Instante congelado**: \`${process.env.QA_FREEZE ?? "(sin QA_FREEZE)"}\`
- **Motor**: ${motor ? `${motor.name} ${motor.version}` : "(desconocido)"}
- **Reglas**: \`wcag2a\`, \`wcag2aa\`, \`wcag21a\`, \`wcag21aa\`
- **Anchos**: 1280 y 390 · tema claro · ${corridas.length} combinaciones

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

## Totales

| Impacto | Nodos |
| --- | --- |
${IMPACTOS.map((i) => `| ${i} | ${totales[i]} |`).join("\n")}
| **total** | **${IMPACTOS.reduce((s, k) => s + totales[k], 0)}** |

## Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
${top
  .map(
    (r) =>
      `| \`${r.id}\` | ${r.impact ?? "—"} | ${r.nodos} | ${r.rutas.size} | \`${(r.ejemplo || "—").slice(0, 60)}\` |`,
  )
  .join("\n")}

${top.map((r) => `- **\`${r.id}\`** — ${r.descripcion}`).join("\n")}

## Por ruta y ancho

Conteo por **nodos** afectados, no por reglas: una sola regla puede afectar decenas de
elementos, y eso es lo que hay que arreglar.

| Ruta | Ancho | critical | serious | moderate | minor | total |
| --- | --- | --- | --- | --- | --- | --- |
${filas}

Los JSON crudos de cada corrida (con el detalle de cada nodo) quedan en \`qa-snapshots/a11y/\`,
fuera de git.
`;

await writeFile(SALIDA, md);
console.log(`${SALIDA} — ${corridas.length} corridas, ${porRegla.size} reglas distintas`);
console.log("totales:", IMPACTOS.map((i) => `${i}: ${totales[i]}`).join(" · "));
console.log("top 5:", top.map((r) => `${r.id} (${r.nodos})`).join(", "));
