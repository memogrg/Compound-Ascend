"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Toast global del móvil (form kit). Un ToastProvider vive en el layout (app) y expone
 * useToast(); cualquier pantalla /m puede mostrar un aviso de éxito/error. Scoped a
 * .m-shell vía mobile.css. es-MX, safe areas.
 */

export type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

type ToastApi = { show: (message: string, variant?: ToastVariant) => void };

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  // Fallback no-op: permite usar componentes del kit fuera del provider sin romper.
  return ctx ?? { show: () => {} };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = idRef.current++;
      setItems((list) => [...list, { id, message, variant }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 3200),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="m-toast-wrap" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`m-toast m-toast-${t.variant}`}
            onClick={() => dismiss(t.id)}
          >
            <span className="m-toast-dot" aria-hidden />
            <span>{t.message}</span>
          </button>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
