# Prompt 0.1 — chore/redesign-secrets-docs

Pegar en Claude Code, en la raíz del repo, en `main` actualizado (`git pull`).

---

Contexto: estamos iniciando el rediseño UX de CARTERA+ (blueprint en `docs/cartera-plus-redesign/`). Antes de cualquier rama de código hay dos tareas de higiene. No implementes nada del rediseño en este prompt.

1. Creá la rama `chore/redesign-secrets-docs` desde `main`.

2. `.gitignore`: verificá que estas líneas existen (ya deberían estar al final del archivo; si faltan, agregalas):
```
# Config local de Claude Code (puede contener secretos en comandos permitidos)
.claude/settings.local.json
.claude/launch.json
.claude/worktrees/
```
   Confirmá con `git status --short | grep .claude` que no aparece nada (la carpeta `.claude/` nunca estuvo versionada; solo queremos que no pueda entrar por accidente). Confirmá también con `grep -c "eyJ" .claude/settings.local.json` que devuelve 0 (las entradas con JWT ya fueron eliminadas; si devuelve más de 0, eliminá esas entradas del array `permissions.allow` y avisame cuáles eran, sin pegar su contenido).

3. Documentación: la carpeta `docs/cartera-plus-redesign/` ya existe sin versionar (blueprint, informes, decision log, prototipos HTML). Revisá que no contenga secretos (`grep -rEl "eyJ[A-Za-z0-9_-]{20,}|sk_live|service_role" docs/cartera-plus-redesign` debe estar vacío) y stageala completa con `git add docs/cartera-plus-redesign .gitignore` (esta es la única excepción a «nunca add por carpeta»: es documentación nueva y ya revisada).

4. Mostrame `git status` y `git diff --staged --stat`, y proponé este commit sin ejecutarlo hasta que lo apruebe:
```
docs(redesign): blueprint de rediseño UX, prototipos y decision log; ignora config local de Claude Code
```

No corras build ni tests (no hay código). No toques ningún otro archivo.
