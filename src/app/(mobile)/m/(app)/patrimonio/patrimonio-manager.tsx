"use client";

/**
 * CRUD de ACTIVOS y PASIVOS manuales en /m/patrimonio (tablas assets/liabilities),
 * mismo molde que /m/ingresos. Reutiliza las Server Actions de rich-life
 * (add/edit/remove{Asset,Liability}Action) sin duplicar lógica. Distingue activo
 * (verde, suma) vs pasivo (rojo, resta) en secciones separadas. Form Kit:
 *  - FAB → selector (activo/pasivo) → alta; SwipeRow → Editar / Eliminar con ConfirmDialog.
 * es-MX, tema claro.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  addAssetAction,
  editAssetAction,
  removeAssetAction,
  addLiabilityAction,
  editLiabilityAction,
  removeLiabilityAction,
} from "@/modules/rich-life/api/actions";
import type { Asset, Liability } from "@/modules/rich-life/types";

import { Fab, BottomSheet, SwipeRow, ConfirmDialog, useToast } from "../../components/form-kit";
import { MContentCard, MSectionHeader, MDataRow, MEmptyState, mAmount } from "../../components/content-kit";
import {
  WealthItemForm,
  type AssetValues,
  type LiabilityValues,
  type WealthItemInitial,
} from "./wealth-item-form";

const ASSET_CLASS_LABEL: Record<string, string> = {
  liquido: "Líquido",
  inversion: "Inversión",
  productivo: "Productivo",
  uso_personal: "Uso personal",
  especial: "Especial",
};
const LIAB_CLASS_LABEL: Record<string, string> = {
  consumo: "Consumo",
  patrimonial: "Patrimonial",
  productivo: "Productivo",
  critico: "Crítico",
};

const assetToInitial = (a: Asset): WealthItemInitial => ({
  name: a.name,
  cls: a.assetClass,
  amount: a.value,
  currency: a.currency,
  generatesIncome: a.generatesIncome,
});
const liabToInitial = (l: Liability): WealthItemInitial => ({
  name: l.name,
  cls: l.liabilityClass,
  amount: l.balance,
  currency: l.currency,
  generatesIncome: false,
});

type DelTarget = { kind: "asset" | "liability"; id: string; name: string };

export function PatrimonioManager({
  assets,
  liabilities,
}: {
  assets: Asset[];
  liabilities: Liability[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [chooser, setChooser] = useState(false);
  const [addKind, setAddKind] = useState<"asset" | "liability" | null>(null);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [editLiab, setEditLiab] = useState<Liability | null>(null);
  const [del, setDel] = useState<DelTarget | null>(null);
  const [delPending, setDelPending] = useState(false);

  const empty = assets.length === 0 && liabilities.length === 0;

  const confirmDelete = async () => {
    if (!del) return;
    setDelPending(true);
    const res = del.kind === "asset" ? await removeAssetAction(del.id) : await removeLiabilityAction(del.id);
    setDelPending(false);
    if (res.ok) {
      toast.show(del.kind === "asset" ? "Activo eliminado" : "Pasivo eliminado", "success");
      setDel(null);
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo eliminar.", "error");
    }
  };

  return (
    <>
      {empty ? (
        <MEmptyState
          icon="household"
          title="Registra lo que tienes y lo que debes"
          description="Anota tus activos —una casa, un carro, ahorros— y tus pasivos, y verás tu patrimonio neto crecer mes a mes."
          actionLabel="Agregar activo o pasivo"
          onAction={() => setChooser(true)}
        />
      ) : (
        <>
          {assets.length > 0 && (
            <div style={{ marginBottom: liabilities.length > 0 ? 16 : 0 }}>
              <MSectionHeader title="Activos" />
              {/* padding 0: la fila va a sangre para que el gesto revele Editar/Eliminar;
                  el aire lateral lo pone la regla puente .m-swipe-content .m-drow. Los montos
                  van en la moneda NATIVA de cada activo (a.currency): la lista es por-ítem,
                  no un agregado — no se convierte ni se suma aquí. */}
              <MContentCard style={{ padding: 0, overflow: "hidden" }}>
                {assets.map((a) => (
                  <SwipeRow key={a.id} onEdit={() => setEditAsset(a)} onDelete={() => setDel({ kind: "asset", id: a.id, name: a.name })}>
                    {/* icon+iconTone (no leading): casa/tarjeta SON glifos del set, y el tinte
                        verde/rojo distingue lo que suma de lo que resta antes de leer el monto. */}
                    <MDataRow
                      icon="housing"
                      iconTone="success"
                      title={a.name}
                      subtitle={`${ASSET_CLASS_LABEL[a.assetClass] ?? a.assetClass}${a.generatesIncome ? " · genera ingreso" : ""}`}
                      value={mAmount(a.value, a.currency, 10)}
                      valueTone="success"
                    />
                  </SwipeRow>
                ))}
              </MContentCard>
            </div>
          )}

          {liabilities.length > 0 && (
            <div>
              <MSectionHeader title="Pasivos" />
              <MContentCard style={{ padding: 0, overflow: "hidden" }}>
                {liabilities.map((l) => (
                  <SwipeRow key={l.id} onEdit={() => setEditLiab(l)} onDelete={() => setDel({ kind: "liability", id: l.id, name: l.name })}>
                    <MDataRow
                      icon="debt"
                      iconTone="danger"
                      title={l.name}
                      subtitle={LIAB_CLASS_LABEL[l.liabilityClass] ?? l.liabilityClass}
                      // Un pasivo resta: se pasa en negativo y el signo lo antepone el
                      // formateador central (−₡1.500.000), no una plantilla local.
                      value={mAmount(-l.balance, l.currency, 10)}
                      valueTone="danger"
                    />
                  </SwipeRow>
                ))}
              </MContentCard>
            </div>
          )}
        </>
      )}

      <Fab onClick={() => setChooser(true)} label="Agregar activo o pasivo" />

      {/* Selector activo/pasivo */}
      <BottomSheet open={chooser} onClose={() => setChooser(false)} title="¿Qué quieres agregar?">
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            onClick={() => {
              setChooser(false);
              setAddKind("asset");
            }}
          >
            Activo
          </button>
          <button
            type="button"
            className="m-btn m-btn-block m-btn-secondary"
            onClick={() => {
              setChooser(false);
              setAddKind("liability");
            }}
          >
            Pasivo
          </button>
        </div>
      </BottomSheet>

      {/* Alta (activo o pasivo) */}
      <BottomSheet
        open={!!addKind}
        onClose={() => setAddKind(null)}
        title={addKind === "liability" ? "Agregar pasivo" : "Agregar activo"}
      >
        {addKind ? (
          <WealthItemForm
            kind={addKind}
            action={addKind === "asset" ? addAssetAction : addLiabilityAction}
            submitLabel="Guardar"
            successMessage={addKind === "asset" ? "Activo agregado" : "Pasivo agregado"}
            onSuccess={() => setAddKind(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Editar activo */}
      <BottomSheet open={!!editAsset} onClose={() => setEditAsset(null)} title="Editar activo">
        {editAsset ? (
          <WealthItemForm
            kind="asset"
            initial={assetToInitial(editAsset)}
            action={(v: AssetValues | LiabilityValues) => editAssetAction(editAsset.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Activo actualizado"
            onSuccess={() => setEditAsset(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Editar pasivo */}
      <BottomSheet open={!!editLiab} onClose={() => setEditLiab(null)} title="Editar pasivo">
        {editLiab ? (
          <WealthItemForm
            kind="liability"
            initial={liabToInitial(editLiab)}
            action={(v: AssetValues | LiabilityValues) => editLiabilityAction(editLiab.id, v)}
            submitLabel="Guardar cambios"
            successMessage="Pasivo actualizado"
            onSuccess={() => setEditLiab(null)}
          />
        ) : null}
      </BottomSheet>

      {/* Eliminación */}
      <ConfirmDialog
        open={!!del}
        title={del?.kind === "liability" ? "Eliminar pasivo" : "Eliminar activo"}
        message={del ? `Se eliminará "${del.name}". Esta acción no se puede deshacer.` : undefined}
        confirmLabel="Eliminar"
        variant="danger"
        pending={delPending}
        onConfirm={confirmDelete}
        onCancel={() => setDel(null)}
      />
    </>
  );
}
