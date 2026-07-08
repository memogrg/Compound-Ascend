/**
 * Form kit móvil (Fase 0): primitivas de gestión (crear/editar/eliminar) reutilizables
 * por todas las pantallas /m. Scoped a .m-shell. Reutilizan schemas/actions existentes;
 * no reimplementan validación ni persistencia.
 */
export { ToastProvider, useToast } from "./toast";
export type { ToastVariant } from "./toast";
export { BottomSheet } from "./bottom-sheet";
export { FormShell, useFormError } from "./form-shell";
export type { ActionResult } from "./form-shell";
export {
  TextField,
  MoneyField,
  DateField,
  Segmented,
  SheetSelect,
  Toggle,
  Stepper,
} from "./fields";
export type { Opt } from "./fields";
export { SwipeRow } from "./swipe-row";
export { ConfirmDialog } from "./confirm-dialog";
export { Fab } from "./fab";
