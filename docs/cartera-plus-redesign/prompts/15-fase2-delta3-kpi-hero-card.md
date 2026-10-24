# Prompt 2.3 — feat/kpi-hero-card (la cifra principal y sus tarjetas)

---

Fase 2 · Delta 3 — `feat/kpi-hero-card`. Rama desde `main` actualizado. Dependencia aprobada: `@number-flow/react`. Antes de instalar, reportar `version`, `peerDependencies` y `dist.unpackedSize`; instalar con el npm del repo (10.8.2) y comprobar que el diff del lockfile se limita al paquete nuevo y su árbol (si aparece el drift npm 10/11, parar).

Verificar que NumberFlow renderiza en SSR sin desajuste de hidratación y que su salida coincide **carácter a carácter** con `formatMoney`. **Sin coincidencia no hay hero.**

Primitivas en `src/components/kpi/` (hoja `src/styles/kpi.css`, prefijo `kpi-`): `kpi-hero.tsx`, `kpi-card.tsx`, `delta-chip.tsx` (función pura `describirDelta`), `sparkline.tsx` (SVG propio, función pura `pathSparkline`), `meter.tsx` (`role="meter"`, función pura `severidadMeter`). Sección «KPI» en `/dev/ui` con un hero «Libre para gastar», un botón «Simular cambio» y una fila de 4 tarjetas. Tests unitarios y Playwright; QA visual y de accesibilidad.

---

## La coincidencia: medida, no supuesta

`formatMoney` es determinista y **no usa `Intl`**: agrupa con punto, decimaliza con coma y usa el
signo menos tipográfico (U+2212). NumberFlow formatea con `Intl`. Pedirle la moneda tal cual daba
esto:

| valor | `Intl` `es-CR` + `currency` | `formatMoney` |
| --- | --- | --- |
| 1234567 | `₡1 234 567` (espacio fino) | `₡1.234.567` |
| −890000 | `-₡890 000` (guion) | `−₡890.000` |

Dos diferencias, las dos invisibles en una captura y las dos reales: un hero que dice «₡1 234 567»
junto a una tarjeta que dice «₡1.234.567» es una app que no se pone de acuerdo consigo misma.

La salida —`numero-animado.ts`— no negocia con el locale del país sino con su gramática numérica:

- `locales: "de-DE"`, cuya agrupación es punto y cuya decimal es coma. No se elige por el idioma
  (no se muestra ni una palabra), sino porque es el único locale de `Intl` que escribe los números
  como `format.ts`.
- **el valor absoluto**, con el signo en el `prefix`, para que el menos sea U+2212 y no el guion
  que pondría `Intl`.
- el símbolo de moneda también en el `prefix`, pegado, como en el resto de la app.

`tests/unit/kpi.test.tsx` compara carácter a carácter para 0, 1.234.567, −890.000, 1.500,5,
34.145.739, −0,4, 999 y −1, más un caso en USD con dos decimales. **El caso que decide el diseño es
−0,4**: el signo se calcula DESPUÉS de redondear, porque «−₡0» es un número que no existe.

## El hallazgo que cambió los tests: el número pintado no es texto

NumberFlow renderiza en un **shadow root** donde cada posición contiene los diez dígitos apilados
y el visible se elige con un `transform`. El `textContent` de ese shadow root es literalmente
`₡0123456789.0123456789…`, y `innerText` sobre el host devuelve cadena vacía.

Es decir: **no existe ninguna forma de leer del DOM qué cifra muestra el hero.** Tres consecuencias
que conviene tener escritas:

1. La coincidencia con `formatMoney` se prueba en el **formateador** (unitario), que es lo que
   NumberFlow recibe y reparte entre las posiciones. No se puede probar leyendo la pantalla.
2. El Playwright comprueba lo que sí es observable: el texto accesible y la **geometría** —cuántas
   posiciones de dígito hay (7 para ₡1.234.567, 6 para ₡987.450) y si están girando—. Comprobar
   solo el `sr-only` dejaría pasar justo el fallo que se busca: React actualiza y el elemento se
   queda con el valor viejo. Es el fallo que apareció de verdad en la primera corrida.
