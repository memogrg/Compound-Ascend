/**
 * Los guards del CI no pueden desactivarse en silencio.
 *
 * Contexto: el job E2E vivía con `continue-on-error: true`. El día que atrapó un
 * bug real —una migración que dejaba `handle_new_user` lanzando, con lo cual
 * NINGÚN usuario podía registrarse— el job dio `failure` y el workflow reportó
 * `success` igual. Un guard que mira para otro lado es peor que no tenerlo:
 * ocupa el lugar de la comprobación que sí habría bloqueado.
 *
 * Este test vigila el archivo del workflow. No puede comprobar la otra mitad
 * —que el check esté marcado como REQUERIDO en branch protection—, porque eso
 * vive en la configuración del repositorio y no en el código.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const CI = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

/** Quita los comentarios: lo que se mide son directivas, no la documentación. */
const DIRECTIVAS = CI.split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

describe("ningún job del CI se salta su propio veredicto", () => {
  it("no hay `continue-on-error: true` en ningún job", () => {
    // Es la directiva que hace que un job en failure no tumbe el workflow.
    expect(DIRECTIVAS).not.toMatch(/continue-on-error:\s*true/);
  });

  it("ningún paso ignora su fallo con `|| true`", () => {
    // La otra forma de enmascarar: un comando que siempre sale con 0.
    expect(DIRECTIVAS).not.toMatch(/\|\|\s*true\s*$/m);
  });
});

describe("los guards siguen existiendo", () => {
  const ESPERADOS = [
    "Lint, Typecheck, Test & Build",
    "Migraciones aplican en BD fresca",
    "E2E smoke",
    // La suite de accesibilidad entra a CI porque su ausencia ya costó: 22 casos en rojo en
    // la máquina con el PR en verde, y nadie se enteró hasta correrla a mano.
    "E2E a11y",
  ];

  it("los jobs están declarados con su nombre", () => {
    // El nombre es lo que branch protection referencia: renombrarlo sin más
    // desengancha el check requerido y el guard deja de bloquear en la práctica.
    for (const nombre of ESPERADOS) {
      expect(DIRECTIVAS, `falta el job "${nombre}"`).toContain(`name: ${nombre}`);
    }
  });

  it("el E2E ya no se anuncia como no bloqueante", () => {
    // El nombre viejo ("E2E smoke (no bloqueante por ahora)") decía la verdad
    // cuando lo era. Ahora sería una mentira, y el nombre es lo que se lee en el PR.
    expect(CI).not.toContain("no bloqueante por ahora");
  });

  it("el E2E corre en los pull requests, que es donde tiene que bloquear", () => {
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  e2e:"));
    expect(bloque).toContain("github.event_name == 'pull_request'");
  });
});

/**
 * La caché de imágenes del stack, en los TRES jobs que arrancan Supabase.
 *
 * Los dos jobs E2E no la tenían, por una decisión medida en su momento (bajar era un minuto
 * más rápido que restaurar). La revertimos cuando el minuto dejó de ser el problema: en una
 * sola noche, tres corridas murieron con `toomanyrequests: Data limit exceeded` bajando esas
 * imágenes, y cada relanzamiento gastaba el cupo del siguiente.
 *
 * Esto vigila que no se caiga otra vez sin querer, y que la clave siga llevando las tres cosas
 * que deciden QUÉ se baja — versión del CLI, `config.toml` y la lista de exclusiones — porque
 * una clave que no cambia con ellas sirve un tarball viejo y el arranque falla por dentro.
 */
