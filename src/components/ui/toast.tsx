"use client";

/**
 * Sistema de toasts (notificaciones efímeras de confirmación).
 * Provider montado en el cascarón; cualquier componente cliente del área
 * autenticada puede dispararlos con `const toast = useToast()`.
 * a11y: cada toast es role="status" aria-live="polite" para lectores de pantalla.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon";

type Variant = "success" | "error" | "info";
export type ToastAction = { label: string; onClick: () => void };
type ToastFn = (message: string, variant?: Variant, action?: ToastAction) => void;
type Item = { id: number; message: string; variant: Variant; action?: ToastAction };

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastFn>((message, variant = "success", action) => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((list) => [...list, { id, message, variant, action }]);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap" role="region" aria-label="Notificaciones">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICON: Record<Variant, IconName> = { success: "check", error: "x", info: "spark" };
const DOT_BG: Record<Variant, string> = {
  success: "var(--pos)",
  error: "var(--neg)",
  info: "var(--info)",
};

function ToastView({ item, onDone }: { item: Item; onDone: () => void }) {
  const [show, setShow] = useState(false);
  const lifeMs = item.action ? 5000 : 3000; // más tiempo si hay "Deshacer"

  useEffect(() => {
    const enter = requestAnimationFrame(() => setShow(true));
    const hide = setTimeout(() => setShow(false), lifeMs);
    const done = setTimeout(onDone, lifeMs + 260);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [onDone, lifeMs]);

  return (
    <div className={show ? "toast show" : "toast"} role="status" aria-live="polite">
      <span className="ic" style={{ background: DOT_BG[item.variant] }}>
        <Icon name={ICON[item.variant]} width={2} />
      </span>
      {item.message}
      {item.action ? (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            item.action!.onClick();
            onDone();
          }}
        >
          {item.action.label}
        </button>
      ) : null}
    </div>
  );
}
