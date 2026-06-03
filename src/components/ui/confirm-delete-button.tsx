"use client";

/**
 * Botón de borrado con confirmación. Evita borrados accidentales: la X abre un
 * diálogo accesible (Modal) y solo elimina al confirmar. Compartido por todos
 * los módulos; cada uno pasa su acción y el sustantivo del ítem.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type Result = { ok: boolean; message?: string };

export function ConfirmDeleteButton({
  onConfirm,
  noun,
}: {
  onConfirm: () => Promise<Result>;
  /** Sustantivo del ítem, p. ej. "este ingreso", "esta deuda". */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const doDelete = () => {
    startTransition(async () => {
      const res = await onConfirm();
      if (res.ok) {
        toast("Eliminado");
        setOpen(false);
        router.refresh();
      } else {
        toast(res.message ?? "No se pudo eliminar", "error");
      }
    });
  };

  return (
    <>
      <button
        className="icon-btn"
        style={{ width: 30, height: 30 }}
        aria-label="Eliminar"
        title="Eliminar"
        onClick={() => setOpen(true)}
      >
        <Icon name="x" width={2} />
      </button>
      {open ? (
        <Modal title={`¿Eliminar ${noun}?`} sub="Esta acción no se puede deshacer." onClose={() => setOpen(false)}>
          <div className="modal-body">
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)", margin: 0 }}>
              Se eliminará {noun} de forma permanente. Si solo quieres ajustarlo, usa el botón de
              editar en su lugar.
            </p>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={doDelete} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
