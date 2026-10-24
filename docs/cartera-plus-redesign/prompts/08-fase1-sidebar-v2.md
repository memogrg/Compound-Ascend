# Prompt 1.2 — feat/redesign-1-sidebar-v2 (sidebar de 5 núcleos detrás de la bandera)

---

Fase 1 · delta 2 — `feat/sidebar-v2`. Rama `feat/redesign-1-sidebar-v2` desde `main`. Solo UI, detrás de `navV2Enabled()`: **con la bandera apagada la app debe ser idéntica píxel a píxel**.

Referencias: `docs/cartera-plus-redesign/03-navigation.md` (sidebar web) y `prototipos/01-shell.html` (opción B = `navB()` + `rail()`; del C solo el colapso a iconos). Modelo: `src/lib/constants/nav-v2.ts`.

Antes de escribir: verificá que no existan `src/components/layout/sidebar-v2.tsx`, `src/styles/shell-nav-v2.css` ni `tests/unit/sidebar-v2.test.tsx`; mostrame si el repo tiene `@testing-library/react` (para decidir el test de render). No instales nada.

1. Iconos: agregá a `src/components/ui/icon.tsx` cinco `IconName` nuevos, copiando los paths SVG del `ICON` del prototipo: `home` (Hoy), `flow` (Flujo), `flag` (Planes), `pillar` (Patrimonio), `iso` (isotipo C+ para Asesor). Mismo formato/stroke que los 34 existentes. Actualizá `nav-v2.ts` para usarlos y quitá el comentario de "iconos faltantes".

2. `src/components/layout/sidebar-v2.tsx` (`"use client"`), props: `{ open, onNavigate, user, collapsed, onToggleCollapsed, badges?: Partial<Record<"acciones"|"porRevisar"|"metasRiesgo", number>>, journey?: { etapa: number; total: number; titulo: string; siguiente: string } }`.
   - Marca arriba igual que hoy (`BrandMark` + `brand-name`/`brand-sub`).
   - 5 ítems planos desde `NUCLEOS`: icono + nombre + contador (`badges[badgeKey]`, oculto si 0/undefined). Activo = `nucleoDeRuta(pathname, search)`.
   - Debajo del ítem activo, sus pestañas con status `"existente"` (y las `"futura"` con `hrefM` pero sin `href` NO se muestran) como `.sb2-item.sub`, activa = `pestanaDeRuta`. Las pestañas con `#` navegan igual (son enlaces normales).
   - Riel «Tu camino» al pie solo si `journey` viene definido (segmentos etapa/total, título, siguiente). Sin datos, no se renderiza nada.
   - Pie: fila de usuario + `SignOutButton` (los mismos componentes de hoy) + enlace engrane a `CONFIGURACION[1].href` (Cuenta y plan) con `aria-label`.
   - Botón de colapso (chevron) con `aria-label` "Contraer menú"/"Expandir menú" y `aria-expanded`. Colapsado: solo iconos, nombre en `title` y en un `span` sr-only del design system (si no existe una clase `sr-only` fuera de `auth.css`, creá `.sb2-sr-only` en el CSS nuevo), pestañas y riel ocultos, contador como punto.
   - Drawer móvil: respetá `open`/`onNavigate` y el scrim exactamente como el `Sidebar` actual.

3. `src/components/layout/app-shell.tsx`: import de `navV2Enabled`; estado `collapsed` con lectura de `localStorage` `"ca.sidebar.collapsed"` en `useEffect` (render inicial expandido; anotá el posible parpadeo como conocido) y escritura al cambiar; si `navV2Enabled()` → `<SidebarV2 …>` y clase `"sb2-collapsed"` en `.app` cuando corresponda; si no → `<Sidebar …>` intacto. `badges` y `journey` NO se cablean en este delta (undefined).

4. `src/styles/shell-nav-v2.css` importado en `globals.css` con `layer(ca)`, todo con prefijo `sb2-` (regla del proyecto: sin colisiones con Tailwind ni con el shell viejo). Tokens existentes (`--accent`, `--accent-soft`, `--chip`, `--border`, `--muted`, `--r-btn`, `--r-pill`, `--dur-micro`). `.app.sb2-collapsed { --sidebar-w: 64px }` y transición de anchura con `--dur-std` respetando `prefers-reduced-motion`. Nada se toca en `shell.css`.

5. Tests: `tests/unit/sidebar-v2.test.tsx` si hay `@testing-library/react` (mock de `next/navigation`: `usePathname`/`useSearchParams`): 5 ítems en orden, activo correcto en `/gastos` (Flujo + pestaña Gastos y sobres), pestañas solo del núcleo activo, colapsado oculta textos y mantiene aria, sin `journey` no hay riel. Si no hay RTL, un test puro de la función que arma los ítems (extraela) y lo anotás.

