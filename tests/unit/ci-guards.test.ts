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

  it("el job de a11y siembra con DEMO_ENV_FILE, nunca contra producción", () => {
    // El sembrador BORRA y reescribe las cuentas de demo, y esas cuentas existen también en
    // producción: por eso exige que el entorno se nombre. El fichero que se le nombra acá lo
    // escribe el propio job con la URL del stack efímero que acaba de arrancar.
    const bloque = DIRECTIVAS.slice(DIRECTIVAS.indexOf("  e2e_a11y:"));
    expect(bloque).toContain("DEMO_ENV_FILE=.env.local node scripts/demo/seed-demo-familia.mjs");
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
