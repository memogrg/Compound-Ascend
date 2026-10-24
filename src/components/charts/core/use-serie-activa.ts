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
 *
 * Y un tercero, del punto y no de la serie:
 *  - **fijado**: el índice del punto que alguien clavó con un clic. Mientras hay uno, el
 *    tooltip no sigue al ratón y el crosshair se dibuja sólido. Es lo que permite leer un
 *    valor sin mantener el pulso, copiar una cifra, o mirar el gráfico de al lado.
 */
export type EstadoSerie = {
  activa: string | null;
  ocultas: ReadonlySet<string>;
  /** Índice del punto fijado, o `null`. */
  fijado: number | null;
};

export type AccionSerie =
  | { tipo: "activar"; clave: string }
  | { tipo: "desactivar" }
  | { tipo: "alternarOculta"; clave: string }
  | { tipo: "fijar"; indice: number }
  | { tipo: "soltar" }
  | { tipo: "limpiar" };

export const ESTADO_INICIAL: EstadoSerie = { activa: null, ocultas: new Set(), fijado: null };

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
      return { ...estado, activa, ocultas };
    }

    case "fijar":
      // Clic en el MISMO punto suelta: es un interruptor, no un acumulador. Sin esto, para
      // quitar el tooltip habría que acertar fuera del gráfico.
      return estado.fijado === accion.indice
        ? { ...estado, fijado: null }
        : { ...estado, fijado: accion.indice };

    case "soltar":
      return estado.fijado === null ? estado : { ...estado, fijado: null };

    case "limpiar":
      // Escape suelta el resaltado Y el punto fijado — las dos cosas son transitorias. Lo que
      // NO reenciende es lo que alguien apagó en la leyenda: eso fue una decisión deliberada
      // y deshacerla por una tecla sería una sorpresa.
      return estado.activa === null && estado.fijado === null
        ? estado
        : { ...estado, activa: null, fijado: null };
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
  const fijar = useCallback((indice: number) => despachar({ tipo: "fijar", indice }), []);
  const soltar = useCallback(() => despachar({ tipo: "soltar" }), []);

  return { estado, activar, desactivar, alternar, fijar, soltar };
}