3. La cifra del hero **no se puede seleccionar ni copiar, ni la encuentra el buscador del
   navegador** (Ctrl+F). Anotado en `11-open-questions.md`: es aceptable en un titular, no lo sería
   en un importe de transacción.

## Decisiones

**La cifra va dos veces: animada y en texto.** El `<number-flow-react>` lleva `aria-hidden` y al
lado hay un `sr-only` con el número entero. Sin eso, un lector de pantalla recorrería las decenas
de `<span>` y leería «uno, punto, dos, tres, cuatro». Se anuncia una vez y completa.

**Reduced motion no se ramifica.** NumberFlow trae `respectMotionPreference` activo por defecto, así
que con la preferencia puesta el número aparece ya escrito. Ramificar el render entre servidor y
cliente es exactamente lo que produce un desajuste de hidratación; el test lo comprueba con
`reducedMotion: "reduce"`: 0 dígitos girando justo después del clic.

**Se anima UNA cifra por pantalla.** `KpiCard` escribe con `formatMoney` y no anima: cuatro tarjetas
moviéndose a la vez convierten un cambio de periodo en un espectáculo y le quitan el foco a la cifra
que importa.

**El color del delta sale de dirección × sentido, no del signo.** En Ingresos un «+» es bueno; en
Gastos el mismo «+» es malo. `describirDelta(valor, moneda, sentidoBueno)` decide el tono, y el chip
nunca se fía del color: lleva flecha, signo y un `sr-only` con «sube» / «baja» / «sin cambio»
(WCAG 1.4.1). El cero es su propio caso —«sin cambio», tono neutro—: «+₡0» sugiere una subida que no
hubo, y pintarlo de verde o rojo inventa una valoración.

**`role="meter"`, no `progressbar`.** `progressbar` dice «esto va por la mitad y terminará»; `meter`
dice «esta medida está en este punto de su rango», que es lo que significa un 78 % de presupuesto
gastado. El umbral es **inclusivo**: quien fija el aviso en 80 quiere enterarse AL llegar. El valor
se acota al rango en vez de desbordar la barra.

**La sparkline es SVG propio y va `aria-hidden`.** Montar Recharts para una línea y un punto metería
su peso en cada tarjeta, y el dato ya está en la cifra de al lado: una sparkline «accesible» solo
añadiría ruido. `pathSparkline` cubre los tres casos que rompen una sparkline escrita a la ligera:
sin puntos, un punto, y todos iguales — este último dividiría por cero y pintaría `NaN`, que en un
`<path>` no se ve como error: simplemente no se dibuja nada.

**Colores por token DIRECTO** (`--success`, `--danger`, `--warning`), nunca por su alias
(`--pos`, `--neg`, `--warn`): los alias se resuelven en `:root`, así que un `data-theme="dark"`
puesto en un contenedor no los voltearía. Es el hallazgo ya anotado en `11-open-questions.md`.

## Desviaciones del enunciado

- **`numero-animado.ts`** no estaba en la lista de archivos. Es donde vive la coincidencia con
  `formatMoney` y donde está escrito por qué el locale es `de-DE`; dejarlo dentro de `kpi-hero.tsx`
  lo habría hecho intestable sin React.
- **`FormatoNumero`** en vez de `Intl.NumberFormatOptions`: el `Format` que acepta NumberFlow es un
  subconjunto (no admite `notation: "scientific"`), así que el tipo ancho no le encaja. Se declara
  solo lo que se usa y sirve a los dos lados sin castear.
- **La sección de `/dev/ui` es la 7** y «Formateadores» pasa a ser la 8.

## Nota de operación: el reloj congelado congela también el límite de peticiones

El servidor de QA corre con `QA_FREEZE`, y el contador de `rate-limit` en memoria usa `Date.now()`.
Con el reloj parado **la ventana nunca avanza**: al décimo inicio de sesión el bucket `auth` se
agota para siempre y todo login posterior falla con «Login no navegó tras 3 intentos», que parece un
fallo del test y no lo es. Se resuelve reiniciando `npm run qa:start`. Ya estaba anotado en
`11-open-questions.md`; queda aquí porque volvió a costar una corrida entera diagnosticarlo.
