# CARTERA+ · Rediseño UX — Navegación

_Extraído del blueprint maestro (16-sep-2026). Fuente viva: https://claude.ai/code/artifact/0e037de8-78ec-44fd-b4ef-3ea701eea331_

## 7. Navigation proposal

La navegación se reparte en tres capas: **global** (sidebar de 5 + barra superior), **de núcleo** (pestañas bajo el título) y **contextual** (drill-down, enlaces cruzados, paleta ⌘K). Todo lo que no es una de esas tres capas se elimina.

**Sidebar web (escritorio y tablet ≥ 1024 px)**

| Ítem | Icono | Contador | Destino |
| --- | --- | --- | --- |
| Hoy | casa | acciones pendientes | `/dashboard` |
| Flujo | flechas | transacciones por revisar | `/mi-base-financiera` (resumen) |
| Planes | bandera | metas en riesgo | `/control-financiero` |
| Patrimonio | edificio/columna | — | `/mi-rich-life` |
| Asesor | isotipo C+ | — | `/asistente` |
| (pie) Configuración · usuario · salir | engrane | — | `/configuracion` |

- Ancho 248 px (se conserva `--sidebar-w`), colapsable a 64 px con solo iconos (tooltip con el nombre); el estado colapsado se recuerda por navegador.
- Sin subgrupos ni etiquetas de sección: 5 ítems planos. Las pestañas del núcleo activo pueden desplegarse debajo del ítem cuando el sidebar está expandido (patrón Linear), pero es opcional; la barra de pestañas de la página es la fuente de verdad.
- El riel del viaje (Estabilidad → … → Crecimiento estructurado) aparece como una franja compacta al pie del sidebar: etapa actual y siguiente hito. Enlaza a Hoy → Progreso.

**Barra superior**

- Izquierda: título del núcleo y breadcrumb real (Flujo / Gastos / Supermercado) generado desde `nav.ts`.
- Centro: **selector de periodo global** (mes con flechas ‹ ›, o rango 3m / 6m / 12m / año / personalizado) con chip de comparación («vs mes anterior»). Es el único control de tiempo de la app; persiste en URL (`?p=2026-09` o `?p=2026-04..2026-09`) y en `localStorage` para la próxima visita.
- Derecha: búsqueda / paleta ⌘K (real), moneda de visualización, ocultar montos (ojo), campana, tema, avatar.

**Paleta de comandos ⌘K / Ctrl K** (`cmdk`, base de `Command` en shadcn): ir a cualquier pantalla o pestaña; buscar transacciones, holdings, deudas, metas y sobres por nombre; acciones rápidas («Registrar gasto», «Registrar ingreso», «Aportar a meta», «Preguntar al asesor»); cambiar periodo («ir a agosto»). Sustituye el campo decorativo actual.

**Móvil (app `/m` y web < 768 px)**

- Barra inferior de 5: Hoy · Flujo · Planes · Patrimonio · Asesor. El isotipo C+ del Asesor en disco blanco, como manda la regla de marca.
- Botón flotante «+» sobre la barra (registrar gasto / ingreso / escanear recibo), que ya existe como `quick-add-buttons` en Flujo y pasa a ser global.
- Las pestañas del núcleo van como segmented control horizontal bajo el título, con scroll.
- El menú ☰ desaparece: todo es alcanzable con barra + pestañas + avatar (Configuración). Se mantiene el swipe desde el borde solo para «atrás».
- El selector de periodo va bajo el título, no arriba (Copilot lo hace así en iOS por alcance del pulgar).

**Navegación contextual (la que más reduce clics):**

- Cada KPI enlaza a su pestaña con el periodo activo.
- Cada segmento de gráfico enlaza a Transacciones con `?cat=`, `?sobre=`, `?comercio=` y el periodo.
- Cada objeto (deuda, meta, holding, póliza) abre en un drawer lateral en escritorio y en una página hija en móvil.
- Cada tarjeta lleva un icono de destello que abre el Asesor con el contexto de esa tarjeta («¿por qué subió mi gasto en transporte?»).
- Breadcrumb y botón «atrás» consistentes porque las pestañas viven en la URL.

**Qué se elimina:** los grupos Resumen/Presupuesto/Control/Crecimiento/Perfil, la lista `MENU` duplicada del móvil, el campo de búsqueda sin función, el ítem permanente «Mi configuración» (pasa a Configuración y a la tarjeta de Hoy mientras falte algo), y las pestañas por `#hash`.



## 8. Screen inventory

