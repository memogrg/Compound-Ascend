/**
 * Persona library registry — the full 7 archetypes on the shared behavioral
 * engine. The library runner iterates this list, so registering a builder here is
 * all it takes to include a persona in `npm run sim`.
 */
import type { PersonaBuilder } from "../persona-types";
import { buildControlExcelente } from "./control-excelente";
import { buildSobreendeudado } from "./sobreendeudado";
import { buildIngresoMuyBajo } from "./ingreso-muy-bajo";
import { buildIngresosIrregulares } from "./ingresos-irregulares";
import { buildFamiliaMetasEducacion } from "./familia-metas-educacion";
import { buildCompradorVivienda } from "./comprador-vivienda";
import { buildInversionistaActivo } from "./inversionista-activo";

export interface PersonaEntry {
  key: string;
  build: PersonaBuilder;
}

export const PERSONA_LIBRARY: PersonaEntry[] = [
  { key: "control-excelente", build: buildControlExcelente },
  { key: "sobreendeudado", build: buildSobreendeudado },
  { key: "ingreso-muy-bajo", build: buildIngresoMuyBajo },
  { key: "ingresos-irregulares", build: buildIngresosIrregulares },
  { key: "familia-metas-educacion", build: buildFamiliaMetasEducacion },
  { key: "comprador-vivienda", build: buildCompradorVivienda },
  { key: "inversionista-activo", build: buildInversionistaActivo },
];

export {
  buildControlExcelente,
  buildSobreendeudado,
  buildIngresoMuyBajo,
  buildIngresosIrregulares,
  buildFamiliaMetasEducacion,
  buildCompradorVivienda,
  buildInversionistaActivo,
};
