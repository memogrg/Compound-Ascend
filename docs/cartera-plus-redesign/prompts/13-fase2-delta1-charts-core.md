# Prompt 2.1 — feat/charts-core (núcleo compartido de gráficos)

---

Fase 2 · Delta 1 — `feat/charts-core`. Rama desde `main` actualizado (HEAD `5f10feea`). Sin dependencias nuevas. Nada en `src/modules/**`, `src/lib/ai/**`, ni en los 3 wrappers actuales (`area-chart.tsx`, `line-chart.tsx`, `donut-chart.tsx`) ni en `/m`: el núcleo se construye al lado y se demuestra en `/dev/ui`; las pantallas reales no cambian un píxel.

Módulo `src/components/charts/core/`: `chart-frame.tsx` · `gradient-defs.tsx` · `glow-filter.tsx` · `chart-tooltip.tsx` · `use-serie-activa.ts` · `legend.tsx` · `theme.ts` · `accesible.ts` · `escala.ts` · `index.ts`.

Demostración en `/dev/ui`: área con gradiente + glow + crosshair, línea de 3 series con leyenda interactiva, barras mensuales. Datos fijos, `accessibilityLayer` activo, tabla de datos, claro y oscuro.

Tests unitarios (sin RTL) y Playwright sobre `/dev/ui`; axe 0 critical/serious dentro de `.cf`. QA: `/dev/ui` a `routes.json` con superficie `dev`, excluida del criterio estricto. Diff OFF de las 38 rutas contra la base: exit 0.

---

## Lo que se hizo, y prevalece

**El enunciado pedía dos cosas incompatibles, y hubo que elegir.** «El SVG queda `aria-hidden` porque la tabla es el canal accesible» y «cada una con `accessibilityLayer` de Recharts activado» no pueden convivir: `accessibilityLayer` pone `role="application"` y `tabindex="0"` en el propio `<svg class="recharts-surface">`, y un elemento focalizable dentro de un `aria-hidden` es la violación `aria-hidden-focus` —**serious**— que axe cantó en la primera corrida, 3 nodos, uno por gráfico.

**Gana el teclado.** El criterio de salida de la fase 2 dice «Recharts con teclado»; un gráfico escondido del árbol de accesibilidad no lo cumple, y la tabla sigue estando para quien prefiera los números. El SVG no lleva `aria-hidden` y la tabla no es una rampa lateral: es el otro modo de leer lo mismo, con un botón que **cualquiera** puede pulsar. Tras el cambio, axe da **0 reglas** dentro de `.cf` en claro y en oscuro.

**La tabla vive siempre en el DOM.** Oculta con `.sr-only` cuando el botón no la ha abierto, nunca con `display: none`: eso también la escondería del lector, que es justo a quien sirve. El botón alterna la clase, no la existencia.

**Los cuatro estados miden lo mismo.** Si «cargando» fuera más bajo que «datos», la página saltaría al resolverse — el defecto que el esqueleto venía a evitar. `ALTO_MINIMO` son 160 px porque por debajo no caben ejes y tooltip.

**`theme.ts` no puede contener un color, y hay un test que lo vigila.** Es exactamente el archivo donde alguien escribiría «`#378451` y ya»: un hex ahí no cambia con el tema y no aparece en ninguna búsqueda de tokens. El test lee el fuente y falla ante cualquier `#…`, `rgb(`, `hsl(` u `oklch(`, y además exige que toda clave que nombre un color resuelva a `var(--…)`.

**El color pertenece a la entidad, no al índice.** `seriesVisibles` filtra sin reasignar nada, así que apagar «Real» no repinta «Presupuesto». Es el error clásico de las leyendas que colorean por posición del array visible, y hay un test que lo fija comparando los colores antes y después de ocultar.

**Atenuar no es ocultar.** Señalar una serie baja las demás a 0,35 —legible— en vez de esconderlas; ocultar es una acción distinta, deliberada, que solo hace el clic en la leyenda. Y Escape suelta el resaltado pero **no reenciende** lo que alguien apagó: deshacer una decisión con una tecla sería una sorpresa.

**El texto del tooltip y de la leyenda nunca lleva el color de la serie.** Esos seis colores están calibrados contra el fondo del gráfico, no contra el de una tarjeta, y varios bajan de 4.5:1 como texto pequeño. La serie se identifica con un trazo de 2 px de su color —la misma marca que dibuja— y el texto va en `--text` / `--muted`. Por lo mismo, el swatch de la leyenda imita la marca: bloque para área y barras, línea para líneas, con la máscara de guiones si la serie es discontinua.

**Los nombres se insertan como texto de React, nunca como HTML.** Un comercio puede llamarse `<img onerror=…>`. Hoy el tooltip solo pinta etiquetas nuestras, pero la regla se escribe ahora, antes de que alguien le pase un nombre de comercio en la fase 4.

**Los ids de `<defs>` salen de `useId()`, y hay un test que lo comprueba con dos instancias.** Dos gráficos en la misma página declarando `#grad-1` hacen que el segundo le robe el degradado al primero — un fallo que solo aparece cuando alguien pone dos juntos, que es literalmente lo que hace `/dev/ui`. El test renderiza dos con `react-dom/server` y exige seis ids distintos.

**La animación de Recharts va apagada en todo el núcleo, y no por gusto.** Con `ResponsiveContainer` se re-dispara en cada medición y el gráfico «late» al redimensionar; en las capturas de QA introduce un estado intermedio no determinista. El movimiento que sí se quiere —punto activo y tooltip— es CSS y se apaga solo con `prefers-reduced-motion` a través de los `--dur-*`.

**`escala.ts` reexporta, no reimplementa.** Duplicar `niceDomain` garantizaría que un gráfico viejo y uno nuevo eligieran topes distintos para el mismo dato.

## Desviaciones del enunciado, y por qué

- **`tablaDeDatos(data, series, formato, etiquetaX?)`** lleva dos argumentos más que la firma pedida. El formateador es del GRÁFICO, no de la serie: las tres series de un panel se leen con la misma moneda, y tenerlo repetido dentro de cada `SerieDef` invita a que una acabe con otro.
- **`vitest.config.ts` amplía `include` con `tests/**/*.test.tsx`.** El test de ids necesita renderizar marcado; se hace con `react-dom/server` en el entorno `node` —sin jsdom ni RTL, como pedía el prompt— pero el archivo tiene que ser `.tsx`. Hoy no existía ningún test `.tsx`, así que el cambio no arrastra nada.
- **`src/styles/charts-core.css`** no estaba en la lista. Hace falta: `<figure class="cf">` sin hoja es un `figure` con márgenes del navegador. Prefijo `cf-`, importada en `globals.css` en la capa `ca`, sin tocar ninguna clase existente.
- **La exclusión del QA es `dev_ui`, no `dev`.** `diff.mjs` compara por igualdad contra `slugDe(rel)`, y `/dev/ui` se convierte en `dev_ui`. Documentado en `qa/README.md` con el comando completo.
