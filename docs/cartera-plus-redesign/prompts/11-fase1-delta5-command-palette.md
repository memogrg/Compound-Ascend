# Prompt 1.5 — feat/command-palette (paleta de comandos ⌘K)

---

Delta 5 — `feat/command-palette`. Rama desde `main` actualizado (`git pull`; confirmar HEAD `638c0e32`). Todo detrás de `navV2Enabled()`. **No instalar dependencias**: se construye sobre `modal.tsx` y el design system.

1. `src/lib/command-palette/items.ts` (puro): los destinos derivados de `nav-v2.ts` —nunca escritos a mano— más 6 acciones rápidas con los deep-links `?new=` que ya usa el repo. Sinónimos en español por pestaña.
2. `src/lib/command-palette/filter.ts` (puro): normalización sin tildes, puntuación `startsWith` > `includes` y etiqueta > sinónimo, corte a 12 con consulta.
3. `src/components/layout/command-palette.tsx`: combobox dentro de `Modal`, con `role="listbox"`/`option`, `aria-activedescendant`, flechas con envoltura, Home/End, Enter y cierre al cambiar de ruta.
4. `src/hooks/use-command-palette.ts`: atajo ⌘K / Ctrl+K en `document`, registrado solo con la bandera encendida.
5. `src/styles/command-palette.css`: prefijo `cp-`, tokens existentes.
6. `topbar-v2.tsx`: el buscador decorativo pasa a ser un `<button>` que abre la paleta. `app-shell.tsx`: monta la paleta bajo bandera.
7. Tests unitarios de `items` y `filter`; spec de a11y en `tests/a11y/` con la paleta abierta; verificación funcional con Playwright (foco, ↓+Enter conservando `?period=`, Escape).
8. QA visual: bandera OFF contra la base oficial → exit 0; bandera ON contra la referencia ON → solo el área del buscador; corrida de determinismo.
9. Docs y commit:
   `feat(nav): paleta de comandos ⌘K con navegación y acciones rápidas detrás de NAV_V2`

---

## Lo que se hizo, y prevalece

**Sin `cmdk`, y no por ahorrar un `npm install`.** La librería trae su propio `Command.Dialog` con foco, trampa de Tab, Escape y scrim — exactamente lo que `modal.tsx` ya hace en este repo, con el detalle del portal a `document.body` que costó descubrir (el `position: fixed` del scrim quedaba atrapado por ancestros con `transform`). Dos implementaciones del mismo diálogo conviviendo es la clase de duplicación que después nadie se atreve a unificar. Lo que aporta `cmdk` y no teníamos —el filtro difuso y la puntuación— son **50 líneas puras y testeables** (`filter.ts`), no una dependencia. La paleta terminó en 4 archivos propios y **cero** cambios en `modal.tsx`.

**`modal.tsx` no hizo falta tocarlo, y eso se comprobó antes de escribir el componente.** Enfoca el primer elemento focalizable que no sea `.modal-x` —que acá es el input—, atrapa Escape en `document` con un solo dueño, encierra el Tab y al desmontar le devuelve el foco a quien lo tenía. El único punto donde no alcanzaba está abajo, y se resolvió fuera del modal.

**Es un combobox, no un diálogo con una lista.** El foco se queda en el input y la opción activa se anuncia con `aria-activedescendant`. El otro patrón posible —mover el foco a cada `<li>` con las flechas— obligaría a devolverlo al input para seguir escribiendo, y el lector de pantalla leería el cambio de foco en lugar del resultado.

**El punto donde `modal.tsx` no alcanzaba: Escape abierta con el atajo.** `Modal` guarda `document.activeElement` al montar y se lo devuelve al desmontar. Abierta con el ratón eso es el botón del topbar y funciona; abierta con ⌘K el foco está en el `body`, así que Escape devolvía a quien navega con teclado al **principio del documento**. La tentación era enfocar el botón en el `onCerrar` de la paleta, pero entonces compite con la limpieza del efecto de `Modal`, que corre después y lo pisa — se arregla con un `setTimeout(0)`, que es exactamente el tipo de parche que luego nadie sabe por qué está. La solución es al revés y no toca el modal: **el hook enfoca el botón ANTES de abrir**, así el «foco previo» que `Modal` guarda ya es el correcto y su restauración acierta sola. El botón viaja como `ref` del shell al topbar.

**Los destinos se derivan de `nav-v2.ts`, y un test lo obliga.** Si mañana una pestaña cambia de ruta, la paleta la sigue sola; si alguien agrega una pestaña y la paleta no la ofrece, `command-palette-items.test.ts` lo dice. Las rutas móviles se excluyen: `rutasDelModelo()` mezcla las 38 (escritorio y sus pares `/m/…`) y ofrecer `/m/metas` desde el escritorio llevaría a la app móvil sin querer. El predicado es `ruta !== "/m" && !ruta.startsWith("/m/")` y no `startsWith("/m")` a secas, que también se tragaría `/mi-base-financiera` y `/mis-acciones`.

**La unicidad se le exige a la navegación, no a las acciones.** «Registrar gasto» y «Registrar ingreso» llevan las dos a `/transacciones` porque el alta vive en un modal (`QuickAddModal`) que todavía no tiene deep-link propio; los cuatro `?new=` restantes sí son los mismos que usan los CTA de los frascos vinculados, y el test los contrasta **contra el fuente** de `expense-jars.ts`, no contra una copia. El `?new=expense|income` queda anotado como backlog.

