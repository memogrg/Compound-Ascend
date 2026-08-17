# data-testid candidates (delta de app · antes de Fase 5/6)

El repo hoy tiene **0 `data-testid`**; los POMs de este harness se apoyan en
roles/labels accesibles donde existen, y en texto/CSS solo donde el DOM no ofrece un
handle estable. Esta lista es el contenido de un **issue scoped**: sembrar estos
`data-testid` (atributos **inertes**, cero cambio de comportamiento) hace los journeys
robustos ante el rebrand (CARTERA+/My Agent C+) y el churn de copy. Correr como delta de
app **justo antes de Fase 5/6**, no ahora.

Cada fila indica el selector frágil actual (centralizado en un único punto del POM) y el
`data-testid` propuesto.

## Web

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| Password login | `#password` (getByLabel colisiona con el toggle "Mostrar contraseña") | `login-password` | `src/components/auth/field.tsx` (el input password) |
| Subcategoría de ingreso (hoja) | `.fld:has(label:has-text("Subcategoría")) button` → `.first()` | `income-subcat-leaf` | `register-income-modal.tsx` |
| Sobre "(general)" del gasto | `getByRole("button", { name: /\(general\)/ })` → `.first()` | `expense-envelope-option` | composer de `/gastos` |

## Móvil (`/m`)

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| Campos del Form Kit (label es `<div class="m-qlabel">`, no `<label htmlFor>`) | `getByPlaceholder(...)` / scoping por `.m-qlabel` | `mfield-<name>` en el `<input>` de `Field` | `m/components/form-kit/fields.tsx` |
| Trigger SheetSelect (subcategoría, sobre) | `.m-qfield:has(.m-qlabel:has-text("…")) button.m-sheetselect` | `sheetselect-<name>` | `fields.tsx` (SheetSelect) · `gastos-forms.tsx` (SobreField) |
| Opción de lista (`.m-opt`) en pickers/SheetSelect | `dialog.locator(".m-opt").first()` | `opt-<value>` | `fields.tsx`, `gastos-forms.tsx`, `income-manager.tsx` |

## Nota

Los elementos con handle accesible **estable** (botones "Registrar ingreso",
"Registrar gasto", "Guardar ingreso", "Iniciar sesión"; diálogos por `aria-label`; FAB por
`aria-label`) **no** necesitan `data-testid` — se mantienen por rol/nombre.
