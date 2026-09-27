# AGENTS.md

Las instrucciones del proyecto viven en [`CLAUDE.md`](CLAUDE.md). Este fichero existe por una
razón mecánica, no editorial.

`next dev` detecta que lo está corriendo un agente —`@vercel/detect-agent` mira variables como
`CLAUDECODE`— y, si no encuentra su bloque de reglas, lo **escribe**. Con `AGENTS.md` presente y
alojando el bloque, escribe aquí y deja `CLAUDE.md` en paz
(`node_modules/next/dist/server/lib/generate-agent-files.js`, función `writeAgentFiles`).

Sin este fichero, cada `npm run dev` ensuciaba `CLAUDE.md` con un cambio no versionado que
reaparecía al borrarlo. La alternativa era arrancar con las variables desactivadas
(`env -u CLAUDECODE -u CLAUDE_CODE -u CLAUDE_CODE_IS_COWORK npm run dev`), que funciona pero
depende de que cada persona se acuerde. Esto no depende de nadie.

El bloque de abajo lo mantiene Next: si cambia de versión, `next dev` lo actualiza solo. No hay
que editarlo a mano.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
