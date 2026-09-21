# Línea base de accesibilidad

Inventario, no puerta: **este informe no corrige nada y el spec no falla**. Mide el estado
actual para que cada pantalla que se rediseñe pueda compararse contra él.

**Actualizada tras `fix(a11y)`.** La corrida anterior daba **392 nodos** (2 `critical`, 390
`serious`); esta da **352** (0 `critical`). La diferencia son las dos reglas atacadas:
`aria-prohibited-attr` (38 nodos, el isotipo en 19 rutas) y `select-name` (2 nodos, el
selector de meses del fondo de paz) — ambas desaparecen enteras.

El alcance NO cambió: siguen siendo las mismas 23 rutas del shell **web**, a 1280 y 390, en
tema claro. El shell móvil (`/m`) sigue fuera de la auditoría, así que los arreglos que se
hicieron ahí —el `<select>` gemelo y la campana— no se reflejan en estas cifras.

- **SHA**: `2baab68c` + cambios de `fix(a11y)` (medido antes del commit)
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
| critical | 0 |
| serious | 352 |
| moderate | 0 |
| minor | 0 |
| **total** | **352** |

## Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | 294 | 22 | `a[data-nav="assistant"] > span:nth-child(2)` |
| `nested-interactive` | serious | 44 | 1 | `div:nth-child(3) > .list-row[role="button"]` |
| `aria-hidden-focus` | serious | 14 | 5 | `div[role="img"] > div[aria-hidden="true"]` |

- **`color-contrast`** — Elements must meet minimum color contrast ratio thresholds
- **`nested-interactive`** — Interactive controls must not be nested
- **`aria-hidden-focus`** — ARIA hidden element must not be focusable or contain focusable elements

## Por ruta y ancho

Conteo por **nodos** afectados, no por reglas: una sola regla puede afectar decenas de
elementos, y eso es lo que hay que arreglar.

| Ruta | Ancho | critical | serious | moderate | minor | total |
| --- | --- | --- | --- | --- | --- | --- |
| `/asistente` | 1280 | 0 | 1 | 0 | 0 | **1** |
| `/asistente` | 390 | 0 | 1 | 0 | 0 | **1** |
| `/configuracion` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/configuracion` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/configurar` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/configurar` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/control-financiero` | 1280 | 0 | 5 | 0 | 0 | **5** |
| `/control-financiero` | 390 | 0 | 5 | 0 | 0 | **5** |
| `/dashboard` | 1280 | 0 | 8 | 0 | 0 | **8** |
| `/dashboard` | 390 | 0 | 8 | 0 | 0 | **8** |
| `/deudas` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/deudas` | 390 | 0 | 5 | 0 | 0 | **5** |
| `/empezar` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/empezar` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/faqs` | 1280 | 0 | 2 | 0 | 0 | **2** |
| `/faqs` | 390 | 0 | 1 | 0 | 0 | **1** |
| `/gastos` | 1280 | 0 | 3 | 0 | 0 | **3** |
| `/gastos` | 390 | 0 | 2 | 0 | 0 | **2** |
| `/` | 1280 | 0 | 30 | 0 | 0 | **30** |
| `/` | 390 | 0 | 29 | 0 | 0 | **29** |
| `/ingresos` | 1280 | 0 | 9 | 0 | 0 | **9** |
| `/ingresos` | 390 | 0 | 8 | 0 | 0 | **8** |
| `/login` | 1280 | 0 | 0 | 0 | 0 | **0** |
| `/login` | 390 | 0 | 0 | 0 | 0 | **0** |
| `/mi-base-financiera` | 1280 | 0 | 23 | 0 | 0 | **23** |
| `/mi-base-financiera` | 390 | 0 | 22 | 0 | 0 | **22** |
| `/mi-perfil-financiero` | 1280 | 0 | 4 | 0 | 0 | **4** |
| `/mi-perfil-financiero` | 390 | 0 | 3 | 0 | 0 | **3** |
| `/mi-rich-life` | 1280 | 0 | 5 | 0 | 0 | **5** |
| `/mi-rich-life` | 390 | 0 | 4 | 0 | 0 | **4** |
| `/mis-acciones` | 1280 | 0 | 12 | 0 | 0 | **12** |
| `/mis-acciones` | 390 | 0 | 11 | 0 | 0 | **11** |
| `/mis-acciones?tab=decisiones` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/mis-acciones?tab=decisiones` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/mis-acciones?tab=progreso` | 1280 | 0 | 7 | 0 | 0 | **7** |
| `/mis-acciones?tab=progreso` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/patrimonio` | 1280 | 0 | 4 | 0 | 0 | **4** |
| `/patrimonio` | 390 | 0 | 3 | 0 | 0 | **3** |
| `/patrimonio/indicadores` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/patrimonio/indicadores` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/patrimonio/proteccion` | 1280 | 0 | 6 | 0 | 0 | **6** |
| `/patrimonio/proteccion` | 390 | 0 | 6 | 0 | 0 | **6** |
| `/suscripcion` | 1280 | 0 | 1 | 0 | 0 | **1** |
| `/suscripcion` | 390 | 0 | 0 | 0 | 0 | **0** |
| `/transacciones` | 1280 | 0 | 25 | 0 | 0 | **25** |
| `/transacciones` | 390 | 0 | 24 | 0 | 0 | **24** |

Los JSON crudos de cada corrida (con el detalle de cada nodo) quedan en `qa-snapshots/a11y/`,
fuera de git.
