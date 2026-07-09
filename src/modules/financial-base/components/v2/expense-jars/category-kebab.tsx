"use client";

/**
 * Kebab por categoría (Budget.html `attachCatMenu`/`setCatColor`/`confirmDeleteCat`).
 * Solo en frascos NORMALES. Menú: (opcional) PERSONALIZAR + "CAMBIAR COLOR"
 * (7 swatches) + "Eliminar categoría". Las categorías base (de sistema) no se
 * pueden eliminar por RLS; el color se guarda como override por usuario en
 * localStorage (no hay columna de color por-usuario para las de sistema).
 *
 * El dropdown se PORTALIZA a document.body con position:fixed y z-index alto, para
 * escapar el overflow/stacking de la lista de frascos (si no, el menú de un frasco
 * queda detrás de otros frascos o de la tarjeta siguiente). Se reposiciona en
 * scroll/resize y se voltea hacia arriba si no cabe abajo.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";

export const CAT_COLORS = [
  "var(--pos)",
  "var(--info)",
  "var(--warn)",
  "var(--teal)",
  "var(--rose)",
  "var(--c-networth)",
  "var(--gold)",
];

const MENU_W = 208;

export function CategoryKebab({
  name,
  currentColor,
  hasOverride,
  deletable,
  onPickColor,
  onReset,
  onDelete,
  personalizeSlot,
}: {
  name: string;
  currentColor: string;
  hasOverride: boolean;
  deletable: boolean;
  onPickColor: (color: string) => void;
  onReset: () => void;
  onDelete: () => void;
  /** Acciones de personalización por hogar (Fase 2), arriba del menú. Cierra al usarse. */
  personalizeSlot?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Posiciona el menú (fixed) alineado al borde derecho del botón, debajo; si no
  // cabe abajo, lo voltea hacia arriba o lo clampa dentro del viewport.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.right - MENU_W), window.innerWidth - MENU_W - 8);
      const h = menuRef.current?.offsetHeight ?? 0;
      let top = r.bottom + 6;
      if (h && top + h > window.innerHeight - 8) {
        const above = r.top - 6 - h;
        top = above >= 8 ? above : Math.max(8, window.innerHeight - 8 - h);
      }
      setCoords({ top, left });
    };
    place();
    // Re-mide una vez montado el menú (ya con altura real) para voltear/clampar.
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Cierre al click fuera (considera el botón Y el menú portalizado).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              zIndex: 1000, // por encima del topbar sticky y de las tarjetas
              width: MENU_W,
              padding: 12,
              textAlign: "left",
              boxShadow: "0 12px 32px rgba(0,0,0,.18)",
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {personalizeSlot ? (
              <div style={{ marginBottom: 8, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: ".06em",
                    color: "var(--muted)",
                    marginBottom: 4,
                  }}
                >
                  PERSONALIZAR
                </div>
                <div onClick={() => setOpen(false)}>{personalizeSlot}</div>
              </div>
            ) : null}
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".06em",
                color: "var(--muted)",
                marginBottom: 8,
              }}
            >
              CAMBIAR COLOR
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {CAT_COLORS.map((c) => {
                const active = c === currentColor;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => {
                      onPickColor(c);
                      setOpen(false);
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: c,
                      border: active ? "2px solid var(--text)" : "2px solid transparent",
                      boxShadow: "0 0 0 1px var(--line)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
            {hasOverride ? (
              <button
                type="button"
                role="menuitem"
                className="btn btn-ghost"
                style={{
                  justifyContent: "flex-start",
                  width: "100%",
                  padding: "7px 8px",
                  fontSize: 12.5,
                  marginBottom: 4,
                }}
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
              >
                <Icon name="repeat" width={2} /> Restablecer color
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost tip"
              data-tip={deletable ? undefined : "Las categorías base no se pueden eliminar"}
              disabled={!deletable}
              style={{
                justifyContent: "flex-start",
                width: "100%",
                padding: "7px 8px",
                fontSize: 13,
                color: "var(--neg)",
                opacity: deletable ? 1 : 0.5,
                cursor: deletable ? "pointer" : "not-allowed",
              }}
              onClick={() => {
                if (!deletable) return;
                setOpen(false);
                setConfirm(true);
              }}
            >
              <Icon name="txn" width={2} /> Eliminar categoría
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div style={{ flex: "none" }}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={`Opciones de ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ width: 30, height: 30, color: "var(--muted)" }}
        onClick={(e) => {
          e.stopPropagation();
          setCoords(null);
          setOpen((v) => !v);
        }}
      >
        <Icon name="dots" />
      </button>

      {menu}

      {confirm ? (
        <Modal title="Eliminar categoría" sub={name} onClose={() => setConfirm(false)}>
          <div className="modal-body">
            <p style={{ fontSize: 14 }}>
              ¿Seguro que quieres eliminar <strong>{name}</strong>? Sus sobres y movimientos
              quedarán sin categoría.
            </p>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: "var(--neg)" }}
              onClick={() => {
                onDelete();
                setConfirm(false);
              }}
            >
              Eliminar
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
