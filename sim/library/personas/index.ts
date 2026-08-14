/**
 * Persona library registry (F2 · split 3+4). This slice ships 3 of the 7
 * archetypes; ingresos-irregulares, familia-metas-educación, comprador-vivienda
 * and inversionista-activo land in a follow-up on the same engine.
 */
import type { PersonaBuilder } from "../persona-types";
import { buildControlExcelente } from "./control-excelente";
import { buildSobreendeudado } from "./sobreendeudado";
import { buildIngresoMuyBajo } from "./ingreso-muy-bajo";

export interface PersonaEntry {
  key: string;
  build: PersonaBuilder;
}

export const PERSONA_LIBRARY: PersonaEntry[] = [
  { key: "control-excelente", build: buildControlExcelente },
  { key: "sobreendeudado", build: buildSobreendeudado },
  { key: "ingreso-muy-bajo", build: buildIngresoMuyBajo },
];

export { buildControlExcelente, buildSobreendeudado, buildIngresoMuyBajo };
