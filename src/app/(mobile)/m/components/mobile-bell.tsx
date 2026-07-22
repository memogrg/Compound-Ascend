"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import {
  listActiveInsightsAction,
  dismissInsightAction,
  restoreInsightsAction,
  type BellInsight,
} from "@/modules/dashboard/api/actions";

import { BottomSheet, useToast } from "./form-kit";

/**
 * Campana de notificaciones del móvil (paridad con bell-notifications.tsx de la web): lista los
 * insights activos y permite descartar/restaurar. Consume EXACTAMENTE las Server Actions del
 * dashboard (list/dismiss/restoreInsightsAction); cero backend nuevo.
 *
 * Se monta dentro de MobileMenu (junto al ☰), así aparece en el header de toda pantalla /m con
 * un solo cambio. Carga el conteo al montar (best-effort); si falla o inApp=false, sin badge.
 * El Inicio conserva su firstInsight — la lista completa vive aquí.
 */

/** Acento + icono por severidad (mismo mapa que la web). */
const STYLE: Record<string, { color: string; icon: IconName }> = {
  celebrar: { color: "var(--pos)", icon: "check" },
  accionar: { color: "var(--neg)", icon: "bell" },
  observar: { color: "var(--warn)", icon: "info" },
  info: { color: "var(--muted)", icon: "info" },
};

/** Deep-link por entidad relacionada → su pantalla /m. */
const RELATED_HREF: Record<string, string> = {
  goal: "/m/metas",
  debt: "/m/deudas",
  holding: "/m/inversiones",
  category: "/m/gastos",
};

/** Deep-link por TIPO de insight (cuando no hay entidad relacionada). */
const KIND_HREF: Record<string, string> = {
  perfil_revision: "/m/mi-perfil-financiero",
  fondo_paz: "/m/proteccion",
};

/** Ruta del insight: por entidad (relatedKind) o, si no, por tipo (kind). */
function hrefFor(o: { relatedKind?: string; kind: string }): string | undefined {
  return (o.relatedKind ? RELATED_HREF[o.relatedKind] : undefined) ?? KIND_HREF[o.kind];
}

export function MobileBell() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inApp, setInApp] = useState(true);
  const [items, setItems] = useState<BellInsight[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () =>
    listActiveInsightsAction()
      .then((data) => {
        setInApp(data.inApp);
        setItems(data.insights);
      })
      .catch(() => {
        // best-effort: si falla, sin badge y lista vacía.
      })
      .finally(() => setLoading(false));

  // Conteo al montar (para el badge sin abrir).
  useEffect(() => {
    let alive = true;
    listActiveInsightsAction()
      .then((data) => {
        if (!alive) return;
        setInApp(data.inApp);
        setItems(data.insights);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const count = inApp ? items.length : 0;

  const dismiss = (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id)); // optimista
    startTransition(async () => {
      try {
        await dismissInsightAction(id);
        toast.show("Notificación descartada", "success");
      } catch {
        toast.show("No pudimos descartarla", "error");
        void load(); // corrige el optimismo si falló
      }
    });
  };

  const restore = () => {
    setRestoring(true);
    startTransition(async () => {
      try {
        await restoreInsightsAction();
        await load();
        toast.show("Notificaciones restauradas", "success");
      } catch {
        toast.show("No pudimos restaurarlas", "error");
      } finally {
        setRestoring(false);
      }
    });
  };

  const openRelated = (o: BellInsight) => {
    const href = hrefFor(o);
    if (!href) return;
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label="Notificaciones"
        style={{ position: "relative" }}
        onClick={() => setOpen(true)}
      >
        <Icon name="bell" />
        {count > 0 ? (
          <span
            aria-label={`${count} novedades`}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
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

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Notificaciones">
        {loading ? (
          <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>
            Cargando…
          </div>
        ) : !inApp ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Tienes las notificaciones en la app desactivadas. Actívalas en{" "}
            <button
              type="button"
              style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer" }}
              onClick={() => {
                setOpen(false);
                router.push("/m/perfil");
              }}
            >
              Configuración
            </button>
            .
          </div>
        ) : items.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Todo al día. No hay notificaciones por ahora.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((o) => {
              const s = STYLE[o.severity] ?? STYLE.info!;
              const href = hrefFor(o);
              return (
                <div
                  key={o.id}
                  className="card card-p"
                  style={{ padding: 12, borderLeft: `3px solid ${s.color}` }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: s.color, flex: "none", marginTop: 1 }}>
                      <Icon name={s.icon} width={2.4} />
                    </span>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: "none",
                        border: 0,
                        padding: 0,
                        textAlign: "left",
                        cursor: href ? "pointer" : "default",
                      }}
                      disabled={!href}
                      onClick={() => openRelated(o)}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{o.title}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>
                        {o.body}
                      </div>
                      {href ? (
                        <div style={{ fontSize: 11.5, marginTop: 4, color: s.color, fontWeight: 600 }}>
                          Ver detalle →
                        </div>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Descartar"
                      style={{ flex: "none", width: 28, height: 28 }}
                      disabled={pending}
                      onClick={() => dismiss(o.id)}
                    >
                      <Icon name="x" width={2.2} />
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="m-btn m-btn-block m-btn-secondary"
              disabled={restoring || pending}
              onClick={restore}
            >
              {restoring ? "Restaurando…" : "Restaurar descartadas"}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
