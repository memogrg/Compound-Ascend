# Fase 1 — Reestructuración del módulo de Transacciones

Registrar una transacción en < 10 s, con taxonomía jerárquica de 2 niveles,
autocompletado determinista, favoritos de 1 clic, gestión de categorías y UI
premium con tooltips. **Sin motor de IA** (solo arquitectura preparada: `transactions.ai_meta`).

## Datos (migración aditiva, idempotente, NO destructiva)
- `supabase/migrations/20260605000004_transactions_revamp.sql` — extiende
  `expense_categories` (`category_type`, `icon`, `color`, `is_active`,
  `is_favorite`, `merged_into_id`), crea 8 grupos de Nivel 1 (`g_*`), re-parenta
  las categorías legadas (solo `parent_id`, conserva ids → cero re-asignación de
  `transactions`), añade subcategorías CR, crea `transaction_templates` (RLS) y
  `transactions.ai_meta`. Índice único parcial para upsert idempotente por `key`.
- `supabase/migrations/20260601000050_seed.sql` — reescrito sin `DELETE`
  (idempotente, `WHERE NOT EXISTS`).
- `src/lib/supabase/database.types.ts` — nuevas columnas en `ExpenseCategoryRow`,
  `TransactionRow.ai_meta`, nuevo `TransactionTemplateRow` + tabla registrada.

## Backend (services + schemas + actions)
- `services/categories-service.ts` — `listCategories()` retrocompatible (plana,
  incluye inactivas); `listCategoryTree('expense'|'income')` (grupos →
  descendientes aplanados, guard anti-ciclos); `getCategoryPath`; CRUD +
  `mergeCategory(fromId, intoId)` (reasigna transactions/budget_items/expense_items/hijas).
- `services/templates-service.ts` — CRUD de plantillas + `touchTemplate`
  (frecuencia de uso, `use_count`/`last_used_at`).
- `services/suggestion-service.ts` — `buildSuggestionIndex()` determinista
  (historial del usuario + reglas + diccionario semilla CR/LatAm) y
  `matchSuggestion(text, index)`. Sin IA.
- `schemas.ts` — `categoryInputSchema`, `categoryMergeSchema`,
  `categoryDeleteSchema`, `templateInputSchema`.
- `api/v2-actions.ts` — `add/edit/remove/mergeCategoryAction`,
  `add/edit/remove/runTemplateAction` (registro en 1 clic; reutiliza la
  auto-categorización por reglas de `createTransaction`).

## Frontend (components/v2, premium, responsive)
- `transaction-composer.tsx` — UNA pantalla: tipo segmentado (Gasto/Ingreso/
  Transferencia), monto grande con `inputMode="decimal"`, comercio con píldora de
  sugerencia accionable, selector jerárquico (chips de grupo con punto de color →
  subcategorías), cuenta(s), "+ Más detalles", favoritos de 1 clic, y aprendizaje
  de reglas al recategorizar. La hoja del árbol se guarda como `category_id`.
- `composer-button.tsx` — disparador (con `lockKind` opcional para Ingresos/Gastos).
- `category-manager.tsx` — crear, fusionar duplicadas, eliminar (con reasignación),
  favoritos; categorías de sistema protegidas.
- `components/v2/sections.tsx` y `app/(dashboard)/mi-base-financiera/page.tsx` —
  cargan `listCategoryTree`/`buildSuggestionIndex`/`listTemplates` y cablean el
  Composer + CategoryManager.
- `globals.css` — `.cmp-group`/`.cmp-dot`/`.cmp-subs`, `.cmp-sugg`,
  `.cmp-fav-chip` (glassmorphism), tooltips `.tip[data-tip]`.

## Verificación
- `tsc --noEmit`, lint, test (94) y build en verde.
- Migración aplicada a prod y **re-ejecutada sin error** (idempotente). Las 8
  raíces de sistema son los `g_*`; 0 `transactions.category_id` huérfanos.
- Consumidores de `Category` intactos (campos añadidos opcionales); edición de
  transacciones existente sigue por `QuickAddModal`.
