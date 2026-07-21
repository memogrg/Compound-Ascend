"use client";

/**
 * Personalización por hogar (Fase 2) de un frasco/sobre BASE:
 *   - Personalizar (editar) → `forkCategoryAction`: crea una copia del hogar con
 *     nombre/icono/color/favorito; la copia reemplaza al original para el hogar.
 *   - Ocultar → `hideCategoryAction`: la quita para el hogar; opcionalmente
 *     reasigna sus movimientos a otra categoría.
 *   - Revertir → `unforkCategoryAction` (deshace la copia) o `unhideCategoryAction`
 *     (re-muestra la base). Reutiliza las server actions de Fase 1; solo editores.
 *
 * `PersonalizeMenuItems` se incrusta dentro de cualquier menú (kebab del frasco o
 * del sobre); las modales se portalizan, así que no importa dónde se monten.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Icon, type IconName } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { CAT_COLORS } from "@/modules/financial-base/components/v2/expense-jars/category-kebab";
import {
  forkCategoryAction,
  hideCategoryAction,
  unforkCategoryAction,
  unhideCategoryAction,
} from "@/modules/financial-base/api/v2-actions";
import { EssentialCheck } from "@/components/shared/essential-check";
import {
  toggleEssentialAction,
  essentialToggleLabel,
} from "@/modules/financial-base/components/v2/expense-jars/essential-toggle";

export type PersonalizeTarget = {
  id: string;
  name: string;
  isSystem: boolean;
  icon: string | null;
  color: string | null;
  isFavorite: boolean;
  /** "Gasto esencial" (número de seguridad) del sobre; alimenta el toggle del kebab. */
  isEssential: boolean;
};

export type ReassignOption = { id: string; label: string };

/** Iconos ofrecidos al forkear (subconjunto del set del design system). */
const FORK_ICONS: IconName[] = [
  "budget",
  "expense",
  "savings",
  "invest",
  "defense",
  "spark",
  "profile",
  "networth",
];

/**
 * Estado + modales de personalización, IZADOS fuera de cualquier dropdown para
 * que sobrevivan al cierre del menú. Devuelve los disparadores (abrir fork/hide,
 * revertir) y el nodo de modales, que el padre monta en su raíz.
 */
export function usePersonalize({
  target,
  isFork,
  baseIdIfFork,
  reassignOptions,
}: {
  target: PersonalizeTarget;
  isFork: boolean;
  baseIdIfFork: string | null;
  reassignOptions: ReassignOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [modal, setModal] = useState<null | "fork" | "hide">(null);
  const [pending, start] = useTransition();

  function revert() {
    if (!baseIdIfFork) return;
    start(async () => {
      const res = await unforkCategoryAction({ baseId: baseIdIfFork });
      if (res.ok) {
        toast("Personalización revertida");
        router.refresh();
      } else {
        toast(res.message ?? "No pudimos revertir", "error");
      }
    });
  }

  const modals = (
    <>
      {modal === "fork" ? (
        <ForkCategoryModal
          target={target}
          onClose={() => setModal(null)}
          onDone={() => setModal(null)}
        />
      ) : null}
      {modal === "hide" ? (
        <HideCategoryModal
          target={target}
          reassignOptions={reassignOptions}
          onClose={() => setModal(null)}
          onDone={() => setModal(null)}
        />
      ) : null}
    </>
  );

  return {
    isFork,
    pending,
    openFork: () => setModal("fork"),
    openHide: () => setModal("hide"),
    revert,
    modals,
  };
}

// ── Menú (botones puros) ─────────────────────────────────────────────────────
/** Solo los botones del menú; NO monta modales (los iza el padre vía `usePersonalize`). */
export function PersonalizeMenuButtons({
  isFork,
  pending,
  onEdit,
  onHide,
  onRevert,
}: {
  isFork: boolean;
  pending: boolean;
  onEdit: () => void;
  onHide: () => void;
  onRevert: () => void;
}) {
  return isFork ? (
    <MenuButton icon="repeat" label="Revertir personalización" disabled={pending} onClick={onRevert} />
  ) : (
    <>
      <MenuButton icon="edit" label="Personalizar (editar)" onClick={onEdit} />
      <MenuButton icon="filter" label="Remover" onClick={onHide} />
    </>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="btn btn-ghost"
      disabled={disabled}
      style={{
        justifyContent: "flex-start",
        width: "100%",
        padding: "7px 8px",
        fontSize: 12.5,
        gap: 8,
        color: danger ? "var(--neg)" : undefined,
      }}
      onClick={onClick}
    >
      <Icon name={icon} width={2} /> {label}
    </button>
  );
}

// ── Modal: Personalizar (fork) ───────────────────────────────────────────────
export function ForkCategoryModal({
  target,
  onClose,
  onDone,
}: {
  target: PersonalizeTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(target.name);
  const [icon, setIcon] = useState<string | null>(target.icon);
  const [color, setColor] = useState<string | null>(target.color);
  const [favorite, setFavorite] = useState(target.isFavorite);
  const [essential, setEssential] = useState(target.isEssential);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const n = name.trim();
    if (!n) return setError("Ponle un nombre.");
    setError(null);
    start(async () => {
      const res = await forkCategoryAction({
        baseId: target.id,
        name: n,
        icon,
        color,
        isFavorite: favorite,
        isEssential: essential,
      });
      if (res.ok) {
        toast(`"${n}" personalizada para el hogar`);
        router.refresh();
        onDone();
      } else {
        setError(res.message ?? "No pudimos personalizar la categoría.");
      }
    });
  }

  return (
    <Modal title="Personalizar categoría" sub={target.name} onClose={onClose}>
      <div className="modal-body">
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Se crea una copia editable para tu hogar que reemplaza a la original. Puedes revertir
          cuando quieras.
        </p>
        {error ? (
          <div className="auth-msg warn" role="alert" style={{ marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        <div className="fld">
          <label className="fld-label">Nombre</label>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
        </div>

        <div className="fld" style={{ marginTop: 12 }}>
          <label className="fld-label">Icono</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {FORK_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-label={`Icono ${ic}`}
                aria-pressed={icon === ic}
                onClick={() => setIcon(ic)}
                className="icon-btn"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  border: icon === ic ? "2px solid var(--text)" : "1px solid var(--line)",
                  color: "var(--text)",
                }}
              >
                <Icon name={ic} />
              </button>
            ))}
          </div>
        </div>

        <div className="fld" style={{ marginTop: 12 }}>
          <label className="fld-label">Color</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CAT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: c,
                  border: color === c ? "2px solid var(--text)" : "2px solid transparent",
                  boxShadow: "0 0 0 1px var(--line)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>

        <label
          className="fld"
          style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Marcar como favorita (visible como sobre)</span>
        </label>

        <div className="fld" style={{ marginTop: 12 }}>
          <EssentialCheck checked={essential} onChange={setEssential} />
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>
          {pending ? "…" : "Guardar copia"}
        </button>
      </div>
    </Modal>
  );
}

// ── Modal: Ocultar (con reasignación opcional) ───────────────────────────────
export function HideCategoryModal({
  target,
  reassignOptions,
  onClose,
  onDone,
}: {
  target: PersonalizeTarget;
  reassignOptions: ReassignOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reassignTo, setReassignTo] = useState<string>("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await hideCategoryAction({
        baseId: target.id,
        reassignToId: reassignTo || null,
      });
      if (res.ok) {
        toast(`"${target.name}" removida para el hogar`);
        router.refresh();
        onDone();
      } else {
        setError(res.message ?? "No pudimos remover la categoría.");
      }
    });
  }

  return (
    <Modal title="Remover categoría" sub={target.name} onClose={onClose}>
      <div className="modal-body">
        <p style={{ fontSize: 13.5, marginBottom: 12 }}>
          <strong>{target.name}</strong> dejará de verse para todo el hogar. Su histórico no se
          pierde; puedes moverlo a otra categoría o dejarlo sin categoría.
        </p>
        <div className="fld">
          <label className="fld-label">Mover sus movimientos a (opcional)</label>
          <select
            className="sel"
            value={reassignTo}
            onChange={(e) => setReassignTo(e.target.value)}
          >
            <option value="">Sin reasignar (quedan sin categoría)</option>
            {reassignOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <div className="auth-msg warn" role="alert" style={{ marginTop: 10 }}>
            {error}
          </div>
        ) : null}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ background: "var(--neg)" }}
          onClick={submit}
          disabled={pending}
        >
          {pending ? "…" : "Remover"}
        </button>
      </div>
    </Modal>
  );
}

