# Prompt 0.2 — merge del fix de saldo vivo de deuda

La rama `claude/agitated-wescoff-65711d` (3 commits: `c550300b`, `fc66ca28`, `0c076751`) corrige la alerta falsa del panel: el diagnóstico y el asesor leían el ancla `debts.balance` en vez del saldo vivo (`getCurrentDebtBalances` / `recomputeFromPayments`). Hay que llevarla a `main` antes del piloto del Home.

---

Contexto: en `main` actualizado. La rama `claude/agitated-wescoff-65711d` existe local y en `origin`. Objetivo: dejarla lista para PR, sin reescribir sus cambios.

1. `git log --oneline main..claude/agitated-wescoff-65711d` y `git log --oneline claude/agitated-wescoff-65711d..main | wc -l` — decime cuántos commits tiene la rama y cuántos le faltan de `main`.
2. Cambiate a la rama y rebasala sobre `main` (`git rebase main`). Si hay conflictos, listalos archivo por archivo con las dos versiones y PARÁ: yo decido. No resuelvas conflictos en `src/modules/control/**` ni `src/lib/ai/**` por tu cuenta.
3. Sin conflictos: corré `npm run typecheck && npm run lint && npm run test`. Si algo falla, mostrame el error completo y no lo «arregles» tocando lógica; solo ajustes de tipos o imports rotos por el rebase.
4. Mostrame el diff resumido (`git diff main --stat`) y la lista de archivos tocados en `src/modules/control` y `src/lib/ai`.
5. Proponé el push (`git push --force-with-lease origin claude/agitated-wescoff-65711d`) y el texto del PR con este cuerpo, sin ejecutarlos:

```
fix(control, ai): el diagnóstico del panel y el asesor leen el saldo VIVO de deuda, no el ancla

Antes: `debts.balance` es el ancla original; el panel y el asesor lo usaban como saldo y una tarjeta ya saldada (₡0) seguía apareciendo como «la deuda más cara» y se recomendaba abonarle.
Ahora: ambos usan `getCurrentDebtBalances` (recomputeFromPayments), igual que /deudas.
Incluye: fallback de fecha de recepción en la ingesta por correo cuando el parser no extrae fecha.

Verificación manual: con la cuenta demo (Familia Ramírez) /dashboard ya no muestra la alerta de «Tarjeta BAC Visa ₡1 850 000»; /deudas y el panel coinciden.
```

Después del merge, recordame borrar la rama local y remota (pido aprobación).
