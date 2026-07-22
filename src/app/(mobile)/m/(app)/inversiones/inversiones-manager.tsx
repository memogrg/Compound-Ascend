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

import { formatPercent } from "@/lib/format";
import { removeHoldingAction } from "@/modules/wealth/api/actions";
import type { HoldingNativo, HoldingPerformance } from "@/modules/wealth/types";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";

import { Fab, BottomSheet, ConfirmDialog, SwipeRow, useToast } from "../../components/form-kit";
import { MContentCard, MDataRow, MEmptyState, mAmount } from "../../components/content-kit";
import { HoldingWizardSheet, SellHoldingForm } from "./inversiones-forms";
import { HoldingDetailSheet } from "./holding-detail";

const NATURE_LABEL: Record<string, string> = { cashflow: "Flujo", growth: "Crecimiento" };

export function InversionesManager({
  holdings,
  rawHoldings,
  currency,
  openContributions,
}: {
  holdings: HoldingPerformance[];
  /** Los mismos holdings SIN convertir. Todo lo que precargue un importe sale de aquí:
   *  `holdings` trae los montos en la moneda principal con la etiqueta nativa. */
  rawHoldings: HoldingNativo[];
  currency: string;
  openContributions: OpenContribution[];
}) {
  const router = useRouter();
  const toast = useToast();

  // Aporte del mes pendiente por holding (brecha DCA), para el banner del detalle.
  const contribByHolding = new Map(openContributions.map((c) => [c.holdingId, c]));
  const rawById = new Map(rawHoldings.map((h) => [h.id, h]));

  const [adding, setAdding] = useState(false);
  const [editH, setEditH] = useState<HoldingNativo | null>(null);
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
        <MEmptyState
          icon="investment"
          title="Registra tu primera inversión"
          description="Anota una acción, un ETF o un inmueble y la app seguirá su valor, tu rendimiento y los dividendos que te paga."
          actionLabel="Agregar inversión"
          onAction={() => setAdding(true)}
        />
      ) : (
        // padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar; el aire
        // lateral lo pone la regla puente .m-swipe-content .m-drow.
        <MContentCard style={{ padding: 0, overflow: "hidden" }}>
          {holdings.map((h) => {
            const name = h.label || h.symbol || "Inversión";
            const nature = h.nature ? (NATURE_LABEL[h.nature] ?? h.assetType) : h.assetType;
            // Badge SOLO si hay símbolo real. Antes caía al nombre y una cuenta de ahorro
            // salía como ticker "CUEN", que parece una acción que no existe.
            const badge = h.symbol ? h.symbol.slice(0, 4).toUpperCase() : null;
            // 0 no es ni ganancia ni pérdida: sin signo, en neutro (no verde).
            const dir = h.returnPct > 0 ? 1 : h.returnPct < 0 ? -1 : 0;
            // El valor ya viene en la moneda primaria (portfolio-service); no se reconvierte.
            return (
              <SwipeRow key={h.id} onEdit={() => { const r = rawById.get(h.id); if (r) setEditH(r); }} onDelete={() => setDeleteH(h)}>
                {/* Tocar la fila abre el detalle (con su sparkline R5); el chevron lo indica.
                    Valor actual arriba + retorno % coloreado debajo (el retorno es la señal
                    verde/roja, no el valor, que siempre es positivo).
                    El badge de ticker solo se pinta cuando el activo TIENE símbolo: una
                    cuenta de ahorro o una propiedad no cotizan, y recortarles el nombre a
                    cuatro letras las disfrazaba de acción ("CUEN"). Sin símbolo va el glifo
                    de inversión del set, que no afirma nada falso. */}
                <MDataRow
                  {...(badge
                    ? {
                        leading: (
                          <span
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "grid",
                              placeItems: "center",
                              borderRadius: "inherit",
                              background: "linear-gradient(135deg, var(--s1), var(--s5))",
                              color: "#fff",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          >
                            {badge}
                          </span>
                        ),
                      }
                    : { icon: "investment" as const })}
                  title={name}
                  subtitle={nature}
                  value={
                    h.priceUnavailable ? (
                      // Cotizable sin precio: no mostramos valor/retorno inventados al costo.
                      <span className="muted" style={{ fontSize: 11, fontStyle: "italic", textAlign: "right", lineHeight: 1.25 }}>
                        precio no
                        <br />
                        disponible
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span>{mAmount(h.currentValue, currency, 10)}</span>
                        <span className={dir > 0 ? "pos" : dir < 0 ? "neg" : "muted"} style={{ fontSize: 11 }}>
                          {dir > 0 ? "+" : dir < 0 ? "−" : ""}
                          {formatPercent(Math.abs(h.returnPct), 1)}
                        </span>
                      </span>
                    )
                  }
                  chevron
                  onClick={() => setMovH(h)}
                  ariaLabel={`Movimientos de ${name}`}
                />
              </SwipeRow>
            );
          })}
        </MContentCard>
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
      {/* Sin el crudo no se abre el detalle: dentro se capturan renta y valuaciones, y sin
          la referencia nativa cualquier importe entraría en la unidad equivocada. Ambos
          salen del mismo `report`, así que en la práctica siempre está; el guard evita que
          un futuro desajuste se convierta en dato corrupto en vez de en una pantalla que
          no abre. */}
      {movH && rawById.has(movH.id) ? (
        <HoldingDetailSheet
          holding={movH}
          raw={rawById.get(movH.id) as HoldingNativo}
          currency={currency}
          contribution={contribByHolding.get(movH.id) ?? null}
          onClose={() => setMovH(null)}
          onEdit={() => {
            // El CRUDO, no `movH`: el detalle trae los importes convertidos.
            const r = rawById.get(movH.id);
            setMovH(null);
            if (r) setEditH(r);
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
