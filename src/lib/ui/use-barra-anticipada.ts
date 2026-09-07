"use client";

/**
 * Hook de la barra anticipada. Envuelve el motor puro `barra-anticipada` con el
 * estado de React y la reconciliación contra las props del servidor.
 *
 * Por qué no `useOptimistic`: éste suelta el valor al terminar la transición, y
 * `router.refresh()` no es esperable — la transición cierra antes de que lleguen
 * las props frescas, así que la barra se llena y se vacía sola. Acá el anticipo
 * se sostiene hasta que el servidor REFLEJE el monto (comparando valores, no
 * esperando un tiempo), o hasta que la escritura falle.
 */
import { useEffect, useState } from "react";
import {
  anticipar as anticiparEstado,
  cancelar as cancelarEstado,
  reconciliar,
  valorBarra,
  type PendientesBarra,
} from "./barra-anticipada";

export function useBarraAnticipada(servidor: Record<string, number>) {
  const [pendientes, setPendientes] = useState<PendientesBarra>({});

  // Cada tanda de props nuevas suelta lo que el servidor ya refleja. `reconciliar`
  // devuelve el MISMO objeto si nada cambió, así que esto no cicla.
  useEffect(() => {
    setPendientes((prev) => reconciliar(prev, servidor));
  }, [servidor]);

  return {
    /** Valor a pintar para esa fila (anticipado o del servidor). */
    valor: (id: string) => valorBarra(servidor, pendientes, id),
    /** Anticipa el monto al confirmar la escritura. */
    anticipar: (id: string, monto: number) =>
      setPendientes((prev) => anticiparEstado(prev, id, servidor[id] ?? 0, monto)),
    /** Suelta el anticipo porque la escritura falló. */
    cancelar: (id: string) => setPendientes((prev) => cancelarEstado(prev, id)),
    /** ¿Esa fila tiene un anticipo sin confirmar por el servidor? */
    anticipado: (id: string) => Boolean(pendientes[id]),
  };
}
