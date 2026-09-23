# Prompt 1.6 — feat/mobile-nav-v2 (alcance A: alinear `/m` con nav-v2 sin reintroducir la barra)

---

Delta 6, **alcance A**: «alinear `/m` con nav-v2 sin reintroducir la barra». Rama desde `main` actualizado. Todo bajo `navV2Enabled()`.

Restricciones duras: `mobile.css` no se toca; FAB no se toca; ninguna regla nueva de `position` ni `z-index` dentro de `.m-shell`; `rutas-web-a-mobile.ts` se deja como está; `src/modules/**` y `src/lib/ai/**` intactos.

1. `m/lib/nav-v2-movil.ts` (puro): `gruposDrawerV2()`, `eyebrowDeRuta()`, `pestanasMovilDe()`.
2. `m/components/nucleo-tabs-movil.tsx`: enlaces con `aria-current`, dentro de un `<nav aria-label="Secciones de …">`, reutilizando `.m-seg` / `.m-seg-item`. No es `role="tablist"`.
3. `m/nav-v2-movil.css`: solo si `.m-seg` no soporta desbordamiento horizontal; prefijo `mn2-`, sin `position`, sin `z-index`.
4. `mobile-menu.tsx` y `mobile-header.tsx`: bajo bandera, grupos del modelo y eyebrow del núcleo.
5. Tests unitarios, Playwright con bandera ON a 390, axe sobre `/m`.
6. QA visual OFF contra la base y ON contra la base OFF.
7. Docs y commits separados.

---

## Lo que se hizo, y prevalece

**La decisión A, y por qué: la barra inferior se retiró a propósito.** `m/(app)/layout.tsx:25-28` deja escrito que las cuatro pestañas «duplicaban cuatro de los trece destinos que el menú ☰ del header ya ofrece en TODAS las pantallas, a cambio de 64px de alto fijos». Este delta **no la reintroduce**: unifica el MODELO, no la barra. Lo que cambia es de dónde salen los destinos del drawer y el eyebrow —del modelo v2 en vez de una tabla escrita a mano que replicaba el sidebar v1— y se añade la navegación entre hermanas de un núcleo, que en `/m` sencillamente no existía: se iba y se volvía por el ☰ o por la flecha «Atrás». Reintroducir la barra habría sido deshacer una decisión tomada con argumentos, sin argumentos nuevos.

**Los destinos se derivan, no se copian.** `gruposDrawerV2()` recorre `NUCLEOS` y `CONFIGURACION` y resuelve cada pestaña con `aMovil` sobre su ruta **web**, en vez de leer `pestana.hrefM` directo. El resultado es el mismo hoy; la diferencia es que así el emparejamiento pasa siempre por la tabla del modelo, y una pestaña que pierda su par lo pierde en los dos sitios a la vez. La tabla `MENU` de la bandera apagada se conserva intacta.

**Tres pestañas quedan fuera, y ninguna por olvido.** `suscripcion` no tiene ruta móvil **a propósito**: su camino acaba en Stripe, prohibido dentro de la app (Apple 3.1.1), y el móvil tiene `/m/sin-plan` en su lugar. `recurrentes` es `nueva` y `libertad` es `futura`: sus pantallas no son destinos del modelo todavía. El test lo fija por nombre, para que quitarlas o añadirlas sea una decisión y no un efecto.

**El eyebrow lo pone el modelo, pero la prop sigue mandando donde no hay núcleo.** Bajo bandera, `EyebrowNucleo` muestra el nombre del núcleo de la ruta actual; donde `eyebrowDeRuta` devuelve `null` —Configuración existe en la tabla pero no cuelga de ningún núcleo— cae a la prop `eyebrow` que pasa la página. Las 18 páginas que la pasan no se tocaron, y con la bandera apagada el header es exactamente el de hoy.

**`MobileHeader` es de servidor, y el pathname es de cliente.** Las dos piezas que dependen de la ruta —el eyebrow y las pestañas— son componentes de cliente que resuelven el pathname por su cuenta. La alternativa era pasar la ruta desde las 18 páginas, o hacer `MobileHeader` async para leer `headers()`, que fuerza render dinámico en todas ellas y cambia el comportamiento con la bandera apagada. Un fragmento envuelve `<header>` + pestañas: no crea caja, así que el `<header>` sigue siendo el primer hijo de `.m-pad` y `.m-scroll:has(.m-topbar)` —que es quien aporta el inset superior— sigue casando.

**Las pestañas van FUERA del `<header>`.** Dentro competirían por el ancho con el título y las acciones, que ya están ajustadas al milímetro tras el delta 3. Fuera, ocupan su propia fila y pueden desplazarse.

**`.m-seg` no servía tal cual, y por eso existe la hoja nueva.** Reparte el ancho con `flex: 1` porque nació para dos o tres opciones cortas; con las cuatro de Flujo o Patrimonio a 390 px cada una baja de ~70 px y «Transacciones» se parte. `nav-v2-movil.css` añade `overflow-x`, `flex: 0 0 auto` y `white-space: nowrap` con prefijo `mn2-`, **sin una sola regla de `position` ni `z-index`**: la escalera de capas de `.m-shell` está calibrada al detalle (topbar 20, FAB 50, drawer 60, hojas 70, diálogos 80, toast 90) y una regla nueva ahí es justo lo que rompió el drawer del escritorio en #817. También declara `text-decoration: none`, porque `.m-seg-item` nació para `<button>` y acá son `<a>` que heredan el subrayado — la lección de la landing, aplicada antes de que muerda.

**No es `role="tablist"`, igual que en la web.** Un tablist promete paneles que se intercambian en la misma pantalla; esto son rutas, y anunciarlo así haría que un lector de pantalla esperara flechas para moverse entre paneles que no existen. Son enlaces con `aria-current="page"`. El test comprueba además que no aparezca ningún `tablist` en la pantalla.

**Una pestaña sola no es una barra.** `pestanasMovilDe` devuelve `[]` con menos de dos hermanas, así que Asesor —que tiene una sola pantalla— no pinta nada. Sin esa regla, la barra sería un título repetido.

**El `?tab=` desempata, y por eso `pestanasMovilDe` acepta el `search`.** El prompt pedía la firma con solo el pathname, pero `/m/mis-acciones` y `/m/mis-acciones?tab=progreso` comparten ruta: sin el segundo parámetro, «Progreso» nunca se marcaría activa. Se traduce a web y se delega en `pestanaDeRuta`, que ya resuelve ese desempate, en vez de repetirlo sobre la columna móvil.

**Veredicto sobre las pestañas en Inicio: se quedan.** La duda era si competían con el carrusel. Medido, no estimado: las pestañas ocupan `y 84-132` y el carrusel `y 1174-1381` — más de mil píxeles de scroll entre ambos, en una página de 2141 px. No hay competencia visual ni de gesto. Además, la variante `home` del header no se toca: mantiene isotipo y saludo, y las pestañas cuelgan debajo.
