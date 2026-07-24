import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  validate,
}: {
  action: (raw: T) => Promise<ActionResult>;
  values: T;
  submitLabel?: string;
  pendingLabel?: string;
  successMessage?: string;
  onSuccess?: () => void;
  children: React.ReactNode;
  /**
   * Validación de cliente para el CONTRATO de clasificación (categoría obligatoria en registro
   * manual). Devuelve un mapa {campo → mensaje} si falta algo, o null si está OK. El botón NUNCA
   * se deshabilita por esto: al intentar guardar sin cumplir, el error se muestra A NIVEL DE CAMPO
   * (vía FieldErrorCtx, borde rojo + scroll/foco) y no se despacha. El warning es "sticky": se
   * recalcula con validate() en cada render, así desaparece solo cuando el usuario elige.
   */
  validate?: () => Record<string, string> | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const submittedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempted, setAttempted] = useState(false);
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

  // Warning "sticky": tras un intento inválido, mostrá el error de campo hasta que validate() pase.
  const clientErrors = attempted ? (validate?.() ?? null) : null;
  const fieldErrors = { ...(state.fieldErrors ?? {}), ...(clientErrors ?? {}) };

  return (
    <FieldErrorCtx.Provider value={fieldErrors}>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          // CONTRATO: no despachar sin clasificación; el error se ve a nivel de campo (no botón mudo).
          const errs = validate?.() ?? null;
          if (errs && Object.keys(errs).length > 0) {
            setAttempted(true);
            // El campo con error se renderiza en el próximo tick → scroll + foco recién ahí.
            setTimeout(() => {
              const el = formRef.current?.querySelector(".m-field-err");
              const field = el?.closest(".m-qfield");
              field?.scrollIntoView({ behavior: "smooth", block: "center" });
              field?.querySelector<HTMLElement>("button, input, select")?.focus();
            }, 0);
            return;
          }
          submittedRef.current = true;
          // startTransition envuelve el dispatch de useActionState → isPending se actualiza
          // bien (evita el warning "called outside of a transition").
          startTransition(() => dispatch(values));
        }}
      >
        {children}
        <button
          type="submit"
          className="m-btn m-btn-block m-btn-primary"
          disabled={pending}
          style={{ marginTop: 6 }}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </form>
    </FieldErrorCtx.Provider>
  );
}
