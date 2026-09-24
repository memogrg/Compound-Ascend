# Línea base de accesibilidad

Inventario, no puerta: **este informe no corrige nada y el spec no falla**. Mide el estado
actual para que cada pantalla que se rediseñe pueda compararse contra él.

Las dos superficies van **separadas**: la web (`/dashboard`, `/gastos`…) y la app móvil
(`/m/*`). Son dos apps con su propio shell y su propia hoja de estilos, y un total común
no le serviría a ninguna para compararse consigo misma con el tiempo.

- **SHA**: `86e95ed980127c57331216ae7487dfeccbb10632`
- **Instante congelado**: `(sin QA_FREEZE)`
- **Motor**: axe-core 4.13.0
- **Reglas**: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
- **Combinaciones**: 62 · web 46 · `/m` 15 · tema claro

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

El conteo es por **nodos** afectados, no por reglas: una sola regla puede afectar decenas de
elementos, y eso es lo que hay que arreglar.

## Web

Anchos 1280 y 390.

### Totales

| Impacto | Nodos |
| --- | --- |
| critical | 0 |
| serious | 308 |
| moderate | 0 |
| minor | 0 |
| **total** | **308** |

### Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | 294 | 22 | `a[data-nav="assistant"] > span:nth-child(2)` |
| `aria-hidden-focus` | serious | 14 | 5 | `div[role="img"] > div[aria-hidden="true"]` |

- **`color-contrast`** — Elements must meet minimum color contrast ratio thresholds
- **`aria-hidden-focus`** — ARIA hidden element must not be focusable or contain focusable elements

### Por ruta y ancho

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
| `/transacciones` | 1280 | 0 | 3 | 0 | 0 | **3** |
| `/transacciones` | 390 | 0 | 2 | 0 | 0 | **2** |

## Superficie `/m` (app móvil)

Solo a 390: `/m` es un shell de teléfono con el viewport bloqueado, y a 1280 se vería una pantalla que en un dispositivo real no existe.

### Totales

| Impacto | Nodos |
| --- | --- |
| critical | 0 |
| serious | 89 |
| moderate | 15 |
| minor | 0 |
| **total** | **104** |

### Las 5 reglas más frecuentes

| Regla | Impacto | Nodos | Rutas | Ejemplo de selector |
| --- | --- | --- | --- | --- |
| `color-contrast` | serious | 57 | 10 | `a[href$="presupuesto"] > .setup-hub-item-top > .ok.setup-hub` |
| `aria-hidden-focus` | serious | 32 | 6 | `div:nth-child(1) > .m-swipe > .m-swipe-actions[aria-hidden="` |
| `meta-viewport` | moderate | 15 | 15 | `meta[name="viewport"]` |

- **`color-contrast`** — Elements must meet minimum color contrast ratio thresholds
- **`aria-hidden-focus`** — ARIA hidden element must not be focusable or contain focusable elements
- **`meta-viewport`** — Zooming and scaling must not be disabled

### Por ruta y ancho

| Ruta | Ancho | critical | serious | moderate | minor | total |
| --- | --- | --- | --- | --- | --- | --- |
| `/m` | 390 | 0 | 10 | 1 | 0 | **11** |
| `/m/configurar` | 390 | 0 | 0 | 1 | 0 | **1** |
| `/m/deudas` | 390 | 0 | 4 | 1 | 0 | **5** |
| `/m/gastos` | 390 | 0 | 23 | 1 | 0 | **24** |
| `/m/indicadores` | 390 | 0 | 0 | 1 | 0 | **1** |
| `/m/ingresos` | 390 | 0 | 3 | 1 | 0 | **4** |
| `/m/inversiones` | 390 | 0 | 0 | 1 | 0 | **1** |
| `/m/metas` | 390 | 0 | 2 | 1 | 0 | **3** |
| `/m/mi-base-financiera` | 390 | 0 | 3 | 1 | 0 | **4** |
| `/m/mi-perfil-financiero` | 390 | 0 | 7 | 1 | 0 | **8** |
| `/m/mis-acciones` | 390 | 0 | 6 | 1 | 0 | **7** |
| `/m/patrimonio` | 390 | 0 | 3 | 1 | 0 | **4** |
| `/m/perfil` | 390 | 0 | 1 | 1 | 0 | **2** |
| `/m/proteccion` | 390 | 0 | 6 | 1 | 0 | **7** |
| `/m/transacciones` | 390 | 0 | 21 | 1 | 0 | **22** |

Los JSON crudos de cada corrida (con el detalle de cada nodo) quedan en `qa-snapshots/a11y/`,
fuera de git.
