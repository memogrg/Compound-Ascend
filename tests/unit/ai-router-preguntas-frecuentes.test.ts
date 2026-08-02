/**
 * Dos formas MUY comunes de preguntar que el router dejaba caer al modelo grande, con las
 * dos causas distintas que las tumbaban:
 *
 *  · "¿dónde se me va el dinero?" — la variante con "me" del "en qué gasto más". El patrón
 *    pedía "se va MI/EL/LA" y el pronombre intercalado lo rompía; "a dónde se va mi dinero"
 *    (sin "me") sí funcionaba, que es lo que hacía difícil de ver el agujero.
 *
 *  · "¿cómo van mis metas?" — NO era `meta\b` vs "metas" (la rama de `metas` ya traía el
 *    patrón "cómo va(n) mi(s) meta"): era el guard de REASONING_CUES, que atrapa "cómo" y
 *    corta ANTES, dejando esa rama inalcanzable para cualquier texto que dijera "cómo".
 *
 * La red de seguridad que NO se toca: si además de "cómo" hay señal de razonamiento, la
 * pregunta sigue escalando. Ante duda, escalá.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchIntent } from "@/lib/ai/router";

describe("«¿dónde se me va el dinero?» · variante de «en qué gasto más»", () => {
  it("atrapa el pronombre intercalado, que era el que rompía el patrón", () => {
    expect(matchIntent("¿dónde se me va el dinero?")?.intent).toBe("gasto_categoria");
    expect(matchIntent("dónde se me va la plata")?.intent).toBe("gasto_categoria"); // slang → dinero
    expect(matchIntent("en dónde se me va el dinero")?.intent).toBe("gasto_categoria");
  });

  it("no rompe las formas que ya andaban", () => {
    expect(matchIntent("a dónde se va mi dinero")?.intent).toBe("gasto_categoria");
    expect(matchIntent("¿dónde se van mis ingresos?")?.intent).toBe("gasto_categoria");
    expect(matchIntent("en qué gasto más")?.intent).toBe("gasto_categoria");
    expect(matchIntent("¿en qué se me va la plata?")?.intent).toBe("gasto_categoria");
  });

  it("«dónde puedo recortar gastos» sigue siendo consejo, no dato", () => {
    expect(matchIntent("¿dónde puedo recortar gastos?")).toBeNull();
  });
});

describe("«¿cómo van mis metas?» · progreso de metas", () => {
  it("clasifica la consulta factual en vez de escalarla", () => {
    expect(matchIntent("¿cómo van mis metas?")?.intent).toBe("metas");
    expect(matchIntent("cómo voy con mis metas")?.intent).toBe("metas");
    expect(matchIntent("¿cómo va mi meta?")?.intent).toBe("metas");
  });

  it("con señal de razonamiento ADEMÁS de «cómo», sigue escalando", () => {
    expect(matchIntent("¿cómo van mis metas si aporto 50 mil más?")).toBeNull();
    expect(matchIntent("¿cómo debería priorizar mis metas?")).toBeNull();
    expect(matchIntent("¿cómo van mis metas comparado con el año pasado?")).toBeNull();
  });

  it("no le roba la pregunta al historial ni a los otros carriles de metas", () => {
    expect(matchIntent("cómo vengo con el ahorro")?.intent).toBe("consulta_historial");
    expect(matchIntent("¿cuáles metas debo aportar este mes?")?.intent).toBe("metas_a_aportar");
    expect(matchIntent("listá mis metas")?.intent).toBe("listar_sobres");
  });

  it("«cómo» a secas, sin metas, no cae acá", () => {
    expect(matchIntent("¿cómo invierto mejor?")).toBeNull();
    expect(matchIntent("¿cómo voy?")).toBeNull();
  });
});
