# Prompt 0.6 — chore/nuqs-axe (filtros en URL y auditoría a11y automática)

---

Contexto: rama `chore/nuqs-axe` desde `main`. Dos dependencias aprobadas para la fase de fundamentos. Antes de instalar, verificá versión y licencia con `npm view <pkg> version license peerDependencies` y pegame el resultado.

1. `nuqs` (última 2.x, MIT). Instalá con `npm i nuqs`. Montá `NuqsAdapter` desde `nuqs/adapters/next/app` en el layout raíz (`src/app/layout.tsx`) envolviendo a los `children`, sin tocar nada más del layout. Creá `src/lib/url-state/period.ts` con un parser compartido `periodParser` (`parseAsString` con validación `YYYY-MM` o `YYYY-MM..YYYY-MM`, default el mes actual del usuario según `userCurrentPeriod()` de `src/lib/time/user-time.ts`) y `comparisonParser` (`'prev' | 'yoy' | 'budget' | 'avg3'`, default `'prev'`). Exportá también `createSearchParamsCache` con ambos para uso en RSC. No conectes ninguna pantalla todavía: solo la infraestructura + `tests/unit/url-state.test.ts` con 6 casos (válido mes, válido rango, inválido → default, etc.).
2. `@axe-core/playwright` (última 4.x, MPL-2.0) como devDependency. Creá `tests/a11y/routes.spec.ts` (Playwright, misma sesión E2E que el smoke) que recorre la constante `ROUTES` exportada por `scripts/qa/snap.mjs` a 1280 px y corre `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`. Por ahora **no falla** el test: escribe `qa-snapshots/a11y/<ruta>.json` y un resumen `a11y-summary.md` (ruta · violaciones críticas · serias · moderadas · las 3 reglas más frecuentes). Agregá `"test:a11y": "playwright test tests/a11y"` a `package.json` y `testDir` adicional en `playwright.config.ts` solo si hace falta (preferí un `--config` aparte para no tocar el smoke).
3. Corré `npm run test:a11y` contra `npm run start -- -p 3001` y pegame `a11y-summary.md`. Ese inventario es la línea base de accesibilidad del proyecto.
4. `npm run typecheck && npm run lint && npm run test`. Stageá solo lo tuyo (`package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/lib/url-state/*`, `tests/unit/url-state.test.ts`, `tests/a11y/*`, `.gitignore` si agregaste `qa-snapshots/a11y`) y proponé dos commits sin ejecutarlos:
   - `chore(deps): nuqs para filtros en URL; parsers de periodo y comparación con tests`
   - `chore(a11y): auditoría axe por ruta con resumen; línea base sin gate`
