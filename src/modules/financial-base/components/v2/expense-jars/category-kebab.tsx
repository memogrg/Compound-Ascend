"use client";

/**
 * Kebab por categoría (Budget.html `attachCatMenu`/`setCatColor`/`confirmDeleteCat`).
 * Solo en frascos NORMALES. Menú: "CAMBIAR COLOR" (7 swatches) + "Eliminar
 * categoría". Las categorías base (de sistema) no se pueden eliminar por RLS;
 * el color se guarda como override por usuario en localStorage (no hay columna
 * de color por-usuario para las de sistema).
 */
import { useEffect, useRef, useState } from "react";
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

export function CategoryKebab({
  name,
  currentColor,
  hasOverride,
  deletable,
  onPickColor,
  onReset,
  onDelete,
}: {
  name: string;
  currentColor: string;
  hasOverride: boolean;
  deletable: boolean;
  onPickColor: (color: string) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", zIndex: 2, flex: "none" }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Opciones de ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ width: 30, height: 30, color: "var(--muted)" }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="dots" />
      </button>

      {open ? (
        <div
          role="menu"
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            width: 208,
            padding: 12,
            textAlign: "left",
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", marginBottom: 8 }}>
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
              style={{ justifyContent: "flex-start", width: "100%", padding: "7px 8px", fontSize: 12.5, marginBottom: 4 }}
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
        </div>
      ) : null}

      {confirm ? (
        <Modal title="Eliminar categoría" sub={name} onClose={() => setConfirm(false)}>
          <div className="modal-body">
            <p style={{ fontSize: 14 }}>
              ¿Seguro que quieres eliminar <strong>{name}</strong>? Sus sobres y movimientos quedarán sin categoría.
            </p>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancelar</button>
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
