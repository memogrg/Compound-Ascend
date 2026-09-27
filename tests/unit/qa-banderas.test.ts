/**
 * Las banderas con las que se COMPILÓ una captura, y por qué el diff no puede ignorarlas.
 *
 * Costó una corrida entera: la línea base se compiló con `NEXT_PUBLIC_NAV_V2=1` y la rama sin
 * ella, y un PR que solo cambiaba DOS textos salió con 169 de 200 capturas distintas. El diff
 * no mentía —la navegación entera era otra— pero la comparación no valía nada, y nada en el
 * snapshot decía por qué.
 *
 * No se puede comprobar con un grep al bundle: Turbopack PLIEGA `process.env.X === "1"` en
 * tiempo de compilación, así que la rama muerta desaparece y el valor no deja rastro textual.
 * La bandera tiene que viajar como dato, y el único sitio que sabe con qué se compiló es el
 * propio build: de ahí sale la cabecera, y de la cabecera el manifiesto.
 *
 * Las dos mitades viven en lenguajes distintos —`next.config.ts` la escribe, `scripts/qa/*.mjs`
 * la lee— así que el caso de ida y vuelta de abajo es lo que impide que se separen.
 */
import { describe, it, expect } from "vitest";

import {
  BANDERAS_UI,
  CABECERA_BANDERAS,
  banderasDeCompilacion,
  cabeceraBanderas,
} from "@/lib/qa/banderas";
// La directiva va en la línea de ANTES del especificador, así que el import queda en una sola
// línea aunque sea larga: con el import partido, el error cae en la línea del `from` y la
// directiva queda «sin usar» (TS2578). Mismo patrón que comparar-pixeles.test.ts.
// prettier-ignore
// @ts-expect-error — .mjs sin tipos
import { parsearCabecera, diferenciasDeBanderas, CABECERA_BANDERAS as CABECERA_LECTOR, SIN_BANDERAS as SIN_BANDERAS_LECTOR } from "../../scripts/qa/banderas.mjs";