**El estado vacío destapó un defecto real, y lo destapó el spec de a11y.** Sin resultados no se pinta el listbox, pero el input seguía diciendo `aria-expanded="true"` y apuntando con `aria-controls` a un `id` que ya no existía: axe lo reporta como `aria-valid-attr-value` y un lector de pantalla anuncia una lista fantasma. Ahora los dos atributos dependen de que haya resultados. El portón acotado al diálogo —cero violaciones de cualquier impacto— fue lo que lo cazó; la medición de página entera no lo habría distinguido del ruido de fondo.

**El portón de a11y se compara contra la misma corrida, no contra un número escrito a mano.** El spec mide `/dashboard` con la paleta **cerrada**, la abre y vuelve a medir: la página entera no puede ganar ni una regla que no esté en la línea base ni un nodo más que el estado cerrado. Si mañana `/dashboard` mejora o empeora por otra razón, el portón sigue siendo justo.

**`getByRole("option")` no es inequívoco en esta pantalla.** La primera corrida del spec falló con «locator resolved to `<option value="2026-10">oct 2026</option>`»: el `<select>` de periodo del topbar también expone `option` nativos. Los localizadores van acotados al `listbox` de la paleta. Es un fallo de test, no de código, pero del tipo que en otro orden habría dado un verde falso.

**La consulta vacía devuelve TODO, sin recortar.** Al abrir, la paleta es el menú completo —no un estado vacío ni los 12 primeros—; el `max` solo existe para que una búsqueda no devuelva una lista interminable. El orden de empate se desempata por índice de definición porque `Array.sort` no garantiza estabilidad entre motores.

**La `ñ` se aplana junto con las tildes, y está bien.** NFD la descompone en `n` + tilde combinante y la regex de marcas la borra, así que «Año» normaliza a «ano». En un buscador eso se **quiere**: quien teclea «ano» encuentra «año», igual que quien teclea «poliza» encuentra «póliza». Sería un problema si la función se usara para mostrar texto, y no es el caso — el test que decía lo contrario era el que estaba mal.

**La puntuación desordenaba los encabezados, y la captura fue la que lo destapó.** Ordenar por relevancia intercala grupos: con la consulta «a» la lista salía «Hoy → Configuración → Acciones → Hoy → Planes → … → Acciones». Cada resultado estaba en su sitio, pero la lista se lee como si estuviera rota — y ningún test lo veía, porque el de grupos solo miraba la lista **sin filtrar**. Ahora `filtrar` reagrupa al final: cada grupo aparece una vez, en la posición que le da su mejor resultado, y dentro conserva el orden por puntuación. Se hace en el filtro y no al pintar porque la vista recorre el array plano para las flechas y el `aria-activedescendant`: el orden que se ve y el que navega el teclado tienen que ser el mismo array. El test nuevo barre las 702 consultas de una y dos letras.

**La cabecera del modal se disuelve con CSS, no tocando `modal.tsx`.** El diálogo genérico pone una franja de cabecera con el título y el botón de cerrar; en la paleta el título va oculto para lectores de pantalla, así que esa franja quedaba vacía y robaba 50 px sobre el campo. `display: contents` en `.modal-head` y en su `div` interno le quita la caja sin sacar nada del DOM: el título sigue siendo el `aria-labelledby` del diálogo —y hay un test que lo comprueba con `toHaveAccessibleName`, porque es justo lo que alguien rompería «limpiando» un elemento que no se ve— y el `.modal-x` pasa a ser hijo directo de `.modal`, donde se posiciona dentro de la fila del campo. Se hace por CSS porque la cabecera es el contrato de **todos** los modales del repo.

**El foco del disparador solo sustituye a un foco huérfano.** La primera versión enfocaba el botón del topbar siempre antes de abrir. Eso arregla el caso de ⌘K desde ninguna parte, pero rompe uno peor: quien estaba escribiendo en el buscador de Transacciones y abre la paleta, al cerrarla aparecía en el buscador de la barra en vez de volver a su campo. Ahora `sustituirFocoHuerfano` mira `document.activeElement` y solo actúa si es el `body` o nada; el resto lo sigue haciendo `Modal`. Hay un test para cada rama.

**`[role="dialog"]` no identifica a la paleta.** `CoachPanel` está montado en todas las pantallas del shell y también es un `dialog`, así que acotar axe con ese selector medía dos cosas a la vez y un `getByRole("dialog")` daba «strict mode violation». El selector es `.modal[role="dialog"]`. El portón seguía dando 0, pero por la razón equivocada.

**El atajo se dibuja tras montar.** `navigator.platform` no existe en el servidor: leerlo durante el render daría HTML distinto en servidor y cliente (#418). El primer render dice ⌘K en todas partes y en Windows/Linux pasa a «Ctrl K» al hidratar.

**La paleta no existe en `/m`.** Se monta en `app-shell`, que es el cascarón web; la app móvil tiene su propio layout y no monta nada de esto. Con la bandera apagada no hay ni listener registrado. Llevarla a `/m` queda anotado para el delta 6.