describe("la caché de imágenes del stack", () => {
  // migrations, E2E smoke, E2E nav-v2, E2E a11y y los dos de capturas visuales.
  const JOBS_CON_SUPABASE = 6;

  it("está en todos los jobs que levantan el stack", () => {
    for (const paso of [
      "Caché de imágenes del stack",
      "Cargar imágenes de la caché",
      "Guardar imágenes para la próxima corrida",
    ]) {
      expect(DIRECTIVAS.split(`name: ${paso}`).length - 1, `«${paso}»`).toBe(JOBS_CON_SUPABASE);
    }
  });

  it("dos jobs solo comparten clave si excluyen los MISMOS servicios", () => {
    // Una clave compartida entre jobs que excluyen cosas distintas serviría el tarball de
    // `migrations` —que excluye trece servicios— a los E2E, que necesitan ocho: el arranque
    // fallaría bajando lo que falta, que es justo lo que la caché venía a evitar.
    //
    // Compartirla entre jobs con las MISMAS exclusiones sí es correcto y deseable: es el
    // mismo tarball. Por eso la regla no es «una clave por job» —eso obligaría a duplicar
    // entradas sin motivo— sino que el token y las exclusiones vayan de la mano.
    const porJob = [...DIRECTIVAS.matchAll(/^  ([a-z0-9_]+):$/gm)]
      .map((m, i, todos) => {
        const desde = m.index ?? 0;
        const hasta = todos[i + 1]?.index ?? DIRECTIVAS.length;
        return DIRECTIVAS.slice(desde, hasta);
      })
      .map((bloque) => ({
        token: /valor=imagenes-v2-[^\n]*?-([a-z0-9${}. ]+?)-\$CFG/.exec(bloque)?.[1],
        excluye: /EXCLUIR_SERVICIOS:\s*([^\n]+)/.exec(bloque)?.[1]?.trim(),
      }))
      .filter((x) => x.token);

    expect(porJob.length, "jobs con caché de imágenes").toBe(JOBS_CON_SUPABASE);
    const porToken = new Map<string, Set<string>>();
    for (const { token, excluye } of porJob) {
      if (!porToken.has(token!)) porToken.set(token!, new Set());
      porToken.get(token!)!.add(excluye ?? "(sin declarar)");
    }
    for (const [token, exclusiones] of porToken) {
      expect(
        exclusiones.size,
        `el token «${token}» lo comparten jobs que excluyen cosas distintas: ${[...exclusiones].join(" | ")}`,
      ).toBe(1);
    }
  });

  it("la clave cambia con el CLI, con config.toml y con las exclusiones", () => {
    const bloques = DIRECTIVAS.split("valor=imagenes-v2-").slice(1);
    expect(bloques).toHaveLength(JOBS_CON_SUPABASE);
    for (const b of bloques) {
      const linea = b.split("\n")[0] ?? "";
      expect(linea, linea).toContain("SUPABASE_CLI_VERSION");
      expect(linea, linea).toContain("$CFG");
      expect(linea, linea).toContain("$EXC");
    }
    expect(DIRECTIVAS).toContain("sha256sum supabase/config.toml");
  });

  it("el job de a11y corre la suite ENTERA: se parte por shards, nunca por ficheros", () => {
    // Acotarla a unos specs es lo que la volvería inútil: los 21 casos que se rompieron
    // estaban repartidos entre tres ficheros que nadie habría elegido a mano. Partirla por
    // SHARD no elige nada — Playwright reparte todo lo que hay — y por eso es la única forma
    // de partirla que no deja un hueco.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  e2e_a11y:"));
    expect(bloque).toContain("npx playwright test -c playwright.a11y.config.ts --shard=");
    // Ni un nombre de fichero detrás del config: eso sí sería acotar.
    expect(bloque).not.toMatch(/playwright\.a11y\.config\.ts[^\n]*\.spec\.ts/);
    // Y los shards cubren el total: si alguien pone 1/3 y 2/3, falta un tercio.
    const shards = [...bloque.matchAll(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(shards.length, "el shard sale de la matriz").toBeGreaterThan(0);
    const matriz = bloque.match(/shard: \[([^\]]+)\]/)?.[1] ?? "";
    const cuantos = matriz.split(",").filter((x) => x.trim()).length;
    for (const total of shards)
      expect(total, `matriz de ${cuantos} contra /${total}`).toBe(cuantos);
  });

  it("el job de a11y siembra con DEMO_ENV_FILE y contra la cuenta sintética", () => {
    // El sembrador BORRA y reescribe las cuentas de demo, y su default es el buzón REAL de la
    // demo de producción: por eso exige que el entorno se nombre (`DEMO_ENV_FILE`) y por eso
    // acá se le reapunta el correo (`DEMO_EMAIL_OVERRIDE`). Sin el override, una corrida de CI
    // reescribe la cuenta de producción. El fichero de entorno lo escribe el propio job con la
    // URL del stack efímero que acaba de arrancar.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  e2e_a11y:"));
    expect(bloque).toMatch(
      /DEMO_ENV_FILE=\.env\.local DEMO_EMAIL_OVERRIDE=\S+ node scripts\/demo\/seed-demo-familia\.mjs/,
    );
    expect(bloque).toContain("> .env.local");
  });

  it("la siembra y la app comparten instante: ni un `now()` en el período sembrado", () => {
    // Si la siembra ancla en el reloj real y la app va congelada, un cruce de mes deja los
    // datos en octubre y la pantalla mirando septiembre: el panel sale vacío y el fallo
    // parece de la pantalla. El instante lo calcula el arnés una vez y lo leen los dos.
    expect(DIRECTIVAS).not.toContain("extract(year from now())");
    expect(DIRECTIVAS).not.toContain("extract(month from now())");
    expect(DIRECTIVAS).toContain("instanteCongelado()");
    expect(DIRECTIVAS).toContain('echo "QA_FREEZE=$INSTANTE" >> "$GITHUB_ENV"');
  });

  it("sin capturas de la base, el diff visual NO se pone verde", () => {
    // Un diff que no se pudo hacer no es un diff que salió bien. Dar verde ahí es exactamente
    // la medida falsa que este job viene a impedir: el PR luciría revisado sin que nadie
    // comparara nada.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  diff_visual:"));
    expect(bloque).toMatch(/no existe ninguna corrida[\s\S]*?exit 1/);
    expect(bloque).toMatch(/terminó en \$ESTADO[\s\S]*?exit 1/);
    // Y espera a la corrida de la base si va por delante, en vez de rendirse al primer no.
    expect(bloque).toContain("sleep 60");
    expect(bloque).toMatch(/seq 1 25/);
  });

  it("ningún correo de un dominio REAL está escrito en el workflow", () => {
    // Un correo personal en un fichero público del repo es un dato de contacto regalado a
    // cualquiera que mire el historial. Va en una variable del repositorio.
    //
    // Se permiten los sintéticos en `.local` —`e2e@ci.local` es del propio CI y no existe
    // fuera de él—. La primera versión de esta guarda los señalaba también, y una guarda que
    // obliga a cambiar código correcto se gana que la siguiente persona la quite entera.
    const reales = [...DIRECTIVAS.matchAll(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi)]
      .map((m) => m[0])
      .filter((c) => !c.endsWith(".local"));
    expect(reales, `correo(s) de dominio real: ${reales.join(", ")}`).toEqual([]);

    // Y la cuenta demo NO vuelve a salir de `vars.DEMO_EMAIL`. Esa variable apuntaba al buzón
    // real de la demo de producción, así que «esconderlo en una variable» resolvía la mitad
    // visible del problema y dejaba la otra: cada corrida de CI borraba y reescribía una
    // cuenta de producción, y el correo igual acababa impreso en los logs del job. Un
    // sintético en `.local` —TLD reservado, RFC 6762— se puede escribir a la vista porque no
    // hay buzón detrás que proteger.
    expect(DIRECTIVAS).not.toContain("vars.DEMO_EMAIL");
    expect(DIRECTIVAS).toContain("DEMO_EMAIL_OVERRIDE=");
  });

  it("el job de migraciones corre tests/rls con las TRES credenciales y sin omitir", () => {
    // Medido: con `SUPABASE_TEST_URL` y `_SERVICE_ROLE_KEY` pero SIN `_ANON_KEY`, vitest sale
    // 0 y el resumen dice «25 skipped (25)». O sea: el job se pone verde habiendo corrido cero
    // pruebas. Seis de los siete ficheros de `tests/rls` piden la ANON en su `skipIf`.
    //
    // Por eso se comprueban las tres exportaciones Y la guarda que convierte el silencio en
    // rojo. Quitar cualquiera de las dos cosas devuelve el verde falso.
    const bloque = DIRECTIVAS.slice(
      DIRECTIVAS.indexOf("  migrations:"),
      DIRECTIVAS.indexOf("  ci:") > DIRECTIVAS.indexOf("  migrations:")
        ? DIRECTIVAS.indexOf("  ci:")
        : DIRECTIVAS.indexOf("  e2e:"),
    );
    for (const v of [
      "SUPABASE_TEST_URL",
      "SUPABASE_TEST_ANON_KEY",
      "SUPABASE_TEST_SERVICE_ROLE_KEY",
    ])
      expect(bloque, `export de ${v}`).toContain(`export ${v}=`);
    expect(bloque).toContain("npx vitest run tests/rls");
    expect(bloque, "la guarda del resumen").toMatch(/grep -q 'skipped'[\s\S]*?exit 1/);

    // Y el stack de ese job tiene que levantar las tres piezas que esos tests usan por HTTP:
    // sin kong no hay `/rest/v1` ni `/auth/v1`, sin gotrue no hay usuario de prueba, sin
    // postgrest no hay filas. Excluirlas dejaba el job aplicando esquema y nada más.
    const excluye = /EXCLUIR_SERVICIOS:\s*([^\n]+)/.exec(bloque)?.[1] ?? "";
    for (const s of ["kong", "gotrue", "postgrest"])
      expect(excluye.split(","), `«${s}» no puede estar excluido`).not.toContain(s);
  });

  it("los jobs de capturas reparten en tantos shards como dice su matriz", () => {
    // `--shard N/4` con una matriz de 2 captura la mitad del inventario y sube un artefacto que
    // PARECE completo: el diff compararía 100 de 200 y diría «nada se movió» de lo que no miró.
    // El desajuste no lo ve nadie leyendo el YAML —los dos números están a treinta líneas— así
    // que se comprueba que coincidan.
    for (const job of ["capturas_main", "capturas_rama"]) {
      const bloque =
        DIRECTIVAS.slice(DIRECTIVAS.indexOf(`  ${job}:`)).split(/\n  [a-z0-9_]+:\n/)[0] ?? "";
      const matriz = (/shard: \[([^\]]+)\]/.exec(bloque)?.[1] ?? "").split(",").length;
      const usos = [...bloque.matchAll(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((m) =>
        Number(m[1]),
      );
      const nombre = /name: Capturas de [^\n]*?\/(\d+)\)/.exec(bloque)?.[1];
      expect(usos.length, `${job}: un --shard`).toBe(1);
      expect(usos[0], `${job}: --shard /N contra matriz de ${matriz}`).toBe(matriz);
      expect(Number(nombre), `${job}: el nombre dice /N`).toBe(matriz);
    }
  });

  it("lo que la sonda marca viaja al diff dentro del artefacto", () => {
    // Los dos jobs no comparten disco. Si `marcar-inestables.mjs` no corre, el manifiesto llega
    // sin `rutasInestables` y el diff vuelve a culpar al PR de una pantalla que se mueve sola:
    // el hallazgo existiría solo en el log de un job que nadie abre.
    for (const job of ["capturas_main", "capturas_rama"]) {
      const bloque =
        DIRECTIVAS.slice(DIRECTIVAS.indexOf(`  ${job}:`)).split(/\n  [a-z0-9_]+:\n/)[0] ?? "";
      const iSonda = bloque.indexOf("sonda-determinismo.mjs");
      const iMarca = bloque.indexOf("marcar-inestables.mjs");
      const iSubida = bloque.indexOf("upload-artifact", iMarca);
      expect(iSonda, `${job}: corre la sonda`).toBeGreaterThan(-1);
      expect(iMarca, `${job}: marca las inestables`).toBeGreaterThan(iSonda);
      expect(iSubida, `${job}: y las sube después de marcarlas`).toBeGreaterThan(iMarca);
    }
    // Y el diff baja TODOS los shards por patrón, no por nombre: pasar de 2 a 4 no puede
    // requerir tocar el job que compara.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  diff_visual:"));
    expect(bloque).toContain("pattern: capturas-pr${{ github.event.number }}-*");
    expect(bloque).toMatch(/--pattern "capturas-\$BASE-\*"/);
  });

  it("todo job que compare PNG instala el navegador", () => {
    // `diff.mjs` decodifica los PNG dentro de un Chromium. El job que compara no lo instalaba,
    // y no se notó durante dos rondas porque siempre moría antes —resolviendo la base—, así que
    // el paso de comparar nunca llegó a ejecutarse. El síntoma, cuando por fin llegó, fue
    // «Executable doesn't exist at …/ms-playwright/…», que no se parece en nada a un problema
    // de diff visual.
    for (const job of ["diff_visual"]) {
      const bloque =
        DIRECTIVAS.slice(DIRECTIVAS.indexOf(`  ${job}:`)).split(/\n  [a-z0-9_]+:\n/)[0] ?? "";
      expect(bloque, `${job}: corre diff.mjs`).toContain("scripts/qa/diff.mjs");
      const iInstala = bloque.indexOf("playwright install");
      const iCompara = bloque.indexOf("scripts/qa/diff.mjs");
      expect(iInstala, `${job}: instala el navegador`).toBeGreaterThan(-1);
      expect(iInstala, `${job}: y lo instala ANTES de comparar`).toBeLessThan(iCompara);
    }
  });

  it("las capturas se saltan cuando el PR no toca interfaz", () => {
    // Cuatro jobs de captura por un cambio en un README son 40 minutos de runner tirados, y
    // el ruido acostumbra a mirar los verdes sin leerlos.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  toca_interfaz:"));
    expect(bloque).toContain("git diff --name-only");
    for (const ruta of ["src/", "public/", "scripts/qa/", "scripts/demo/"]) {
      expect(bloque, `falta ${ruta} en el filtro`).toContain(ruta);
    }
    expect(DIRECTIVAS).toContain("needs.toca_interfaz.outputs.si == 'true'");
  });

  it("la caché de Next no lleva un hash de `src/**`", () => {
    // Con él, la clave cambiaba en cada commit: no acertaba nunca y cada corrida escribía
    // ~450 MB que no se reusarían jamás. 21 entradas, 9,2 GB de un cupo de 10, y al pasarse
    // GitHub desaloja por antigüedad — empezando por la caché de imágenes.
    const clave = /key: next-\$\{\{ runner\.os \}\}-[^\n]*/.exec(DIRECTIVAS)?.[0] ?? "";
    expect(clave, "no se encontró la clave de la caché de Next").not.toBe("");
    expect(clave, clave).not.toContain("src/**");
  });
});

/**
 * Los jobs E2E corren también en push a main, y NO es un detalle de gusto.
 *
 * `actions/cache` restaura desde la rama actual y desde la rama por defecto. Mientras estos dos
 * jobs solo corrían en `pull_request`, su tarball de imágenes nunca llegaba a `refs/heads/main`,
 * así que ninguna rama nueva podía restaurarlo: medido en un PR de una línea abierto justo para
 * comprobarlo, `Pulling` fue 89, 96 y 63, sin una sola línea de «Cache restored from key:
 * imagenes-v2-…». La única caché que acertaba era la de `migrations`, el único job que ya corría
 * en push.
 */
describe("los jobs E2E pueblan la caché de la rama por defecto", () => {
  for (const job of ["e2e", "e2e_nav_v2"]) {
    it(`${job} corre en pull_request y en push`, () => {
      const desde = DIRECTIVAS.indexOf(`  ${job}:`);
      expect(desde, `no se encontró el job ${job}`).toBeGreaterThan(-1);
      const bloque = DIRECTIVAS.slice(desde, desde + 1200);
      expect(bloque).toContain("github.event_name == 'pull_request'");
      expect(bloque, `${job} no corre en push: su caché nunca llega a main`).toContain(
        "github.event_name == 'push'",
      );
    });
  }
});
