/**
 * TABLERO DE CALIDAD — el corte del DÍA y la lectura de la fila.
 *
 * Un "día" del tablero tiene que coincidir con el día que vivió el usuario, no con el corte UTC:
 * la app es es-CR y Costa Rica es UTC−6 fijo (sin horario de verano). Con el corte UTC, todo lo que
 * pasa entre las 18:00 y la medianoche CR se contaría en el día SIGUIENTE — seis horas de cada día
 * mal atribuidas, en silencio y para siempre.
 *
 * `fromRow` tiene test propio por una razón distinta: Postgres devuelve `numeric` como STRING para
 * no perder precisión, así que un costo sin coercionar entraría al tablero como texto y las sumas
 * lo concatenarían en vez de sumarlo.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { diaCR, diaSiguiente, fromRow, inicioDiaCR } from "@/lib/ai/metrics-store";

describe("diaCR · el día que vivió el usuario", () => {
  it("mediodía CR cae en su propio día", () => {
    expect(diaCR(Date.parse("2026-08-29T18:00:00.000Z"))).toBe("2026-08-29");
  });

  it("las 23:00 CR siguen siendo ESE día, aunque en UTC ya sea el siguiente", () => {
    // 2026-08-29 23:00 CR = 2026-08-30 05:00 UTC. Con el corte UTC se contaría el día 30.
    expect(diaCR(Date.parse("2026-08-30T05:00:00.000Z"))).toBe("2026-08-29");
  });

  it("las 00:00 CR abren el día nuevo", () => {
    expect(diaCR(Date.parse("2026-08-30T06:00:00.000Z"))).toBe("2026-08-30");
  });

  it("un minuto antes de medianoche CR todavía es el día que se va", () => {
    expect(diaCR(Date.parse("2026-08-30T05:59:59.999Z"))).toBe("2026-08-29");
  });
});

describe("inicioDiaCR", () => {
  it("las 00:00 CR de un día son las 06:00Z de ese mismo día (UTC−6 fijo)", () => {
    expect(inicioDiaCR("2026-08-29")).toBe("2026-08-29T06:00:00.000Z");
  });

  it("es el inverso de diaCR en el borde: el instante de apertura pertenece a su día", () => {
    expect(diaCR(Date.parse(inicioDiaCR("2026-08-29")))).toBe("2026-08-29");
  });
});

describe("diaSiguiente", () => {
  it("avanza un día", () => {
    expect(diaSiguiente("2026-08-29")).toBe("2026-08-30");
  });

  it("cruza fin de mes y fin de año", () => {
    expect(diaSiguiente("2026-08-31")).toBe("2026-09-01");
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
  });

  it("cruza el 29 de febrero de un bisiesto", () => {
    expect(diaSiguiente("2028-02-28")).toBe("2028-02-29");
    expect(diaSiguiente("2028-02-29")).toBe("2028-03-01");
  });

  it("la ventana de un día es [inicio, inicio del siguiente): 24 h exactas", () => {
    const desde = Date.parse(inicioDiaCR("2026-08-29"));
    const hasta = Date.parse(inicioDiaCR(diaSiguiente("2026-08-29")));
    expect(hasta - desde).toBe(24 * 60 * 60 * 1000);
  });
});

describe("fromRow", () => {
  const base = {
    day: "2026-08-29",
    turnos: 10,
    turnos_det: 4,
    turnos_llm: 6,
    guards_total: 2,
    guards: { movimientos: 2 },
    lat_p50: 800,
    lat_p95: 2400,
    lat_por_carril: { template: { p50: 100, p95: 200, n: 4 } },
    tokens_in: 1000,
    tokens_out: 500,
    costo_usd: 0.0031,
    acciones_propuestas: 3,
    acciones_confirmadas: 1,
    provider_errors: { timeout: 1 },
    usuarios: 5,
  };

  it("mapea la fila a las métricas del motor", () => {
    expect(fromRow(base)).toEqual({
      turnos: 10,
      turnosDet: 4,
      turnosLlm: 6,
      guardsTotal: 2,
      guards: { movimientos: 2 },
      latP50: 800,
      latP95: 2400,
      latPorCarril: { template: { p50: 100, p95: 200, n: 4 } },
      tokensIn: 1000,
      tokensOut: 500,
      costoUsd: 0.0031,
      accionesPropuestas: 3,
      accionesConfirmadas: 1,
      providerErrors: { timeout: 1 },
      usuarios: 5,
    });
  });

  it("el numeric que Postgres devuelve como STRING entra como número", () => {
    // Sin la coerción, sumar la ventana concatenaría: "0.0031" + "0.0012" = "0.00310.0012".
    const m = fromRow({ ...base, costo_usd: "0.0031", tokens_in: "1000" as unknown as number });
    expect(m.costoUsd).toBe(0.0031);
    expect(m.tokensIn).toBe(1000);
    expect(typeof m.costoUsd).toBe("number");
  });

  it("los mapas jsonb ausentes caen a {} en vez de undefined", () => {
    const m = fromRow({
      ...base,
      guards: null as unknown as Record<string, number>,
      provider_errors: null as unknown as Record<string, number>,
      lat_por_carril: null as unknown as (typeof base)["lat_por_carril"],
    });
    expect(m.guards).toEqual({});
    expect(m.providerErrors).toEqual({});
    expect(m.latPorCarril).toEqual({});
  });

  it("una latencia sin medir se conserva null, no se inventa un 0", () => {
    const m = fromRow({ ...base, lat_p50: null, lat_p95: null });
    expect(m.latP50).toBeNull();
    expect(m.latP95).toBeNull();
  });
});
