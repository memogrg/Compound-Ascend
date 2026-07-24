import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "./toast";

/**
 * FormShell (form kit): envuelve useActionState sobre una Server Action existente
 * `(raw) => ActionResult`. Muestra pending, errores por campo (fieldErrors de Zod, vía
 * contexto que leen los campos) y un Toast de éxito/error; al terminar con éxito hace
 * router.refresh() (revalida el server component de la lista) y llama onSuccess.
 * NO reimplementa validación ni persistencia: todo vive en la action/schema del módulo.
 */

export type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; message?: string };

const FieldErrorCtx = createContext<Record<string, string>>({});
/** Lee el error de un campo (por su `name`, igual que fieldErrors de Zod). */
export function useFormError(name: string): string | undefined {
  return useContext(FieldErrorCtx)[name];
}

export function FormShell<T>({
  action,
  values,
  submitLabel = "Guardar",
  pendingLabel = "Guardando…",
  successMessage = "Listo",
  onSuccess,
  children,
  disabled = false,
  disabledHint,
}: {
  action: (raw: T) => Promise<ActionResult>;
  values: T;
  submitLabel?: string;
  pendingLabel?: string;
  successMessage?: string;
  onSuccess?: () => void;
  children: React.ReactNode;
  /** Bloqueo de guardado del lado del cliente (p.ej. categoría obligatoria en registro manual). */
  disabled?: boolean;
  /** Texto que explica por qué no se puede guardar (se muestra cuando `disabled`). */
  disabledHint?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const submittedRef = useRef(false);
  // Refs para el efecto: evita re-ejecuciones por identidad de props no memoizadas.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const successMsgRef = useRef(successMessage);
  successMsgRef.current = successMessage;

  const [state, dispatch, pending] = useActionState<ActionResult, T>(
    async (_prev, payload) => action(payload),
    { ok: false },
  );

  useEffect(() => {
    if (!submittedRef.current) return; // ignora el estado inicial
    submittedRef.current = false;
    if (state.ok) {
      toast.show(successMsgRef.current, "success");
      router.refresh();
      onSuccessRef.current?.();
    } else if (state.message) {
      toast.show(state.message, "error");
    }
    // Los fieldErrors se muestran inline en cada campo vía FieldErrorCtx.
  }, [state, toast, router]);

  return (
    <FieldErrorCtx.Provider value={state.fieldErrors ?? {}}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return; // gate de cliente (categoría obligatoria en registro manual)
          submittedRef.current = true;
          // startTransition envuelve el dispatch de useActionState → isPending se actualiza
          // bien (evita el warning "called outside of a transition").
          startTransition(() => dispatch(values));
        }}
      >
        {children}
        {disabled && disabledHint && !pending ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {disabledHint}
          </p>
        ) : null}
        <button
          type="submit"
          className="m-btn m-btn-block m-btn-primary"
          disabled={pending || disabled}
          style={{ marginTop: 6 }}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </form>
    </FieldErrorCtx.Provider>
  );
}
