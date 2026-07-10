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

import { formatMoney } from "@/lib/format";
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
  currency,
}: {
  assets: Asset[];
  liabilities: Liability[];
  currency: string;
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
        <div className="card card-p">
          <div className="muted" style={{ padding: "12px 0", fontSize: 13.5, lineHeight: 1.5 }}>
            Aún no registras activos ni pasivos manuales. Toca el botón + para agregar el primero.
          </div>
        </div>
      ) : (
        <>
          {assets.length > 0 && (
            <div style={{ marginBottom: liabilities.length > 0 ? 14 : 0 }}>
              <div className="ov" style={{ marginBottom: 6 }}>
                Activos
              </div>
              <div className="card" style={{ padding: 0 }}>
                {assets.map((a) => (
                  <SwipeRow key={a.id} onEdit={() => setEditAsset(a)} onDelete={() => setDel({ kind: "asset", id: a.id, name: a.name })}>
                    <div className="lrow" style={{ margin: 0 }}>
                      <span className="lic" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 21V10l9-6 9 6v11" />
                          <path d="M9 21v-6h6v6" />
                        </svg>
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="lname">{a.name}</div>
                        <div className="lsub">
                          {ASSET_CLASS_LABEL[a.assetClass] ?? a.assetClass}
                          {a.generatesIncome ? " · genera ingreso" : ""}
                        </div>
                      </div>
                      <div className="lamt pos" style={{ marginLeft: "auto" }}>
                        {formatMoney(a.value, a.currency)}
                      </div>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            </div>
          )}

          {liabilities.length > 0 && (
            <div>
              <div className="ov" style={{ marginBottom: 6 }}>
                Pasivos
              </div>
              <div className="card" style={{ padding: 0 }}>
                {liabilities.map((l) => (
                  <SwipeRow key={l.id} onEdit={() => setEditLiab(l)} onDelete={() => setDel({ kind: "liability", id: l.id, name: l.name })}>
                    <div className="lrow" style={{ margin: 0 }}>
                      <span className="lic" style={{ background: "var(--danger-soft)", color: "var(--danger)" }} aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <rect x="3" y="6" width="18" height="13" rx="2" />
                          <path d="M3 10h18" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="lname">{l.name}</div>
                        <div className="lsub">{LIAB_CLASS_LABEL[l.liabilityClass] ?? l.liabilityClass}</div>
                      </div>
                      <div className="lamt neg" style={{ marginLeft: "auto" }}>
                        −{formatMoney(l.balance, l.currency)}
                      </div>
                    </div>
                  </SwipeRow>
                ))}
              </div>
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
            currency={currency}
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
            currency={currency}
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
            currency={currency}
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
