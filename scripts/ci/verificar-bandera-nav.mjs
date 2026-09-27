#!/usr/bin/env node
/**
 * ¿Corrieron de verdad los casos de la bandera, o se saltaron en silencio?
 *
 * El job compila con `NEXT_PUBLIC_NAV_V2=1` y los specs se saltan solos cuando la bandera está
 * apagada —`test.skip(!(await v2Encendida(page)))`—, así que un build sin la bandera daría
 * VERDE sin haber probado nada. Esa es exactamente la trampa que el job venía a evitar.
 *
 * El guardián anterior buscaba la clase `tb2-search` en el bundle, y no servía: la cadena está
 * en el código fuente y Turbopack la deja en el chunk aunque la rama esté muerta, así que el
 * grep pasaba con la bandera apagada. Buscar el valor inlinado tampoco sirve: Turbopack pliega
 * la comparación entera y no queda rastro textual. Un grep estático NO puede distinguirlo.
 *
 * Lo que sí lo distingue es el RESULTADO: si la bandera llegó, ningún caso se saltó por su
 * causa. Se lee el JSON de Playwright y se falla si algún salto menciona la bandera.
 *
 *   npx playwright test … --reporter=list,json  (con PLAYWRIGHT_JSON_OUTPUT_NAME)
 *   node scripts/ci/verificar-bandera-nav.mjs <ruta-del-json>
 */
import { readFileSync } from "node:fs";

const ruta = process.argv[2];
if (!ruta) {
  console.error("Falta la ruta del JSON de Playwright.");
  process.exit(2);
}

const informe = JSON.parse(readFileSync(ruta, "utf8"));
const saltados = [];
const recorrer = (suites = []) => {
  for (const s of suites) {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        if (!(t.results ?? []).some((r) => r.status === "skipped")) continue;
        // El motivo del salto vive en las ANOTACIONES, no en los errores del resultado: un
        // `test.skip(cond, "motivo")` no produce error, produce `{type:"skip", description}`.
        const motivo = (t.annotations ?? [])
          .filter((a) => a.type === "skip")
          .map((a) => a.description ?? "")
          .join(" ");
        saltados.push({ titulo: spec.title, motivo });
      }
    }
    recorrer(s.suites);
  }
};
recorrer(informe.suites);

const porLaBandera = saltados.filter((s) => /NAV_V2/i.test(s.motivo));
if (porLaBandera.length > 0) {
  // El mensaje NO afirma la causa. Decía «NEXT_PUBLIC_NAV_V2 no llegó al build», y una vez
  // fue falso: cinco casos del mismo archivo pasaron CON la bandera encendida y el sexto se
  // saltó porque contó los ítems de la barra antes de que terminara de montar. El guardián
  // sabe que un caso se saltó por la bandera; por qué, no puede saberlo desde aquí, y un
  // mensaje que se inventa la causa manda a buscar donde no está.
  console.error(`::error::${porLaBandera.length} caso(s) se saltaron por NEXT_PUBLIC_NAV_V2`);
  for (const s of porLaBandera) console.error(`  · ${s.titulo} — «${s.motivo}»`);
  console.error(
    "    Si se saltaron TODOS, la bandera no llegó al build. Si se saltó solo alguno, la\n" +
      "    sonda del propio spec midió antes de tiempo — mirá `v2Encendida` en su archivo.",
  );
  process.exit(1);
}

console.log(
  `la bandera llegó: ningún caso se saltó por su causa (${saltados.length} saltos por otros motivos)`,
);
for (const s of saltados) console.log(`  · ${s.titulo} — ${s.motivo || "sin motivo escrito"}`);