// ── Kebab compacto (sobres) ──────────────────────────────────────────────────
/** Kebab (dots) con las acciones de personalización, para la fila de un sobre. */
export function PersonalizeKebab({
  target,
  isFork,
  baseIdIfFork,
  reassignOptions,
}: {
  target: PersonalizeTarget;
  isFork: boolean;
  baseIdIfFork: string | null;
  reassignOptions: ReassignOption[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const p = usePersonalize({ target, isFork, baseIdIfFork, reassignOptions });
  const router = useRouter();
  const toast = useToast();
  const [essPending, startEss] = useTransition();

  // Marcar/desmarcar esencial como acción DIRECTA (2 taps desde la fila del sobre).
  // La ramificación propio/base vive en el helper único (toggleEssentialAction).
  const toggleEssential = () =>
    startEss(async () => {
      const res = await toggleEssentialAction(target.id, target.isSystem, !target.isEssential);
      if (res.ok) {
        toast(target.isEssential ? "Quitado de esenciales" : "Marcado como esencial");
        router.refresh();
      } else {
        toast(res.message ?? "No pudimos actualizar el sobre.", "error");
      }
    });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Personalizar ${target.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ width: 26, height: 26, color: "var(--muted)" }}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="dots" />
      </button>
      {open ? (
        <div
          role="menu"
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            width: 210,
            padding: 8,
            textAlign: "left",
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
          }}
          onClick={() => setOpen(false)}
        >
          <MenuButton
            icon="spark"
            label={essentialToggleLabel(target.isEssential)}
            disabled={essPending}
            onClick={toggleEssential}
          />
          <div style={{ borderTop: "1px solid var(--line)", margin: "4px 0" }} />
          <PersonalizeMenuButtons
            isFork={p.isFork}
            pending={p.pending}
            onEdit={p.openFork}
            onHide={p.openHide}
            onRevert={p.revert}
          />
        </div>
      ) : null}
      {/* Modales izados fuera del dropdown: sobreviven al cierre del menú. */}
      {p.modals}
    </div>
  );
}

/** Botón "Mostrar" (unhide) para una base oculta, usado en el gestor de categorías. */
export function UnhideButton({ baseId, name }: { baseId: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ padding: "4px 8px", fontSize: 12.5, gap: 6 }}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await unhideCategoryAction({ baseId });
          if (res.ok) {
            toast(`"${name}" restaurada`);
            router.refresh();
          } else {
            toast(res.message ?? "No pudimos restaurar", "error");
          }
        })
      }
    >
      <Icon name="repeat" width={2} /> Mostrar
    </button>
  );
}
