# Notas de la corrida nocturna — acceso a datos del asesor

**Corrida:** 2026-08-02, 00:50 – 02:05 (hora local, UTC−6)
**Alcance autorizado:** P1 → P2 → P3, cada uno en su rama y PR, auto-merge solo con CI verde, sin migraciones.
**Punto de partida:** `main` en `e6af2c4`. El brief decía `b75e287`; main estaba 5 commits adelante (#580–#584). Arranqué desde main real.

---

## 1. Resumen

| PR | Qué | Estado |
|---|---|---|
| [#585](https://github.com/memogrg/Compound-Ascend/pull/585) | **P1** — `consultar_transacciones`: libro diario por fecha/periodo/sobre/comercio con agregación | ✅ mergeado `74f6e10` |
| [#586](https://github.com/memogrg/Compound-Ascend/pull/586) | **P2** — `consultar_historial`: serie por mes + variación desde snapshots | ✅ mergeado `a31d9af` |
| [#587](https://github.com/memogrg/Compound-Ascend/pull/587) | **P3** — `consultar_detalle`: pagos, aportes, compras, dividendos, liquidez | ✅ mergeado `97b2bd2` |

**PRs saltados:** ninguno. Ningún CI quedó rojo, ninguna migración fue necesaria, `main` nunca quedó roto.

Suite al cierre: **1696 tests pasados**, 26 skipped, `tsc` exit 0, eslint limpio (siguen los 2 warnings preexistentes de `scripts/k6`).

---

## 2. Lo que encontré mal (por orden de importancia)

### 2.1 🔴 Dos tablas muertas: `net_worth_snapshots` y `goal_contributions`

Ambas existen con esquema, índices y políticas RLS. **Ninguna se escribe nunca.**

| Tabla | Migración | Único acceso en el repo |
|---|---|---|
| `net_worth_snapshots` | `0007_rich_life` | `rich-life-service.ts:238` — un `select … limit 1` que por lo tanto siempre vuelve vacío |
| `goal_contributions` | `0005_control` | ninguno; solo un comentario sobre borrado en cascada |

El brief listaba `net_worth_snapshots` como una de las tres fuentes de historial y `goal_contributions` como la fuente de aportes a metas. **Ninguna de las dos lo es.** Si las hubiera usado, P2 y P3 habrían respondido "todavía no tengo historial" y "no tenés aportes" a todos los usuarios — indistinguible de un bug, y muy difícil de diagnosticar después.

Lo que sí funciona:
- Patrimonio → `portfolio_snapshots` (diario, escrito por `ensureTodaySnapshot` + cron).
- Aportes a metas → transacciones con `linked_kind='goal'`, que suben `savings_goals.current_amount`.

**Qué quiero que revises:** decidir si estas tablas se pueblan o se borran. Hay una lectura muerta en `rich-life-service.ts:238` que probablemente pretendía comparar contra el patrimonio anterior y hoy no hace nada. Cualquiera de las dos salidas es migración, así que no toqué nada.

### 2.2 🟠 `\b` después (o antes) de vocal acentuada nunca matchea

Me mordió **cuatro veces** en esta corrida. En JS, `é`/`ó`/`ú` no son caracteres de palabra, así que `\bqu[eé]\b` **jamás** matchea "qué", y `\b[uú]ltimo` jamás matchea "último".

Casos que escribí y tuve que corregir: `\bqu[eé]\b` (dos veces), `\b(?:subió|bajó|creció)\b`, `\b[uú]ltimo`.

El router ya evitaba el patrón en su código viejo, pero por convención tácita — no hay nada que lo impida. **Sugerencia para revisar:** una regla de lint (`no-restricted-syntax` sobre literales de regex que contengan `\b` adyacente a una clase con vocal acentuada) cerraría la puerta, igual que hicimos con `todayLocalISO` en #584. No lo metí porque no era parte del encargo.

### 2.3 🟡 Huecos de ruteo preexistentes (NO son regresiones — verificados contra main)

Dos preguntas legítimas de dato que hoy escalan al LLM sin necesidad:

- **`"¿dónde se me va el dinero?"` → `null`.** El patrón de `gasto_categoria` cubre `"en qué se me va"` pero no `"dónde se me va"`. Falta una variante.
- **`"¿cómo van mis metas?"` → `null`.** `REASONING_CUES` atrapa "cómo" antes de que se evalúe el patrón `metas`, que está más abajo. La pregunta es puramente factual.

Ambas comprobadas con el router de main sin mis cambios. Son arreglos de una línea cada uno, pero tocan intents ajenos al encargo, así que los dejé anotados en vez de meterlos de contrabando.

### 2.4 🟡 `ultimos_movimientos` fecha en UTC

`router.ts`, carril `ultimos_movimientos`: usa `new Date().toISOString()` para la ventana de 60 días y para `period.month/year`. En Vercel eso es UTC, exactamente el bug que #573 y #583 vinieron a corregir en otros sitios. El impacto real es mínimo (ventana de 60 días, la etiqueta no se usa), por eso no lo arreglé dentro de P1 — habría mezclado dos cambios. Pero es el mismo patrón que ya mordió dos veces.

### 2.5 🟢 `CLAUDE.md` dice que los comentarios van en inglés

"Code identifiers, comments, and this file are in English". El repo real tiene **todos** los comentarios en español, sin excepción que yo haya visto. Seguí el código, no el documento. Vale corregir el documento.

---

## 3. Decisiones que tomé en tu nombre

1. **P3 es UNA herramienta con parámetro `dominio`, no cinco herramientas.** El brief decía "para cada uno: herramienta determinista". Cinco tools casi idénticas habrían multiplicado la superficie de ruteo y el inventario que ve el LLM (que ya pasó de 9 a 12 decls). Si preferís separarlas, el motor ya está partido por dominio y se divide sin dolor.

2. **La serie histórica NO convierte monedas.** No hay tasa histórica por fecha; convertir con la de hoy haría que un patrimonio en CRC "creciera" solo porque se movió el dólar. Gana la moneda del snapshot. Es la decisión más discutible de las tres, porque un usuario con snapshots en dos monedas distintas verá una serie que no es comparable consigo misma.

3. **`portfolio_snapshots` se colapsa al ÚLTIMO día del mes**, no al promedio. Promediar mezclaría un mes con 30 lecturas y otro con 2.

4. **Extendí tres barrels** (`control`, `wealth`, `financial-base`) en vez de importar servicios internos desde `src/lib/ai/`. CLAUDE.md manda importar del barrel; el orquestador ya violaba eso en un sitio (`surplus-decision-service`), pero no me pareció razón para sumar deuda.

5. **Un grupo sin total convertible se ordena al final**, no al principio. Con `total ?? -Infinity` encabezaba el ranking de "dónde más gasté" sin haber sido medido.

6. **`extractPeriodo` devuelve `null` para "este mes" a propósito**, para no regresionar `gasto_mes`. Solo un periodo *distinto* del mes en curso manda la pregunta al libro diario.

---

## 4. Qué quiero que revises

**Por prioridad:**

1. **Las dos tablas muertas** (§2.1) — es la decisión que necesita a un humano. Poblarlas o borrarlas, ambas son migración.
2. **La disciplina de moneda en series históricas** (§3.2) — mi decisión de no convertir es defendible pero tiene un caso feo.
3. **Que el ruteo determinista no se haya vuelto demasiado goloso.** Metí tres bloques nuevos antes de los intents existentes. Hay tests de no regresión para los seis intents que podían verse afectados (`gasto_mes`, `gasto_categoria`, `ingreso_mes`, `cuota_deuda`, `metas`, `resumen_inversiones`, `saldo_liquidez`), pero el ruteo por patrones es donde más fácil se cuela algo que los tests no previeron. Vale una pasada manual en el chat real.
4. **El guard de lint para `\b` + acento** (§2.2) — si te parece, lo hago en un PR aparte.
5. **Los dos huecos preexistentes** (§2.3) — un PR chico los cierra.

**Lo que NO hace falta que revises:** los motores puros. Los tres están cubiertos (35 + 23 + 20 tests) incluyendo los casos degenerados: sin datos, un solo punto, base cero, monedas mixtas sin tasa, nombre que no resuelve.

---

## 5. Nota de proceso

Un error mío que vale registrar: al editar `router.ts` con un script de Python, escribí `\b` dentro de una cadena no-raw y Python lo convirtió en el **carácter BACKSPACE (0x08)**. El archivo *se veía bien* al leerlo — el 0x08 es invisible en la terminal — pero la regex pedía un backspace literal y nunca matcheaba. Lo cacé porque un test falló y las condiciones daban `false` con la regex "correcta" a la vista.

Verifiqué al cierre que no quedan caracteres de control en `router.ts` (0 backspaces, 0 otros). Si volvés a ver una regex que "debería matchear y no matchea", ese es el primer sospechoso.