describe("banderas de compilación", () => {
  it("solo mira las banderas de interfaz, no las URLs ni las claves", () => {
    const env = {
      NEXT_PUBLIC_NAV_V2: "1",
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ey…",
      NEXT_PUBLIC_APP_URL: "https://app",
    };
    expect(banderasDeCompilacion(env)).toEqual({ NAV_V2: "1" });
    // Y la lista es explícita: nadie entra por parecerse a una bandera.
    expect(BANDERAS_UI).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("una bandera vacía cuenta como ausente", () => {
    expect(banderasDeCompilacion({ NEXT_PUBLIC_NAV_V2: "" })).toEqual({});
    expect(cabeceraBanderas({ NEXT_PUBLIC_NAV_V2: "" })).toBe("(ninguna)");
  });

  it("la cabecera es estable: mismo entorno, misma cadena", () => {
    const env = { NEXT_PUBLIC_NAV_V2: "1" };
    expect(cabeceraBanderas(env)).toBe("NAV_V2=1");
    expect(cabeceraBanderas(env)).toBe(cabeceraBanderas({ ...env }));
  });

  it("las dos mitades usan el mismo nombre de cabecera y el mismo «ninguna»", () => {
    // Están duplicados porque una mitad es `.ts` (la escribe `next.config.ts`) y la otra `.mjs`
    // (la leen los scripts de QA). Si se separan, la captura queda sin etiquetar en silencio.
    expect(CABECERA_LECTOR).toBe(CABECERA_BANDERAS);
    expect(SIN_BANDERAS_LECTOR).toBe(cabeceraBanderas({}));
  });

  it("ida y vuelta: lo que escribe el build es lo que lee el diff", () => {
    for (const env of [{}, { NEXT_PUBLIC_NAV_V2: "1" }, { NEXT_PUBLIC_NAV_V2: "0" }]) {
      expect(parsearCabecera(cabeceraBanderas(env))).toEqual(banderasDeCompilacion(env));
    }
  });
});

describe("la cabecera no puede filtrar nada que no sea una bandera pública", () => {
  // La cabecera viaja en TODA respuesta, así que lo que entre ahí es público de verdad. Que hoy
  // la lista tenga una sola entrada no es una garantía: la garantía es que la lista solo admita
  // `NEXT_PUBLIC_*` y que nada más del entorno pueda colarse por parecerse.
  it("toda bandera de la lista es una variable NEXT_PUBLIC_", () => {
    expect(BANDERAS_UI.length).toBeGreaterThan(0);
    for (const nombre of BANDERAS_UI) {
      expect(nombre, `«${nombre}» no es pública`).toMatch(/^NEXT_PUBLIC_[A-Z0-9_]+$/);
    }
  });

  it("un entorno lleno de secretos no aporta ni un carácter a la cabecera", () => {
    const secretos = {
      SUPABASE_SERVICE_ROLE_KEY: "sk-servicio-1234567890",
      CRON_SECRET: "cron-9876543210",
      GEMINI_API_KEY: "gemini-abcdefghij",
      STRIPE_SECRET_KEY: "sk_live_zyxwvutsrq",
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      // Y también las públicas que NO son banderas de interfaz: la URL y la anon key viajan en
      // el bundle de todos modos, pero no tienen nada que hacer en una etiqueta de captura.
      NEXT_PUBLIC_SUPABASE_URL: "https://proyecto.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      NEXT_PUBLIC_APP_URL: "https://carteraplus.example",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA-turnstile",
      NEXT_PUBLIC_SENTRY_DSN: "https://abc@o1.ingest.sentry.io/2",
      // Dos que se PARECEN a una bandera pero no están en la lista. Sus valores son
      // distintivos a propósito: con un "1" pelado la aserción de «no contiene el valor»
      // chocaría con el "1" legítimo de NAV_V2 y fallaría por el arnés, no por una fuga.
      NEXT_PUBLIC_NAV_V3: "v3-no-debe-salir",
      NEXT_PUBLIC_NAV_V2_EXTRA: "extra-no-debe-salir",
      // Y la única que sí debe salir.
      NEXT_PUBLIC_NAV_V2: "1",
    };
    const cabecera = cabeceraBanderas(secretos);
    expect(cabecera).toBe("NAV_V2=1");

    for (const [nombre, valor] of Object.entries(secretos)) {
      if ((BANDERAS_UI as readonly string[]).includes(nombre)) continue;
      expect(cabecera, `se filtró el valor de ${nombre}`).not.toContain(valor);
      expect(cabecera, `se filtró el nombre de ${nombre}`).not.toContain(
        nombre.replace(/^NEXT_PUBLIC_/, ""),
      );
    }
  });

  it("y la cabecera solo puede contener claves que salgan de la lista", () => {
    // Todo el entorno real de este proceso: lo que salga tiene que venir de `BANDERAS_UI`.
    const permitidas = new Set(BANDERAS_UI.map((n) => n.replace(/^NEXT_PUBLIC_/, "")));
    for (const clave of Object.keys(banderasDeCompilacion(process.env))) {
      expect(permitidas.has(clave), `clave inesperada: ${clave}`).toBe(true);
    }
  });
});

describe("diferencias entre dos capturas", () => {
  it("iguales ⇒ sin diferencias", () => {
    expect(diferenciasDeBanderas("NAV_V2=1", "NAV_V2=1")).toEqual([]);
    expect(diferenciasDeBanderas("(ninguna)", "(ninguna)")).toEqual([]);
  });

  it("nombra la bandera y los dos valores, incluido «ausente»", () => {
    expect(diferenciasDeBanderas("NAV_V2=1", "(ninguna)")).toEqual([
      { bandera: "NAV_V2", base: "1", nueva: "ausente" },
    ]);
    expect(diferenciasDeBanderas("(ninguna)", "NAV_V2=1")).toEqual([
      { bandera: "NAV_V2", base: "ausente", nueva: "1" },
    ]);
    expect(diferenciasDeBanderas("NAV_V2=1", "NAV_V2=0")).toEqual([
      { bandera: "NAV_V2", base: "1", nueva: "0" },
    ]);
  });

  it("desconocidas NO son «distintas»: una captura vieja no invalida la comparación", () => {
    // `null` es «no lo sé» (manifiesto anterior a esta guarda), y eso se avisa, no se bloquea.
    expect(diferenciasDeBanderas(null, "NAV_V2=1")).toEqual([]);
    expect(diferenciasDeBanderas("NAV_V2=1", null)).toEqual([]);
  });
});
