# Prompt 1.1 — feat/redesign-1-nav-model (modelo único de navegación v2)

---

Fase 1 · delta 1 — `feat/nav-model`. Rama `feat/redesign-1-nav-model` desde `main`. Este delta **NO toca ninguna UI**: crea el modelo, la bandera y los tests. `sidebar.tsx`, `bottom-nav.tsx` y `mobile-menu.tsx` quedan intactos.

Antes de escribir: verificá que no existan `src/lib/constants/nav-v2.ts`, `src/lib/flags.ts` ni `tests/unit/nav-v2.test.ts`. Mostrame la lista de `IconName` disponibles en `src/components/ui/icon` (solo nombres).

1. `src/lib/constants/nav-v2.ts` — modelo único web + `/m`, en español, tipado:

   ```ts
   type Pestana = { id; name; href; hrefM?: string | null; status: "existente" | "nueva" | "futura"; nota?: string }
   type Nucleo  = { id; name; icon: IconName; href; hrefM; badgeKey?: "acciones" | "porRevisar" | "metasRiesgo"; tabs: Pestana[] }
   ```

   `export const NUCLEOS: readonly Nucleo[]` (exactamente 5, en este orden):

   - **hoy** · «Hoy» · href `/dashboard` · hrefM `/m` · badgeKey `acciones` · tabs: panel (`/dashboard` · `/m`), acciones (`/mis-acciones` · `/m/mis-acciones`), progreso (`/mis-acciones?tab=progreso` · `/m/mis-acciones?tab=progreso`)
   - **flujo** · «Flujo» · `/mi-base-financiera` · `/m/mi-base-financiera` · badgeKey `porRevisar` · tabs: resumen (`/mi-base-financiera` · `/m/mi-base-financiera`), ingresos (`/ingresos` · `/m/ingresos`), gastos «Gastos y sobres» (`/gastos` · `/m/gastos`), transacciones (`/transacciones` · `/m/transacciones`), recurrentes (status `"nueva"`, href `null` hasta fase 4, nota "cobros y pagos recurrentes")
   - **planes** · «Planes» · `/control-financiero` · `/m/metas` · badgeKey `metasRiesgo` · tabs: metas (`/control-financiero` · `/m/metas`), deudas (`/deudas` · `/m/deudas`), fondos (`/patrimonio/proteccion#fondos` · `/m/proteccion#fondos`, nota "fondo de emergencia y de paz")
   - **patrimonio** · «Patrimonio» · `/mi-rich-life` · `/m/patrimonio` · tabs: resumen (`/mi-rich-life` · `/m/patrimonio`), inversiones (`/patrimonio` · `/m/inversiones`, nota "ruta futura /patrimonio/inversiones"), proteccion (`/patrimonio/proteccion` · `/m/proteccion`), libertad (status `"futura"` en web: hoy dentro de `/mi-rich-life`; hrefM `/m/libertad`), indicadores (`/patrimonio/indicadores` · `/m/indicadores`)
   - **asesor** · «Asesor» · `/asistente` · `/m/asistente` · tabs: chat (`/asistente` · `/m/asistente`)

   `export const CONFIGURACION: readonly Pestana[]` (pie, fuera de los núcleos): perfil financiero (`/mi-perfil-financiero` · `/m/mi-perfil-financiero`), cuenta y plan (`/configuracion` · `/m/perfil`), asistentes de configuración (`/configurar` · `/m/configurar`), suscripción (`/suscripcion` · hrefM `null`).

   `export const BOTTOM_NAV_V2 = NUCLEOS` (los 5, derivados, no duplicados).

   Iconos: usá los `IconName` que ya existan y que mejor correspondan (casa, flechas, bandera, columna/edificio, isotipo C+); si alguno no existe, elegí el más cercano y anotá en el comentario cuál falta para el delta sidebar-v2.

   Helpers puros exportados (sin React, sin `server-only`): `nucleoDeRuta(pathname, search?)` → `Nucleo | null`; `pestanaDeRuta(pathname, search?)` → `{ nucleo, pestana } | null` (match más largo primero; `/mis-acciones?tab=progreso` resuelve a progreso; `/patrimonio/proteccion` no debe resolver a `/patrimonio`); `breadcrumb(pathname, search?)` → `string[]` (`["Flujo","Gastos y sobres"]`); `aMovil(href)` y `aWeb(hrefM)` usando la tabla del modelo (`null` si no hay par); `rutasDelModelo()` → lista plana de todos los `href`/`hrefM` no nulos.

2. `src/lib/flags.ts`: `export function navV2Enabled(): boolean` → `process.env.NEXT_PUBLIC_NAV_V2 === "1"`. Comentario: "bandera de la fase 1; se consume a partir de sidebar-v2; en producción sigue apagada". Agregar `NEXT_PUBLIC_NAV_V2=` (vacío) a `.env.example` con una línea de comentario. No tocar `.env.local` ni nada ignorado.

