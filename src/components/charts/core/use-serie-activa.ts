"use client";

import { useCallback, useEffect, useReducer } from "react";

import { OPACIDAD, type SerieDef } from "./theme";

/**
 * Qué serie manda y cuáles están apagadas. El reductor es PURO y se exporta aparte para
 * poder probarlo sin montar nada: es donde vive la regla de interacción de todo gráfico.
 *
 * Dos estados que no son lo mismo:
 *  - **activa**: alguien la está señalando (hover o foco). Las demás se atenúan a 0,35, no
 *    desaparecen: atenuar es jerarquía, ocultar es censura.
 *  - **oculta**: alguien la apagó desde la leyenda. Esa sí sale del dibujo.
 */
export type EstadoSerie = {
  activa: string | null;
  ocultas: ReadonlySet<string>;
};

export type AccionSerie =
  | { tipo: "activar"; clave: string }
  | { tipo: "desactivar" }
  | { tipo: "alternarOculta"; clave: string }
  | { tipo: "limpiar" };

export const ESTADO_INICIAL: EstadoSerie = { activa: null, ocultas: new Set() };

/**
 * Reductor puro.
 *
 * Devuelve el MISMO objeto cuando nada cambia (activar la que ya está activa), para no
 * disparar renders de más — y porque un reductor que siempre crea estado nuevo esconde los
 * bucles de efectos.
 */
export function reducirSerieActiva(estado: EstadoSerie, accion: AccionSerie): EstadoSerie {
  switch (accion.tipo) {
    case "activar":
      // Una serie oculta no puede estar activa: no está en pantalla.
      if (estado.ocultas.has(accion.clave) || estado.activa === accion.clave) return estado;
      return { ...estado, activa: accion.clave };

    case "desactivar":
      return estado.activa === null ? estado : { ...estado, activa: null };

    case "alternarOculta": {
      const ocultas = new Set(estado.ocultas);
      if (ocultas.has(accion.clave)) ocultas.delete(accion.clave);
      else ocultas.add(accion.clave);
      // Apagar la serie que estaba señalada deja el resaltado sin dueño.
      const activa =
        ocultas.has(accion.clave) && estado.activa === accion.clave ? null : estado.activa;
      return { activa, ocultas };
    }

    case "limpiar":
      // Escape suelta el resaltado, pero NO vuelve a encender lo que alguien apagó: eso fue
      // una decisión deliberada y deshacerla por una tecla sería una sorpresa.
      return estado.activa === null ? estado : { ...estado, activa: null };
  }
}

/** ¿Se dibuja esta serie? */
export function esVisible(estado: EstadoSerie, clave: string): boolean {
  return !estado.ocultas.has(clave);
}

/**
 * Opacidad de una serie. Sin nadie activo, todas al 100 %: el estado de reposo no tiene
 * ganadores.
 */
export function opacidadDe(estado: EstadoSerie, clave: string): number {
  if (estado.activa === null || estado.activa === clave) return OPACIDAD.normal;
  return OPACIDAD.atenuada;
}

/**
 * Las series que quedan en pantalla, **con su color intacto**.
 *
 * El color pertenece a la entidad y viaja en `SerieDef`, así que apagar «Presupuesto» no
 * repinta «Real»: el filtro no reasigna nada. Parece obvio y es el error clásico de las
 * leyendas que colorean por índice del array visible.
 */
export function seriesVisibles(
  series: readonly SerieDef[],
  estado: EstadoSerie,
): readonly SerieDef[] {
  return series.filter((s) => esVisible(estado, s.clave));
}

/**
 * El hook que usan los gráficos. Escape se escucha en `document` porque el foco puede estar
 * en la leyenda, en una marca o en ninguna parte.
 */
export function useSerieActiva(inicial: EstadoSerie = ESTADO_INICIAL) {
  const [estado, despachar] = useReducer(reducirSerieActiva, inicial);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") despachar({ tipo: "limpiar" });
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);

  const activar = useCallback((clave: string) => despachar({ tipo: "activar", clave }), []);
  const desactivar = useCallback(() => despachar({ tipo: "desactivar" }), []);
  const alternar = useCallback((clave: string) => despachar({ tipo: "alternarOculta", clave }), []);

  return { estado, activar, desactivar, alternar };
}
