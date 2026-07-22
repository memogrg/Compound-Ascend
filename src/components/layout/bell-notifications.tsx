"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  listActiveInsightsAction,
  dismissInsightAction,
  restoreInsightsAction,
  type BellInsight,
} from "@/modules/dashboard/api/actions";

/** Acento + icono por severidad (mismos tokens que "Qué noté"). */
const STYLE: Record<string, { color: string; icon: IconName }> = {
  celebrar: { color: "var(--pos)", icon: "check" },
  accionar: { color: "var(--neg)", icon: "bell" },
  observar: { color: "var(--warn)", icon: "info" },
  info: { color: "var(--muted)", icon: "info" },
};

/** Ruta por TIPO de insight (deep-link de la campana web). */
const KIND_HREF: Record<string, string> = {
  perfil_revision: "/mi-perfil-financiero",
};

export function BellNotifications() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [items, setItems] = useState<BellInsight[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Carga al montar para poder mostrar el badge sin abrir.
  useEffect(() => {
    let alive = true;
    listActiveInsightsAction()
      .then((data) => {
        if (!alive) return;
        setInApp(data.inApp);
        setItems(data.insights);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const count = inApp ? items.length : 0;

  const dismiss = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id)); // optimista
    try {
      await dismissInsightAction(id);
    } catch {
      // si falla, no rompemos la UI; el próximo refresh lo corrige.
    }
  };

  // "Recordar acciones": revierte los descartes y repuebla la lista.
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    setRestoring(true);
    try {
      await restoreInsightsAction();
      const data = await listActiveInsightsAction();
      setInApp(data.inApp);
      setItems(data.insights);
    } catch {
      // si falla, la lista queda como estaba.
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        aria-label="Notificaciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {count > 0 ? (
          <span
            aria-label={`${count} novedades`}
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              background: "var(--neg)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "16px",
              textAlign: "center",
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="menu" className="card bell-pop">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>Notificaciones</span>
            <Link
              href="/dashboard"
              className="muted"
              style={{ fontSize: 12 }}
              onClick={() => setOpen(false)}
            >
              Ver todo
            </Link>
          </div>

          {loading ? (
            <div className="muted" style={{ padding: "18px 14px", fontSize: 12.5 }}>
              Cargando…
            </div>
          ) : !inApp ? (
            <div className="muted" style={{ padding: "18px 14px", fontSize: 12.5, lineHeight: 1.5 }}>
              Tienes los avisos en la app desactivados. Actívalos en{" "}
              <Link href="/configuracion" onClick={() => setOpen(false)}>
                Configuración
              </Link>
              .
            </div>
          ) : items.length === 0 ? (
            <div className="muted" style={{ padding: "18px 14px", fontSize: 12.5 }}>
              Sin novedades por ahora.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {items.map((o) => {
                const s = STYLE[o.severity] ?? STYLE.info!;
                const href = KIND_HREF[o.kind];
                const content = (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.35 }}>
                      {o.title}
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>
                      {o.body}
                    </div>
                  </>
                );
                return (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "11px 14px",
                      borderBottom: "1px solid var(--line)",
                      borderLeft: `3px solid ${s.color}`,
                    }}
                  >
                    <span style={{ color: s.color, flex: "none", marginTop: 1 }}>
                      <Icon name={s.icon} width={2.4} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          style={{ display: "block", textDecoration: "none", color: "inherit" }}
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="Descartar"
                      style={{ flex: "none", width: 26, height: 26 }}
                      onClick={() => dismiss(o.id)}
                    >
                      <Icon name="x" width={2.2} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && inApp ? (
            <div
              style={{
                padding: "9px 14px",
                borderTop: "1px solid var(--line)",
                textAlign: "center",
              }}
            >
              <button
                type="button"
                className="bell-recall"
                onClick={restore}
                disabled={restoring}
              >
                {restoring ? "Recordando…" : "Recordar acciones"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
