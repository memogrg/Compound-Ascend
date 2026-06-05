import { describe, it, expect } from "vitest";
import { parseBccrXml, parseFredObservations } from "@/lib/economic-indicators/providers";

describe("parseBccrXml", () => {
  it("parsea el XML escapado dentro del envoltorio <string>", () => {
    const raw =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<string xmlns="https://gee.bccr.fi.cr/...">' +
      "&lt;Datos&gt;&lt;INGC011_CAT_INDICADORECONOMIC&gt;" +
      "&lt;COD_INDICADORINTERNO&gt;317&lt;/COD_INDICADORINTERNO&gt;" +
      "&lt;DES_FECHA&gt;2024-01-15T00:00:00-06:00&lt;/DES_FECHA&gt;" +
      "&lt;NUM_VALOR&gt;512.34&lt;/NUM_VALOR&gt;" +
      "&lt;/INGC011_CAT_INDICADORECONOMIC&gt;&lt;/Datos&gt;</string>";
    expect(parseBccrXml(raw)).toEqual([{ observedDate: "2024-01-15", value: 512.34 }]);
  });

  it("parsea XML sin escapar y empareja múltiples observaciones por posición", () => {
    const raw =
      "<Datos>" +
      "<INGC011_CAT_INDICADORECONOMIC><DES_FECHA>2024-01-15T00:00:00-06:00</DES_FECHA><NUM_VALOR>500.00</NUM_VALOR></INGC011_CAT_INDICADORECONOMIC>" +
      "<INGC011_CAT_INDICADORECONOMIC><DES_FECHA>2024-01-16T00:00:00-06:00</DES_FECHA><NUM_VALOR>501.50</NUM_VALOR></INGC011_CAT_INDICADORECONOMIC>" +
      "</Datos>";
    expect(parseBccrXml(raw)).toEqual([
      { observedDate: "2024-01-15", value: 500 },
      { observedDate: "2024-01-16", value: 501.5 },
    ]);
  });

  it("acepta coma decimal", () => {
    const raw = "<DES_FECHA>2024-03-01T00:00:00-06:00</DES_FECHA><NUM_VALOR>4,75</NUM_VALOR>";
    expect(parseBccrXml(raw)).toEqual([{ observedDate: "2024-03-01", value: 4.75 }]);
  });

  it("ignora valores no numéricos y fechas inválidas", () => {
    const raw =
      "<DES_FECHA>fecha-mala</DES_FECHA><NUM_VALOR>10</NUM_VALOR>" +
      "<DES_FECHA>2024-05-05T00:00:00-06:00</DES_FECHA><NUM_VALOR>nan</NUM_VALOR>";
    expect(parseBccrXml(raw)).toEqual([]);
  });

  it("devuelve [] cuando no hay observaciones", () => {
    expect(parseBccrXml("<string></string>")).toEqual([]);
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
