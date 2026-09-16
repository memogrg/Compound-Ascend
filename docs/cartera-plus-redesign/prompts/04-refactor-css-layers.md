# Prompt 0.4 — refactor/css-layers (cero cambio visual)

Requiere la línea base de 0.3 en `qa-snapshots/base/`.

---

Contexto: rama `refactor/css-layers` desde `main`. `src/app/globals.css` tiene 7 614 líneas y 554 clases en un solo archivo, importado por el layout raíz junto con Tailwind v4 (`@import "tailwindcss"` en la línea 1, `@theme inline` cerca de la línea 5916). Ya se pisaron tres veces colisiones con utilidades de Tailwind (`.overline`, `flex-direction` en `.nav`, `font-style` en el logotipo) — ver la sección «Marketing CSS» de CLAUDE.md. Objetivo: partir el archivo por dominio y declarar capas, **sin cambiar ni un píxel**. No agregues, quites ni renombres ninguna clase ni ningún valor en este prompt.

1. Leé `globals.css` completo por secciones (`grep -nE "^/\* ={3,}" src/app/globals.css` da los encabezados: APP SHELL 208, PRIMITIVES 593, AI COACH 875, NAV MÓVIL 1560, RESPONSIVE 1565, MODAL 1774, DASHBOARD 2056, SETUP WIZARD 2581, AUTH 3189, DEUDAS 3800, …, `@theme inline` 5916). Antes de mover nada, listá los bloques con sus rangos de líneas y decime si hay reglas duplicadas (mismo selector definido dos veces con valores distintos) — solo listarlas, no unificarlas.
2. Creá `src/styles/` con estos archivos, moviendo el texto **tal cual** (mismo orden relativo dentro de cada archivo):
   - `tokens.css` — todo lo que hoy está entre la línea 1 y el final del bloque `:root` / tema oscuro (variables), más el `@theme inline` de Tailwind.
   - `base.css` — reset, `html/body`, tipografía base, `.cw` (logotipo) y utilidades globales propias.
   - `shell.css` — APP SHELL, topbar, sidebar, nav inferior móvil, responsive del shell.
   - `primitives.css` — PRIMITIVES, form primitives, botones, chips, badges, toast, modal/sheet, tooltips.
   - `charts.css` — todo lo que hoy estile gráficos (buscá `.chart`, `.spark`, `.donut`, `recharts`, `.skel` de charts).
   - `modules/dashboard.css`, `modules/base.css`, `modules/setup.css`, `modules/auth.css`, `modules/debts.css`, `modules/wealth.css`, `modules/rich-life.css`, `modules/profile.css`, `modules/account.css`, `modules/assistant.css` — cada sección de módulo en su archivo.
   - `globals.css` queda como índice: `@import "tailwindcss"; @import "tw-animate-css";` y luego `@layer tokens, base, shell, primitives, charts, modules;` seguido de `@import "../styles/tokens.css" layer(tokens);` etc. en ese orden. Verificá en la documentación de Tailwind v4 / CSS `@import … layer()` que el orden de capas resultante conserva la precedencia actual: hoy todo está en la capa anónima (sin `@layer`) y por lo tanto **gana a cualquier `@layer` de Tailwind**; al meter nuestras reglas en capas nombradas, las utilidades de Tailwind (`@layer utilities`) podrían empezar a ganar. Si eso pasa, la solución es declarar nuestras capas DESPUÉS de las de Tailwind en el `@layer` statement (Tailwind v4 usa `theme, base, components, utilities`): `@layer theme, base, components, utilities, ca-tokens, ca-base, ca-shell, ca-primitives, ca-charts, ca-modules;`. Probalo y explicame cuál orden usaste y por qué.
3. Auditá nombres contra utilidades de Tailwind: `grep -oE "^\.(block|hidden|italic|underline|overline|truncate|uppercase|container|border|shadow|ring|transition|filter|blur|invert|grid|flex|table|static|fixed|absolute|relative|sticky|visible|invisible|flow-root|contents|isolate|resize|collapse)\b" src/styles -r` — listá las coincidencias. No las renombres en este prompt; van a un `fix/` aparte.
4. `npm run build` (con `next build`, no `dev`) y `npm run start -- -p 3001`; corré `npm run qa:snap -- --out qa-snapshots/css-layers` y `npm run qa:diff -- --a qa-snapshots/base --b qa-snapshots/css-layers`. El resultado esperado es **0 píxeles de diferencia en todas las imágenes**. Si hay diferencias, mostrámelas por ruta y no las «corrijas» ajustando valores: buscá qué regla cambió de precedencia por la capa y arreglá la capa/orden, no la regla.
5. `npm run typecheck && npm run lint && npm run format:check`. Stageá `src/app/globals.css`, `src/styles/**` y proponé el commit `refactor(css): globals.css partido por dominio en capas, sin cambio visual (diff 0 px en 23 rutas × 3 anchos × 2 temas)` sin ejecutarlo.

Prohibido: cambiar valores, renombrar clases, borrar reglas «muertas» (eso es otro PR con evidencia), tocar `(mobile)/m/mobile.css`.
