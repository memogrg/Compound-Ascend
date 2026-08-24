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

## Cluster 2 — Pago de deuda (Fase 5/6)

Selectores frágiles nuevos de `debt-payment.spec.ts` (la SIEMBRA de las 2 deudas NO usa selectores:
va server-side vía `createDebt(ctx)` en `debt-fixture.ts`, corrido por tsx con el stub de
`server-only` — el mismo path headless del sim):

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| Ficha deuda · "Reportar pago" (primario) | `getByRole("button", { name: "Reportar pago" })` | `debt-report-payment` | `control/components/debt-detail.tsx` (web) · `deudas/debt-manager.tsx` (móvil) |
| Web · ReportPaymentModal · monto | `dialog[name="Reportar pago"] .inp-money input[type=number]` (el 1º = "Monto de la cuota") | `debt-payment-amount` | `debt-detail.tsx` (ReportPaymentModal) |
| Móvil · fila de deuda (scope del pago) | `div.filter({hasText: name}).filter({has: "Reportar pago"}).last()` | `debt-row-<id>` en la `MDataRow`/`SwipeRow` | `content-kit/data-row.tsx` · `deudas/debt-manager.tsx` |
| Móvil · PaymentForm · monto | `dialog[name="Reportar pago"] getByPlaceholder("0")` (MoneyField) | `debt-payment-amount-m` | `deudas/PaymentForm` · `form-kit/fields.tsx` |

