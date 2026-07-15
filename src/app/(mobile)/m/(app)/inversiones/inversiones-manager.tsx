"use client";

/**
 * Gestión de /m/inversiones (paridad con la web /patrimonio): lista de posiciones
 * con SwipeRow (Editar / Eliminar), FAB para alta, y el detalle de la inversión al
 * tocarla (historial de aportes, dividendos, valuaciones + vender/editar/eliminar).
 * Reutiliza EXACTAMENTE las Server Actions de wealth (add/edit/removeHoldingAction,
 * sellHoldingAction, addDividendAction) vía los forms; lo atómico lo hace el backend.
 * es-MX, tema claro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatMoney, formatPercent } from "@/lib/format";
import { removeHoldingAction } from "@/modules/wealth/api/actions";
import type { HoldingPerformance } from "@/modules/wealth/types";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";

import { Fab, BottomSheet, ConfirmDialog, SwipeRow, useToast } from "../../components/form-kit";
import { HoldingWizardSheet, SellHoldingForm } from "./inversiones-forms";
import { HoldingDetailSheet } from "./holding-detail";

const NATURE_LABEL: Record<string, string> = { cashflow: "Flujo", growth: "Crecimiento" };

export function InversionesManager({
  holdings,
  currency,
  openContributions,
}: {
  holdings: HoldingPerformance[];
  currency: string;
  openContributions: OpenContribution[];
}) {
  const router = useRouter();
  const toast = useToast();

  // Aporte del mes pendiente por holding (brecha DCA), para el banner del detalle.
  const contribByHolding = new Map(openContributions.map((c) => [c.holdingId, c]));

  const [adding, setAdding] = useState(false);
  const [editH, setEditH] = useState<HoldingPerformance | null>(null);
  const [sellH, setSellH] = useState<HoldingPerformance | null>(null);
  const [movH, setMovH] = useState<HoldingPerformance | null>(null); // detalle de la posición
  const [deleteH, setDeleteH] = useState<HoldingPerformance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteH) return;
    setDeleting(true);
    const res = await removeHoldingAction(deleteH.id);
    setDeleting(false);
    if (res.ok) {
      toast.show("Posición eliminada", "success");
      setDeleteH(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {holdings.length === 0 ? (
        <div className="card card-p">
          <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no registras inversiones. Agrega tu primer activo para seguir su rendimiento.
          </div>
        </div>
      ) : (
        <div className="card card-p" style={{ padding: 0 }}>
          {holdings.map((h) => {
            const name = h.label || h.symbol || "Inversión";
            const sub = h.nature ? (NATURE_LABEL[h.nature] ?? h.assetType) : h.assetType;
            const badge = (h.symbol || name).slice(0, 4).toUpperCase();
            return (
              <SwipeRow key={h.id} onEdit={() => setEditH(h)} onDelete={() => setDeleteH(h)}>
                <button
                  type="button"
                  className="lrow"
                  style={{ width: "100%", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
                  onClick={() => setMovH(h)}
                  aria-label={`Movimientos de ${name}`}
                >
                  <span
                    className="lic"
                    style={{
                      background: "linear-gradient(135deg, var(--s1), var(--s5))",
                      color: "#fff",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                    aria-hidden
                  >
                    {badge}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="lname">{name}</div>
                    <div className="lsub">{sub}</div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div className="lamt" style={{ margin: 0 }}>
                      {formatMoney(h.currentValue, currency)}
                    </div>
                    <div className={`mono ${h.returnPct >= 0 ? "pos" : "neg"}`} style={{ fontSize: 11 }}>
                      {h.returnPct >= 0 ? "+" : ""}
                      {formatPercent(h.returnPct, 1)}
                    </div>
                  </div>
                </button>
              </SwipeRow>
            );
          })}
        </div>
      )}

      <Fab onClick={() => setAdding(true)} label="Agregar inversión" />

      {/* Cada hoja se monta SOLO cuando su objetivo está activo: así el wizard
          arranca con el estado inicial correcto desde `prefill` (los inicializadores
          de useState solo corren al montar). También reinicia el alta entre aperturas. */}
      {adding ? (
        <HoldingWizardSheet open onClose={() => setAdding(false)} primaryCurrency={currency} />
      ) : null}

      {editH ? (
        <HoldingWizardSheet
          open
          onClose={() => setEditH(null)}
          primaryCurrency={currency}
          prefill={editH}
          editId={editH.id}
        />
      ) : null}


      {/* Detalle de la inversión (aportes, dividendos, valuaciones + acciones). Se monta solo
          con la posición elegida: así sus listas se piden al abrir, no en la carga de la página. */}
      {movH ? (
        <HoldingDetailSheet
          holding={movH}
          currency={currency}
          contribution={contribByHolding.get(movH.id) ?? null}
          onClose={() => setMovH(null)}
          onEdit={() => {
            const h = movH;
            setMovH(null);
            setEditH(h);
          }}
          onSell={() => {
            const h = movH;
            setMovH(null);
            setSellH(h);
          }}
          onDelete={() => {
            const h = movH;
            setMovH(null);
            setDeleteH(h);
          }}
        />
      ) : null}

      {/* Vender */}
      <BottomSheet open={!!sellH} onClose={() => setSellH(null)} title="Vender / retirar">
        {sellH ? <SellHoldingForm holding={sellH} currency={currency} onSuccess={() => setSellH(null)} /> : null}
      </BottomSheet>

      {/* Eliminar */}
      <ConfirmDialog
        open={!!deleteH}
        title="Eliminar posición"
        message={
          deleteH
            ? `Se eliminará "${deleteH.label || deleteH.symbol}". Sus dividendos y ventas registrados se conservan como historial.`
            : undefined
        }
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteH(null)}
      />
    </>
  );
}
