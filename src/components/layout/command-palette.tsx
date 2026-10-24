"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { conPeriodo } from "@/components/layout/nucleo-tabs-items";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { filtrar } from "@/lib/command-palette/filter";
import { construirItems, type ItemPaleta } from "@/lib/command-palette/items";
import { cn } from "@/lib/utils";

/**
 * Paleta de comandos (⌘K). Navegación y acciones rápidas sobre el modelo de `nav-v2`.
 *
 * Es un COMBOBOX, no un diálogo con lista: el foco se queda en el input y la opción activa
 * se anuncia con `aria-activedescendant`. Mover el foco a cada `<li>` con las flechas —el
 * otro patrón posible— obligaría a devolverlo al input para seguir escribiendo, y el
 * lector de pantalla leería el cambio de foco en vez del resultado.
 *
 * El diálogo, la trampa de foco, Escape y la restauración del foco previo los pone `Modal`,
 * que no hizo falta tocar: enfoca el primer elemento del cuerpo (este input) y al cerrarse
 * devuelve el foco a lo que estaba antes — el botón del topbar.
 */
export function CommandPalette({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? null;

  const [consulta, setConsulta] = useState("");
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const listaRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => construirItems(), []);
  const resultados = useMemo(() => filtrar(items, consulta), [items, consulta]);

  // Al cambiar la consulta el índice vuelve al primero: mantenerlo apuntaría a un item que
  // ya no está donde estaba.
  useEffect(() => setActivo(0), [consulta]);

  // Cerrar al cambiar de ruta. Sin esto, al navegar la paleta quedaría abierta sobre la
  // pantalla nueva. Se limpia también la consulta para la próxima apertura.
  useEffect(() => {
    onCerrar();
    setConsulta("");
    // `onCerrar` fuera de las deps a propósito: la intención es reaccionar al PATHNAME.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // La opción activa siempre visible al moverse con el teclado.
  useEffect(() => {
    if (!abierta) return;
    listaRef.current
      ?.querySelector(`[data-indice="${activo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activo, abierta]);

  if (!abierta) return null;

  const elegir = (item: ItemPaleta) => {
    // Conserva `?period=` con el MISMO helper que las pestañas del núcleo: si la persona
    // estaba mirando agosto, la paleta no la devuelve a hoy sin avisar.
    router.push(conPeriodo(item.ruta, search));
    onCerrar();
    setConsulta("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (i + 1) % resultados.length); // envuelve
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActivo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActivo(resultados.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = resultados[activo];
      if (item) elegir(item);
    }
    // Escape no se maneja acá: lo atrapa `Modal` en `document`, y así hay un solo dueño.
  };

  // Encabezados de grupo: `role="presentation"` porque son títulos visuales dentro de un
  // listbox, y un elemento sin rol de opción rompería el recuento que anuncia el lector.
  let grupoPrevio: string | null = null;

  // Sin resultados NO se pinta el listbox, así que el combobox no puede seguir diciendo
  // que está expandido ni apuntar con `aria-controls` a un id que ya no existe: axe lo
  // reporta como `aria-valid-attr-value` y el lector anuncia una lista fantasma.
  const hayResultados = resultados.length > 0;

  return (
    <Modal title="Buscar o ir a…" onClose={onCerrar}>
      <div className="cp">
        <div className="cp-campo">
          <Icon name="search" className="cp-lupa" />
          <input
            className="cp-input"
            type="text"
            role="combobox"
            aria-expanded={hayResultados}
            aria-controls={hayResultados ? listaId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              resultados[activo] ? `cp-op-${resultados[activo].id}` : undefined
            }
            aria-label="Buscar o ir a…"
            placeholder="Buscar pantallas y acciones…"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {!hayResultados ? (
          <p className="cp-vacio">Sin resultados para «{consulta}»</p>
        ) : (
          <ul
            className="cp-lista"
            id={listaId}
            role="listbox"
            aria-label="Resultados"
            ref={listaRef}
          >
            {resultados.map((item, i) => {
              const nuevoGrupo = item.grupo !== grupoPrevio;
              grupoPrevio = item.grupo;
              return (
                <li key={item.id} role="presentation" className="cp-envoltura">
                  {nuevoGrupo ? (
                    <div className="cp-grupo" role="presentation">
                      {item.grupo}
                    </div>
                  ) : null}
                  <div
                    id={`cp-op-${item.id}`}
                    role="option"
                    aria-selected={i === activo}
                    data-indice={i}
                    className={cn("cp-item", i === activo && "cp-item-on")}
                    onMouseMove={() => setActivo(i)}
                    onClick={() => elegir(item)}
                  >
                    {item.icono ? (
                      <span className="cp-icono">
                        <Icon name={item.icono} />
                      </span>
                    ) : null}
                    <span className="cp-etiqueta">{item.etiqueta}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Chuleta visual. `aria-hidden` a propósito: quien usa lector de pantalla ya
            recibe el patrón de combobox por los roles, y oír las tres pistas en cada
            apertura sería ruido. */}
        <div className="cp-pie" aria-hidden="true">
          <kbd className="kbd">↑</kbd>
          <kbd className="kbd">↓</kbd>
          <span>navegar</span>
          <span className="cp-sep">·</span>
          <kbd className="kbd">↵</kbd>
          <span>abrir</span>
          <span className="cp-sep">·</span>
          <kbd className="kbd">esc</kbd>
          <span>cerrar</span>
        </div>
      </div>
    </Modal>
  );
}
