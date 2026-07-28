import { BottomSheet } from "./bottom-sheet";

/**
 * Elección del "+" contextual: una hoja pequeña con las acciones de la pantalla — mover sobre
 * lo que YA existe / crear algo nuevo. Genérica y reutilizable: Inversiones la usa para
 * "Aportar a una inversión / Crear inversión nueva", y Deudas/Ahorros/etc. la copiarán con
 * sus propios verbos sin reinventar la hoja.
 *
 * Cada opción es una fila (título + descripción opcional). Al elegir, cierra la hoja y dispara
 * la acción — que normalmente abre la siguiente hoja (picker o formulario).
 */
export function PlusChoiceSheet({
  open,
  onClose,
  title = "¿Qué quieres hacer?",
  options,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  options: { key: string; label: string; desc?: string; onSelect: () => void }[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="m-optlist">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className="m-opt"
            onClick={() => {
              onClose();
              o.onSelect();
            }}
          >
            <span>
              <span className="m-opt-t">{o.label}</span>
              {o.desc ? <span className="m-opt-d">{o.desc}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