Después de la reorganización existen 19 pantallas de producto (17 hoy más Recurrentes y Libertad como pantallas propias), 6 vistas de detalle y 6 pantallas de cuenta/configuración. Cada una lleva su pregunta, su dato principal y su tipo de plantilla, para que ninguna se diseñe desde cero.

| # | Pantalla | Existe para responder… | Dato principal | Plantilla | Origen |
| --- | --- | --- | --- | --- | --- |
| 1 | Hoy · Panel | ¿Cómo voy hoy y qué hago? | Libre para gastar + veredicto patrimonial | Historia (sección 10) | Rediseño |
| 2 | Hoy · Acciones | ¿Qué acciones y decisiones tengo pendientes? | N.º de acciones y su impacto | Bandeja | Mis acciones |
| 3 | Hoy · Progreso | ¿En qué etapa estoy y qué me falta? | Etapa actual del viaje | Riel + score | Mis acciones + Salud |
| 4 | Flujo · Resumen del mes | ¿Cerré el mes como lo planeé? | Flujo libre real vs presupuestado | Dashboard analítico | Mi Base Financiera |
| 5 | Flujo · Ingresos | ¿Cuánto entró, de dónde y qué tan estable? | Ingreso del periodo vs esperado | Dashboard analítico | Ingresos |
| 6 | Flujo · Gastos y sobres | ¿Dónde se va el dinero y cuánto queda por sobre? | Gasto del periodo vs presupuesto | Dashboard analítico + lista de sobres | Gastos |
| 7 | Flujo · Transacciones | ¿Qué movimientos hubo y cuáles faltan por revisar? | Total del filtro activo | Tabla con bandeja | Transacciones |
| 8 | Flujo · Recurrentes | ¿Qué se cobra y se paga solo, y cuándo? | Compromisos próximos 30 días | Calendario + lista | **Nueva** |
| 9 | Planes · Metas | ¿Avanzo al ritmo necesario? | Metas al día / en riesgo | Tarjetas con estado | Ahorro |
| 10 | Planes · Deudas | ¿Cuándo quedo libre y cuánto me cuesta? | Fecha libre de deudas + intereses | Dashboard analítico | Deudas |
| 11 | Planes · Fondos | ¿Cuántos meses de colchón tengo? | Meses cubiertos | Medidor + metas | Defensa (fondos) |
| 12 | Patrimonio · Resumen | ¿Me estoy haciendo más rico? | Patrimonio neto y su variación | Dashboard analítico | Rich Life |
| 13 | Patrimonio · Inversiones | ¿Cómo rinden y cómo están repartidas? | Valor actual, aportes vs crecimiento | Dashboard analítico | Portafolio |
| 14 | Patrimonio · Protección | ¿Qué tengo cubierto y qué vence? | Cobertura y próximo vencimiento | Mapa de cobertura | Defensa (pólizas) |
| 15 | Patrimonio · Libertad | ¿Qué tan cerca estoy y qué la acerca? | % del capital objetivo | Escenarios con supuestos | Rich Life (termómetro, escalera) + `/m/libertad` |
| 16 | Patrimonio · Indicadores | ¿Qué pasa afuera y qué me afecta? | Tipo de cambio, tasas, inflación | Series + lectura | Indicadores |
| 17 | Asesor | Preguntar, registrar, decidir | Conversación | Chat con tarjetas | Asistente |
| 18 | Sin plan / reanudar | Volver a activar el plan | — | Muro | `/suscripcion`, `/m/sin-plan` |
| 19 | Bienvenida | Primer día | — | Onboarding | `/bienvenida` |

**Vistas de detalle (drawer en escritorio, página hija en móvil):** deuda (`/deudas/[id]`), holding (hoy `holding-detail-modal`), meta (hoy `goal-detail-button`), sobre (hoy `jar-*-modal`), póliza, transacción (edición y vínculo).

**Cuenta y configuración:** Perfil financiero y ADN, Hogar (miembros e invitaciones), Cuenta y plan (facturación, moneda, zona horaria, notificaciones, exportar, eliminar), Asistentes de configuración (4 wizards), Correo e importación (dirección de ingesta, tarjetas, reglas), Categorías y sobres (gestor de categorías).

**Estados obligatorios por pantalla** (definidos una vez en la plantilla, no por pantalla): cargando (skeleton de la misma altura), vacío por primera vez (enseña el siguiente paso), vacío por filtro («no hay movimientos en abril con este filtro» + limpiar), datos parciales (etiqueta «con datos incompletos» en scores y proyecciones), error (reintentar), sin conexión (móvil), conjunto grande (virtualización en Transacciones).