Nota FX: la moneda del pago **no se toca** (web ReportPaymentModal es nativa fija sin selector; móvil
la precarga nativa) — cambiarla haría que el servicio rechace el pago (guarda #437). El gate duro es
`debt_payments.amount` NATIVO (service-role); el gate de display FX usa la conversión real de la app
(`getDebtsOverview`), robusto a la tasa.

## Cluster 3 — IA por UI (recibo + asesor, Fase 5/6)

Selectores frágiles de `receipt-scan.spec.ts` / `advisor-chat.spec.ts` (y el live gated
`live/receipt-scan.live.spec.ts`), centralizados en `pods/ai-shared.ts` — el componente
`assistant-conversation.tsx` (ReceiptConfirmCard + chat) es **compartido** por web `/asistente`
y móvil `/m/asistente`, así que su POM vive en un solo archivo:

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| Recibo · input de archivo (oculto) | `input[aria-label="Escanear recibo con la cámara"]` (`setInputFiles` directo; el botón visible solo abre el picker) | `receipt-file-input` | `assistant-conversation.tsx` |
| ReceiptConfirmCard (contenedor) | `.ac-rc-card` | `receipt-card` | `assistant-conversation.tsx` |
| Card · campos | `getByLabel("Comercio"/"Fecha"/"Monto"/"Moneda")` (label htmlFor) · sobre = `getByRole("combobox",{name:"Sobre"})` | `receipt-{comercio,fecha,monto,moneda,sobre}` | `assistant-conversation.tsx` · `sobre-combobox.tsx` |
| Card · chip confirmar moneda | `getByRole("button",{name:/^Sí, es/})` (obligatorio: monedaOk=false si la moneda se adivina; confirmar() hace return si no) | `receipt-currency-confirm` | `assistant-conversation.tsx` |
| Card · Confirmar / Cancelar | `.ac-rc-card getByRole("button",{name:"Confirmar"\|"Cancelar"})` (texto+clase; "Confirmar" lo comparten Goal/PriceAlert cards) | `receipt-confirm` / `receipt-cancel` | `assistant-conversation.tsx` |
| Card · éxito post-confirm | `getByText(/✓ Registrado\|✓ Ya lo registré/)` | `receipt-done` | `assistant-conversation.tsx` |
| Sobre · listbox (artefacto Playwright, NO bug de producto) | el producto SÍ cierra al elegir/Escape/blur (`choose()→close()`); el click sintético de Playwright sobre el `<li role=option>` custom (bajo `<ul onMouseDown preventDefault>`) no asienta el cierre → el helper cierra por blur-a-Comercio | `sobre-listbox` | `sobre-combobox.tsx` |
| Chat · input | `getByRole("textbox",{name:"Mensaje para My Agent C+"})` | `chat-input` | `assistant-conversation.tsx` |
| Chat · enviar | web = Enter · móvil = `getByRole("button",{name:"Enviar"})` (móvil Enter = salto de línea) | `chat-send` | `assistant-conversation.tsx` |
| Chat · burbuja de respuesta | `.coach-bubble` (web) / `.m-bubble` (móvil) — **usuario y asistente comparten la clase** (se distinguen por la fila `.msgMe`); el asistente es la ÚLTIMA burbuja | `chat-bubble` (+ `data-role`) | `assistant-conversation.tsx` |

Nota de determinismo/config (no son selectores): el run por defecto fuerza el **StubProvider**
inyectando `GEMINI_API_KEY:""` en `webServer.env`; los routes `/api/assistant/*` validan el env
completo vía `getServerEnv()` (`corsHeaders`/`assertTrustedOrigin`), así que la config inyecta
`APP_ENV:"development"` (el `"test"` previo NO está en `appEnvSchema` → 500) y `ALLOWED_ORIGINS`
del puerto 3100. La visión real va por el config **gated** aparte (`cert:e2e:live`).

## Cluster 4 — Alta de holding (Fase 5/6)

Selectores frágiles de `holding-buy.spec.ts` (wizard 2-pasos, mismo `addHoldingAction` en las 2
superficies; POM en `web.pods.ts`/`mobile.pods.ts`). El alta ES la acción del journey (sin seed);
el SOFT de net worth se lee headless con `holding-fixture.ts` (tsx + server-only stub, patrón
debt-fixture). **`/m/inversiones`, NO `/m/patrimonio`** (esta última es activos/pasivos de net worth).

| Elemento | Selector actual (POM) | `data-testid` propuesto | Archivo |
|---|---|---|---|
| Abrir wizard (web/móvil) | `getByRole("button",{name:"Agregar inversión"}).first()` (móvil = FAB/empty-state) | `add-holding-open` | `add-holding-wizard.tsx` · `inversiones-manager.tsx` |
| Paso 1 · categoría (web) | `getByRole("combobox",{name:"Tipo de inversión · Crecimiento"}).selectOption("cripto")` (option value = category key) | `holding-category-<nature>` | `add-holding-wizard.tsx` (CategoryGroup) |
| Paso 1 · categoría (móvil) | `getByRole("button",{name:"Cripto y activos digitales"})` (`.m-opt`, texto = label) | `holding-category-<key>` | `inversiones-forms.tsx` (Step1) |
| Wizard (contenedor, título cambia en paso 2) | `getByRole("dialog").filter({has: button "Guardar"})` (el sheet anidado "Moneda" no tiene Guardar) | `holding-wizard` | `add-holding-wizard.tsx` · `inversiones-forms.tsx` |
| Campos paso 2 (web) | `.fld:has(.fld-label:has-text("Nombre"/"Monto invertido"/"Moneda"/"Símbolo"/"Precio de compra")) input\|select` (label sin htmlFor; varios `placeholder="0"`) | `holding-<field>` | `add-holding-wizard.tsx` (Step2) |
| Campos paso 2 (móvil) | `[name="name"]`/`[name="symbol"]` (TextInput) · `.m-qfield:has(.m-qlabel:has-text("Monto invertido"/"Precio de compra")) input` (MoneyField, `.m-qlabel` es div) | `holding-<field>` | `inversiones-forms.tsx` · `form-kit/fields.tsx` |
| Moneda (móvil, SheetSelect) | `.m-qfield:has(.m-qlabel:has-text("Moneda")) button.m-sheetselect` → dialog "Moneda" → `button /Dólar estadounidense/` | `holding-currency` + `cur-opt-USD` | `form-kit/fields.tsx` (SheetSelect) |
| registerExpense (OBLIGATORIO) | web: `getByText("La compré ahora")` (radio label) · móvil: `getByRole("button",{name:/La compré ahora/})` (`.m-opt`) — default OFF; sin esto NO hay txn vinculada | `holding-register-expense` | `add-holding-wizard.tsx:1132` · `inversiones-forms.tsx:765` |
| Guardar | `getByRole("button",{name:"Guardar"})` (disabled hasta canSave) | `holding-save` | `add-holding-wizard.tsx` · `inversiones-forms.tsx` |

Nota determinismo: el precio en vivo (`/api/market-price`) solo **pre-llena** el precio si está
vacío → el POM llena el precio explícito (100) → `quantity`/`average_cost` deterministas aunque
market-data falle. El símbolo cripto (BTC) ejercita el path keyless (Binance/CoinGecko) para el SOFT.

## Nota

Los elementos con handle accesible **estable** (botones "Registrar ingreso",
"Registrar gasto", "Guardar ingreso", "Iniciar sesión"; diálogos por `aria-label`; FAB por
`aria-label`) **no** necesitan `data-testid` — se mantienen por rol/nombre.