3. `tests/unit/nav-v2.test.ts`:
   - 5 núcleos en el orden Hoy/Flujo/Planes/Patrimonio/Asesor; ids únicos entre núcleos y pestañas.
   - Rutas alcanzables: para cada `href` (status existente) existe un `page.tsx` bajo `src/app/(dashboard)/…` (o la carpeta que corresponda; resolvé `(grupo)` y query/hash ignorados); para cada `hrefM` existe `page.tsx` bajo `src/app/(mobile)/m/…`. Listá en el fallo la ruta que no exista.
   - Cobertura: toda entrada de `NAV` (v1) y de `MENU` del móvil (importá o copiá sus hrefs; si `MENU` no se exporta, leé el archivo y extraé los `href` con regex) está representada en nav-v2 (núcleos + configuración), salvo una lista explícita de exclusiones justificadas (p. ej. `/m/perfil-financiero` si es alias). Así nada queda huérfano al cambiar el menú.
   - `pestanaDeRuta`: los 6 casos del punto 1 (incluido el de prefijo `/patrimonio` vs `/patrimonio/proteccion`) y `?tab=progreso`.
   - `aMovil`/`aWeb`: ida y vuelta para todas las pestañas con par; `null` donde no hay par.
   - `navV2Enabled`: false por defecto, true con `NEXT_PUBLIC_NAV_V2="1"` (`vi.stubEnv`).

4. Docs: guardá este prompt como `docs/cartera-plus-redesign/prompts/07-fase1-nav-model.md` (mismo formato que los 01–06) y agregá en `12-progress.md` la línea "Fase 1 · delta 1 nav-model: en curso".

5. Verificación en la rama tras el último archivo: `npm run typecheck && npm run lint` (30539/5960) `&& npm run format:check && npx vitest run tests/unit/ && npm run build`. No hace falta captura visual: ningún archivo de UI cambia (decilo así en el reporte y confirmalo con `git diff --stat`: nada bajo `src/components` ni `src/app` salvo `.env.example` si aplica).

6. `git status` + `git diff --stat` + el contenido completo de `nav-v2.ts`, y esperá mi ok para commitear como:
   `feat(nav): modelo único de navegación v2 (5 núcleos, pestañas, par web/móvil) y bandera NAV_V2`

---

## Lo que se hizo, y prevalece

**Los iconos pedidos no existen — ninguno de los cinco.** `IconName` tiene 34 nombres y no hay casa, flechas de flujo, bandera, columna/edificio ni isotipo C+. Se tomó el más cercano de los existentes y quedó anotado en el propio fichero para el delta sidebar-v2: `dashboard` (hoy), `txn` (flujo), `savings` (planes), `networth` (patrimonio), `spark` (asesor).

**`fondos` es un ancla, no una pantalla, y eso cambió `pestanaDeRuta`.** Su `href` es `/patrimonio/proteccion#fondos`, que comparte pathname con la pestaña `proteccion`. Como `usePathname()` no devuelve el hash, las dos competían por la misma ruta y ganaba `fondos` por ser la cadena más larga. La regla implementada: **una pestaña cuyo `href` lleva `#` no participa en la resolución por ruta**. Sigue siendo un destino válido del menú y `aMovil("/patrimonio/proteccion#fondos")` → `/m/proteccion#fondos` funciona; simplemente nunca es el estado activo. Sin esta regla, entrar a Protección marcaba Fondos.

**El desempate por `?tab=` es explícito, no un efecto de la ordenación.** `/mis-acciones` y `/mis-acciones?tab=progreso` comparten pathname: primero se busca la pestaña cuyo `?tab=` coincide con el de la URL y, si no hay, la pestaña "desnuda" (sin query). Ordenar por longitud no basta — dejaría `progreso` ganando siempre.

**La lista de exclusiones del test de cobertura quedó vacía**, y es un resultado, no un descuido: las 15 entradas del `MENU` móvil y las 14 de `NAV`/`BOTTOM_NAV` tienen sitio en la v2. `/m/perfil-financiero` (el posible alias) **no está en `MENU`**, así que no hacía falta excluirlo.

**Control negativo en el test de rutas.** Un `tienePagina()` que devolviera siempre `true` dejaría pasar los tres tests de existencia sin comprobar nada, así que hay un test que exige que sepa decir que no. Apareció por eso mismo un bug real del helper: `/m` vive en `(mobile)/m/(app)/page.tsx`, y el `replace(/^m\//)` no convertía `"m"` en `""` — la raíz del móvil se reportaba como inexistente.

`MENU` sigue siendo un `const` privado de `mobile-menu.tsx`, así que el test lo parsea del fuente, como preveía el prompt.

**La cadena de verificación no incluía `format:check`, y el PR salió en rojo.** El job de CI corre `npm run format:check` (`prettier --check "src/**"`) además de lint, typecheck, tests y build; `nav-v2.ts` no cumplía el formato. Se arregló con `npx prettier --write` acotado a los dos archivos propios —nunca `npm run format`, que reformatea `src/**` entero— y se comprobó que el cambio fuera de formato puro con `prettier --stdin-filepath` sobre la versión de HEAD. Dos comprobaciones más obvias dan falso positivo y no sirven: comparar ignorando espacios falla porque `trailingComma: "all"` añade comas al expandir, y formatear una copia fuera del repo usa el ancho por defecto (80) porque no hereda el `.prettierrc`. La cadena del `00-README.md` pasó a ser la del CI, no un subconjunto.
