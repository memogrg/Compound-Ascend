import { describe, it, expect } from "vitest";
import { parseSddeSeries, parseFredObservations } from "@/lib/economic-indicators/providers";

describe("parseSddeSeries", () => {
  it("parsea la respuesta JSON del SDDE e ignora valores nulos", () => {
    const sdde = {
      estado: true,
      datos: [
        {
          series: [
            { fecha: "2026-06-05", valorDatoPorPeriodo: 5.15 },
            { fecha: "2026-06-06", valorDatoPorPeriodo: null }, // se ignora
          ],
        },
      ],
    };
    expect(parseSddeSeries(sdde)).toEqual([{ observedDate: "2026-06-05", value: 5.15 }]);
  });

  it("aplana múltiples indicadores y recorta la fecha ISO a yyyy-mm-dd", () => {
    const sdde = {
      datos: [
        { series: [{ fecha: "2026-01-15T00:00:00-06:00", valorDatoPorPeriodo: 500 }] },
        { series: [{ fecha: "2026-01-16", valorDatoPorPeriodo: 501.5 }] },
      ],
    };
    expect(parseSddeSeries(sdde)).toEqual([
      { observedDate: "2026-01-15", value: 500 },
      { observedDate: "2026-01-16", value: 501.5 },
    ]);
  });

  it("ignora fechas inválidas y valores no finitos", () => {
    const sdde = {
      datos: [
        {
          series: [
            { fecha: "fecha-mala", valorDatoPorPeriodo: 10 },
            { fecha: "2026-05-05", valorDatoPorPeriodo: Number.NaN },
          ],
        },
      ],
    };
    expect(parseSddeSeries(sdde)).toEqual([]);
  });

  it("tolera payloads vacíos o malformados", () => {
    expect(parseSddeSeries(null)).toEqual([]);
    expect(parseSddeSeries({})).toEqual([]);
    expect(parseSddeSeries({ datos: [{}] })).toEqual([]);
  });
});

describe("parseFredObservations", () => {
  it("parsea observaciones y descarta faltantes (.)", () => {
    const data = {
      observations: [
        { date: "2026-05-01", value: "5.33" },
        { date: "2026-04-01", value: "." }, // faltante en FRED
        { date: "2026-03-01", value: "5.31" },
      ],
    };
    expect(parseFredObservations(data)).toEqual([
      { observedDate: "2026-05-01", value: 5.33 },
      { observedDate: "2026-03-01", value: 5.31 },
    ]);
  });

  it("tolera payloads vacíos o malformados", () => {
    expect(parseFredObservations(null)).toEqual([]);
    expect(parseFredObservations({})).toEqual([]);
    expect(parseFredObservations({ observations: [{ date: "mala", value: "1" }] })).toEqual([]);
  });
});
