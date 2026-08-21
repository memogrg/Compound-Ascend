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

## Cluster 1 — Onboarding + loop de dinero (Fase 5/6)

Selectores frágiles nuevos introducidos por los journeys `onboarding.spec.ts` y
`money-loop.spec.ts` (centralizados en `web.pods.ts` / `mobile.pods.ts`):

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| StartChoice · "Guíame paso a paso" | `getByRole("button", { name: /Guíame paso a paso/ })` | `onboarding-start-guided` | `personal-profile/components/start-choice.tsx` |
| Wizard · nombre (paso 1) | `getByPlaceholder("Memo, Caro…")` | `onboarding-display-name` | `wizard.tsx` (web) · `mobile-profile-wizard.tsx` (móvil) |
| Wizard · núcleo financiero (paso 1) | `getByRole("button", { name: "Personal" })` (OptionCard `.opt`/`.m-opt`, por label de copy) | `onboarding-nucleus-<value>` | `primitives.tsx` (web `OptionCards`) · `wizard-fields.tsx` (móvil) |
| Wizard · avanzar/finalizar | `getByRole("button", { name: /^Continuar/ })` · `"Siguiente"` · `"Finalizar"` | `onboarding-next` / `onboarding-finish` | `wizard.tsx` footer · `mobile-profile-wizard.tsx` footer |
| Consumo del frasco (gastado) | `getByText(grouped(amount))` (monto agrupado, ej. "7.777") | `jar-spent` (en la fila del frasco/sobre) | `financial-base/components/v2/expense-jars/jar-row.tsx` |

Nota de fidelidad: el gate de "Flujo del mes" NO se scrapea (número-vs-oracle = Fase 4/5);
el reflejo del gasto en el período se asegura por BD (`periodExpenseTotal`), no por el número
en pantalla. El consumo del frasco se matchea por el **monto agrupado** en la fila — el
`data-testid` `jar-spent` lo haría inmune al formato/copy.

## Nota

Los elementos con handle accesible **estable** (botones "Registrar ingreso",
"Registrar gasto", "Guardar ingreso", "Iniciar sesión"; diálogos por `aria-label`; FAB por
`aria-label`) **no** necesitan `data-testid` — se mantienen por rol/nombre.
