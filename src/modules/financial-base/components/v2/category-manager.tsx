"use client";

/**
 * Gestor de categorías: crear, editar, eliminar (con re-asignación) y fusionar.
 * Las categorías de sistema son de solo lectura salvo "favorito". Las propias
 * del usuario son totalmente editables. Cumple: sin pérdida de histórico.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import {
  addCategoryAction,
  editCategoryAction,
  removeCategoryAction,
  mergeCategoryAction,
} from "@/modules/financial-base/api/v2-actions";
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

export function CategoryManagerButton({ tree }: { tree: CategoryNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-ghost"
        style={{ padding: "12px 16px", fontSize: 14 }}
        onClick={() => setOpen(true)}
      >
        <Icon name="gear" width={2} /> Categorías
      </button>
      {open ? <CategoryManagerModal tree={tree} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function CategoryManagerModal({
  tree,
  onClose,
}: {
  tree: CategoryNode[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(tree[0]?.id ?? "");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  // Lista plana ordenada por grupo: destino de fusión (puede ser cualquiera).
  const flat = useMemo(
    () =>
      tree.flatMap((g) => [
        { id: g.id, label: g.name },
        ...g.children.map((c) => ({ id: c.id, label: `   ${c.name}` })),
      ]),
    [tree],
  );

  // Solo las del usuario (no sistema) se pueden borrar/editar/fusionar como origen
  // (las de sistema no se pueden desactivar por RLS, así que no son origen válido).
  const userCats = useMemo(
    () => tree.flatMap((g) => [g, ...g.children]).filter((c) => !c.isSystem),
    [tree],
  );

  async function onCreate() {
    if (!newName.trim()) return;
    setPending(true);
    const res = await addCategoryAction({
      name: newName.trim(),
      parentId: newGroup || null,
      categoryType: "expense",
    });
    setPending(false);
    if (res.ok) {
      toast("Categoría creada");
      setNewName("");
      router.refresh();
    } else {
      toast(res.message ?? "No pudimos crear la categoría", "error");
    }
  }

  async function onMerge() {
    if (!mergeFrom || !mergeInto || mergeFrom === mergeInto) {
      toast("Elige dos categorías distintas", "error");
      return;
    }
    setPending(true);
    const res = await mergeCategoryAction({ fromId: mergeFrom, intoId: mergeInto });
    setPending(false);
    if (res.ok) {
      toast("Categorías fusionadas");
      setMergeFrom("");
      setMergeInto("");
      router.refresh();
    } else {
      toast(res.message ?? "No pudimos fusionar", "error");
    }
  }

  async function onToggleFavorite(id: string, current: boolean) {
    await editCategoryAction(id, { isFavorite: !current });
    router.refresh();
  }

  async function onDelete(id: string) {
    setPending(true);
    const res = await removeCategoryAction({ id, reassignToId: null });
    setPending(false);
    if (res.ok) {
      toast("Categoría eliminada (transacciones conservadas)");
      router.refresh();
    } else {
      toast(res.message ?? "No pudimos eliminar", "error");
    }
  }

  return (
    <Modal
      title="Gestionar categorías"
      sub="Crea, fusiona y organiza. Tu histórico nunca se pierde."
      onClose={onClose}
    >
      <div className="modal-body">
        {/* Crear */}
        <div className="fld">
          <label className="fld-label">Nueva categoría</label>
          <div className="fld-2">
            <input
              className="inp"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej. Cuotas del gym"
            />
            <select className="sel" value={newGroup} onChange={(e) => setNewGroup(e.target.value)}>
              <option value="">Sin grupo (Nivel 1)</option>
              {tree.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={() => void onCreate()}
            disabled={pending}
          >
            <Icon name="plus" width={2} /> Crear
          </button>
        </div>

        {/* Fusionar */}
        <div className="fld" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <label className="fld-label">Fusionar duplicadas</label>
          <div className="fld-2">
            <select
              className="sel"
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
            >
              <option value="">Fusionar… (tuya)</option>
              {userCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="sel"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
            >
              <option value="">…dentro de</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 8, alignSelf: "flex-start" }}
            onClick={() => void onMerge()}
            disabled={pending}
          >
            <Icon name="repeat" width={2} /> Fusionar
          </button>
          <span className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
            Las transacciones de la categoría origen se re-asignan al destino.
          </span>
        </div>

        {/* Tus categorías */}
        {userCats.length > 0 ? (
          <div className="fld" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <label className="fld-label">Tus categorías</label>
            {userCats.map((c) => (
              <div key={c.id} className="cmp-cat-row">
                <span className="cmp-dot" style={{ background: c.color ?? "var(--muted-2)" }} />
                <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "4px 8px" }}
                  onClick={() => void onToggleFavorite(c.id, c.isFavorite)}
                >
                  <Icon name={c.isFavorite ? "check" : "spark"} width={2} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: "4px 8px", color: "var(--neg)" }}
                  onClick={() => void onDelete(c.id)}
                  disabled={pending}
                >
                  <Icon name="x" width={2} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
            Aún no has creado categorías propias. Las de sistema no se pueden borrar, pero puedes
            marcarlas como favoritas desde aquí en el futuro.
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
