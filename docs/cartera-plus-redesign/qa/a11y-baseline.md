# Línea base de accesibilidad

Inventario, no puerta: **este informe no corrige nada y el spec no falla**. Mide el estado
actual para que cada pantalla que se rediseñe pueda compararse contra él.

Alcance: tema light, anchos 1280 y 390, WCAG 2.0/2.1 A y AA. Pendiente: medición en tema dark.
Sin correcciones en este commit: es la medición de partida.

- **SHA**: `1f4811003338416416d8251aec431c712c54d352`
- **Instante congelado**: `2026-09-18T18:00:00Z`
- **Motor**: axe-core 4.13.0
- **Reglas**: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
- **Anchos**: 1280 y 390 · tema claro · 46 combinaciones

Regenerar:

```bash
# Terminal A
QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
# Terminal B
E2E_EMAIL=… E2E_PASSWORD=… npm run test:a11y
node scripts/qa/a11y-report.mjs
```

El servidor va congelado a propósito: sin eso, una fecha o un precio distinto cambia el DOM
y con él el conteo de nodos, y el inventario deja de ser comparable entre días.

## Totales

| Impacto | Nodos |
| --- | --- |
| critical | 2 |
| serious | 390 |
| moderate | 0 |
| minor | 0 |
| **total** | **392** |

## Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | 294 | 22 | `a[data-nav="assistant"] > span:nth-child(2)` |
| `nested-interactive` | serious | 44 | 1 | `div:nth-child(3) > .list-row[role="button"]` |
| `aria-prohibited-attr` | serious | 38 | 19 | `.brand-mark` |
| `aria-hidden-focus` | serious | 14 | 5 | `div[role="img"] > div[aria-hidden="true"]` |
| `select-name` | critical | 2 | 1 | `.card-pad.card:nth-child(5) > div > select` |

- **`color-contrast`** — Elements must meet minimum color contrast ratio thresholds
- **`nested-interactive`** — Interactive controls must not be nested
- **`aria-prohibited-attr`** — Elements must only use permitted ARIA attributes
- **`aria-hidden-focus`** — ARIA hidden element must not be focusable or contain focusable elements
- **`select-name`** — Select element must have an accessible name

## Por ruta y ancho

Conteo por **nodos** afectados, no por reglas: una sola regla puede afectar decenas de
elementos, y eso es lo que hay que arreglar.

| Ruta | Ancho | critical | serious | moderate | minor | total |
| --- | --- | --- | --- | --- | --- | --- |
| `/asistente` | 1280 | 0 | 2 | 0 | 0 | **2** |
| `/asistente` | 390 | 0 | 2 | 0 | 0 | **2** |
| `/configuracion` | 1280 | 0 | 8 | 0 | 0 | **8** |
| `/configuracion` | 390 | 0 | 7 | 0 | 0 | **7** |
| `/configurar` | 1280 | 0 | 8 | 0 | 0 | **8** |
| `/configurar` | 390 | 0 | 7 | 0 | 0 | **7** |
| `/control-financiero` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/control-financiero` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/dashboard` | 1280 | 0 | 9 | 0 | 0 | **9** |
| `/dashboard` | 390 | 0 | 9 | 0 | 0 | **9** |
| `/deudas` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/deudas` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/empezar` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/empezar` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/faqs` | 1280 | 0 | 2 | 0 | 0 | **2** |
| `/faqs` | 390 | 0 | 1 | 0 | 0 | **1** |
| `/gastos` | 1280 | 0 | 4 | 0 | 0 | **4** |
| `/gastos` | 390 | 0 | 3 | 0 | 0 | **3** |
| `/` | 1280 | 0 | 30 | 0 | 0 | **30** |
| `/` | 390 | 0 | 29 | 0 | 0 | **29** |
| `/ingresos` | 1280 | 0 | 10 | 0 | 0 | **10** |
| `/ingresos` | 390 | 0 | 9 | 0 | 0 | **9** |
| `/login` | 1280 | 0 | 0 | 0 | 0 | **0** |
| `/login` | 390 | 0 | 0 | 0 | 0 | **0** |
| `/mi-base-financiera` | 1280 | 0 | 24 | 0 | 0 | **24** |
| `/mi-base-financiera` | 390 | 0 | 23 | 0 | 0 | **23** |
| `/mi-perfil-financiero` | 1280 | 0 | 5 | 0 | 0 | **5** |
| `/mi-perfil-financiero` | 390 | 0 | 4 | 0 | 0 | **4** |
| `/mi-rich-life` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/mi-rich-life` | 390 | 0 | 5 | 0 | 0 | **5** |
| `/mis-acciones` | 1280 | 0 | 13 | 0 | 0 | **13** |
| `/mis-acciones` | 390 | 0 | 12 | 0 | 0 | **12** |
| `/mis-acciones?tab=decisiones` | 1280 | 0 | 8 | 0 | 0 | **8** |
| `/mis-acciones?tab=decisiones` | 390 | 0 | 7 | 0 | 0 | **7** |
| `/mis-acciones?tab=progreso` | 1280 | 0 | 8 | 0 | 0 | **8** |
| `/mis-acciones?tab=progreso` | 390 | 0 | 7 | 0 | 0 | **7** |
| `/patrimonio` | 1280 | 0 | 5 | 0 | 0 | **5** |
| `/patrimonio` | 390 | 0 | 4 | 0 | 0 | **4** |
| `/patrimonio/indicadores` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/patrimonio/indicadores` | 390 | 0 | 7 | 0 | 0 | **7** |
| `/patrimonio/proteccion` | 1280 | 1 | 7 | 0 | 0 | **8** |
| `/patrimonio/proteccion` | 390 | 1 | 7 | 0 | 0 | **8** |
| `/suscripcion` | 1280 | 0 | 2 | 0 | 0 | **2** |
| `/suscripcion` | 390 | 0 | 1 | 0 | 0 | **1** |
| `/transacciones` | 1280 | 0 | 26 | 0 | 0 | **26** |
| `/transacciones` | 390 | 0 | 25 | 0 | 0 | **25** |

Los JSON crudos de cada corrida (con el detalle de cada nodo) quedan en `qa-snapshots/a11y/`,
fuera de git.