6. Verificación:
   a) Cadena: `npm run typecheck && npm run lint` (30539/5960) `&& npm run format:check && npx vitest run tests/unit/ && npm run build`.
   b) Bandera APAGADA (build normal): `QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start` + `qa:snap --out qa-snapshots/sb2-off` + `qa:diff` contra `qa-snapshots/base` → exit 0, 0 px (solo el borde conocido de `ingresos@390`).
   c) Bandera ENCENDIDA: `NEXT_PUBLIC_NAV_V2=1 npm run build`; servidor congelado; `qa:snap --out qa-snapshots/nav-v2` (esta es la base del menú nuevo: documentala en `qa/base-actual.md` como "base-nav-v2", mismo instante). `test:a11y` con la bandera → 0 critical y ninguna regla nueva respecto a las 3 de la línea base; reportá los conteos.
   d) Consola: `/dashboard`, `/gastos`, `/deudas` con bandera ON sin `pageerror`/`console.error`/#418-#425 (el colapso se lee en efecto, así que no debe haber mismatch).
   e) Capturas de revisión para Memo (bandera ON, 1280, light y dark): `/dashboard` expandido, `/dashboard` colapsado, `/gastos` expandido, `/deudas` expandido → `qa-snapshots/nav-v2-review/*.png`; listá las rutas de archivo.
   f) Puerto 3001 libre al terminar.

7. Docs: prompt guardado como `prompts/08-fase1-sidebar-v2.md`; `12-progress.md` "delta 2 sidebar-v2: en revisión". `git status` + `git diff --stat` y esperá mi ok para commitear como:
   `feat(nav): sidebar v2 de 5 núcleos detrás de NAV_V2 (pestañas del núcleo, colapsable, riel y contadores por props)`

---

## Lo que se hizo, y prevalece

**No hay `@testing-library/react`, ni jsdom ni happy-dom**, y vitest corre en `environment: "node"`. Como el prompt prohíbe instalar, se aplicó la alternativa que él mismo prevé: la decisión de qué se pinta salió del JSX a `src/components/layout/sidebar-v2-items.ts` (`itemsDeSidebar(pathname, search, badges)`), y el test es puro — `tests/unit/sidebar-v2.test.ts`, no `.tsx`. Lo que queda sin cubrir (clases, `aria-*`, el botón de colapso) se verifica en las capturas y en axe con la bandera encendida.

**El aside lleva `.sidebar` además de `.sb2`.** El drawer móvil (`position: fixed` + `transform` + `.open`), el scrim y el `sticky` de escritorio ya viven en `shell.css`/`responsive.css`. Redefinirlos con prefijo `sb2-` sería mantener dos copias del mismo comportamiento y arriesgarse a que se separen; reusar la clase es literalmente lo que pide «el scrim exactamente como el `Sidebar` actual». Solo lo nuevo —ítems, pestañas, riel, colapso— lleva prefijo propio. `shell.css` no se tocó.

**El isotipo del prototipo viene en un viewBox de 64 y `Icon` fija 24.** Las coordenadas van multiplicadas por 24/64 (0.375), incluidos los dos `stroke-width` que el original declara por trazo (7 y 4.6) y que aquí se repiten en cada `path`, porque el `<svg>` padre solo admite uno. El "+" usa `var(--accent)` y no el `#378451` literal del prototipo: es el mismo verde, pero como token voltea con el tema, igual que en `BrandMark`.

**La clase `sb2-collapsed` va en dos sitios y no es duplicación.** En `.app` porque quien tiene la columna del grid es el contenedor (`--sidebar-w` se redefine ahí), y en el propio `<aside>` porque las reglas que ocultan textos necesitan un ancestro que las lleve. Son dos responsabilidades distintas sobre el mismo estado.

**El parpadeo del colapso es conocido y está anotado en el código.** El render inicial es siempre expandido y la preferencia se aplica en un `useEffect`: leer `localStorage` durante el render daría HTML distinto en servidor y cliente (#418). Quien lo dejó colapsado ve el sidebar nacer ancho y encogerse tras la hidratación. Se quita cuando la preferencia viaje en una cookie, que el servidor sí puede leer.

**`.sb2-sr-only` es propia, no la `.sr-only` de `modules/auth.css`.** Esa pertenece a las pantallas de auth y el shell no debería depender de un módulo ajeno; cuando el design system tenga la suya, la local se borra. Además solo se aplica colapsado: expandido el nombre ya está en `.sb2-label` y leerlo dos veces sobra.

**El contador colapsado se degrada a punto sin desmontarse.** Mismo elemento, `font-size: 0` y forma de círculo, para que su `aria-label` («3 pendientes») se siga leyendo igual en los dos estados.

**El `shell-nav-v2.css` se importa DESPUÉS de `responsive.css`**, no junto a `shell.css`: tiene media queries propias (oculta el botón de colapso bajo 1024 px, donde el aside es un drawer y encogerlo a 64 px no tiene sentido) y su orden debe ganar al del shell viejo.
