# docs/cartera-plus-redesign

Blueprint del rediseño UX y de visualización de CARTERA+ (fase 1: investigar → auditar → proponer → planificar; sin cambios a producción). Entregado el 16-sep-2026.

- Documento vivo (comentarios y aprobaciones): https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331
- `BLUEPRINT.md` — el documento maestro completo (29 secciones).
- `00` … `12` — el mismo contenido repartido por tema, más el decision log (`10`) y el progreso (`12`).
- `01a` y `05a` — los dos informes de investigación completos (referentes UX; librerías de gráficos y stack de interacción).

Regla: una decisión que entra en `10-decisions.md` no se vuelve a discutir; si cambia, se agrega una fila nueva con fecha y razón.

## Cadena de verificación, antes de cada push

```
npm run typecheck && npm run lint && npm run format:check && npx vitest run tests/unit/ && npm run build
```

**El criterio de lint es `0 errores`.** Hasta el 24-sep-2026 era «exactamente 30539 problemas /
5960 errores», un número que se comparaba a ojo entre corridas. Al mirarlo de cerca, **5960 de
esos 5962 errores venían de `.claude/worktrees/`** —copias enteras del repo que crea Claude Code
para trabajar en paralelo, que están en `.gitignore` y que CI nunca ve—. El 99,97 % del listón era
ruido de checkouts viejos, y dos errores propios pasaron desapercibidos dentro de él hasta que
alguien sumó.

Con `.claude/**` en los `ignores` de `eslint.config.mjs`, la medición local es la misma que la de
CI: **15 problemas, 0 errores**. Las 15 advertencias son deuda conocida y acotada —variables sin
usar en prototipos de `design-handoff/`, `_heroes/`, `_qa/` y el sembrador de la demo; dos exports
anónimos en los scripts de k6; un `window.location.href` en `mobile-google-button.tsx`; y una
directiva `eslint-disable` que sobra en un test—. Ninguna está en código de producto salvo la de
`mobile-google-button.tsx`.

Un error nuevo ahora se ve en cuanto aparece. Si el conteo sube, algo se rompió: no hay margen que
lo disimule.
