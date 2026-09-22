"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Pone el foco en el disparador únicamente cuando está huérfano (el `body`, o nada).
 *
 * Si la persona estaba escribiendo en un campo —el buscador de Transacciones, un dato de
 * Configuración— y abre la paleta con ⌘K, al cerrarla tiene que volver A SU CAMPO, no al
 * buscador de la barra: perder el sitio donde estabas es peor que el problema que esto
 * arregla. `Modal` ya guarda y restaura ese elemento; acá solo se suple el caso en que no
 * hay ninguno que guardar.
 *
 * Vive fuera del hook para tener identidad estable: dentro habría que meterla en las deps
 * del efecto del listener, o duplicar sus dos líneas allí.
 */
function sustituirFocoHuerfano(disparador?: RefObject<HTMLElement | null>): void {
  const actual = document.activeElement;
  if (actual === null || actual === document.body) disparador?.current?.focus();
}

/**
 * Abre y cierra la paleta con ⌘K / Ctrl+K.
 *
 * El listener va en `document` y solo se registra cuando `activo` es true — quien llama
 * pasa `navV2Enabled()`, así que con la bandera apagada no hay ni listener ni atajo
 * capturado. `⌘K` estaba libre: el único uso de `metaKey` en el repo es local a un textarea
 * del asistente (Ctrl+Enter para salto de línea), no global.
 *
 * `disparador` es el botón buscador del topbar. Se enfoca ANTES de abrir porque `Modal`
 * guarda `document.activeElement` al montar y se lo devuelve al desmontar: abierta con el
 * atajo, el foco estaría en el `body` y Escape devolvería a quien navega con teclado al
 * principio del documento. Enfocando el botón primero, la restauración de `Modal` acierta
 * sola y no hubo que tocar `modal.tsx` ni pelear con el orden de los efectos.
 *
 * Pero SOLO si nadie más lo tiene: ver `sustituirFocoHuerfano`.
 */
export function useCommandPalette(activo: boolean, disparador?: RefObject<HTMLElement | null>) {
  const [abierta, setAbierta] = useState(false);

  // Espejo del estado para el listener, que se registra una sola vez: sin esto habría que
  // meter `abierta` en las deps y volver a suscribir en cada apertura.
  const abiertaRef = useRef(false);
  useEffect(() => {
    abiertaRef.current = abierta;
  }, [abierta]);

  // Sin `useCallback`: memorizar `abrir` a mano rompe el React Compiler, que infiere
  // `disparador?.current` como dependencia y no puede conciliarla con `[disparador]`
  // («Existing memoization could not be preserved» → deja de optimizar el módulo entero).
  // El compilador ya memoriza lo que haga falta, y ninguno de los dos consumidores
  // —un `onClick` y un efecto que no los lleva en sus deps— depende de su identidad.
  const abrir = () => {
    sustituirFocoHuerfano(disparador);
    setAbierta(true);
  };
  const cerrar = () => setAbierta(false);

  useEffect(() => {
    if (!activo) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "k" && e.key !== "K") return;
      if (!e.metaKey && !e.ctrlKey) return;
      // `preventDefault` porque ⌘K está tomado por el navegador (barra de búsqueda en
      // algunos) y Ctrl+K por la consola en otros.
      e.preventDefault();
      if (abiertaRef.current) {
        setAbierta(false);
        return;
      }
      sustituirFocoHuerfano(disparador);
      setAbierta(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activo, disparador]);

  return { abierta, abrir, cerrar };
}
