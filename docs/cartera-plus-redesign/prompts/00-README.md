# Prompts delta — fase 0 · Fundamentos

Un prompt a la vez, en este orden. Cada uno abre su propia rama, termina con `npm run typecheck && npm run lint && npm run test` en verde y se detiene ANTES de `git commit` (Claude Code pide aprobación; Memo revisa `git status` + `git diff --staged`, aprueba el commit, hace push y abre el PR).

| # | Rama | Qué entrega | Toca lógica | Verificación |
| --- | --- | --- | --- | --- |
| 0.1 | `chore/redesign-secrets-docs` | `.gitignore` de `.claude/`, carpeta `docs/cartera-plus-redesign/` versionada | No | `git status` limpio de secretos |
| 0.2 | `claude/agitated-wescoff-65711d` → PR | Fix del saldo vivo de deuda (alerta falsa del panel) | Sí (ya escrito) | tests + demo |
| 0.3 | `chore/qa-snapshots` | Script `scripts/qa/snap.mjs`: capturas de las 19 rutas a 390/768/1280 px con la cuenta E2E; línea base ANTES de tocar CSS | No | carpeta `qa-snapshots/base/` |
| 0.4 | `refactor/css-layers` | `globals.css` partido en archivos y `@layer`, cero cambio visual | No | diff de capturas = 0 px |
| 0.5 | `feat/design-tokens-v2` | Tokens de gráfico y motion (claro/oscuro) + `format.ts` como formateador único | No | `/dev/ui` interno renderiza los tokens |
| 0.6 | `chore/nuqs-axe` | `nuqs`, `@axe-core/playwright`, spec de a11y sobre las 19 rutas | No | axe sin violaciones serias (o lista de las existentes) |

Reglas fijas en todos los prompts: repo-first (leer antes de escribir), Conventional Commits, un commit = un cambio lógico, nunca `git add .`, nunca tocar `.env*`, nunca cambiar apariencia en un `refactor/`.

**Antes de crear un archivo, comprobar si ya existe** (`test -f` / `ls`) y, si existe, editarlo o hacer append — nunca `cat >` ni escribirlo entero encima. En 0.5 se sobrescribió así `tests/unit/format.test.ts`, que ya tenía 25 tests (incluido el guard de regresión P0-2 de símbolos de moneda); se recuperó del índice de git, pero el archivo nuevo no lo habría delatado. La señal que lo destapa es `git diff --stat`: un archivo que solo debía crecer no puede mostrar borrados.
