# 19 · Inventario de gráficos de producción (delta 2.7)

**Solo lectura.** Qué gráfico usa qué, y cuál primitiva del catálogo lo reemplaza.

## El hallazgo

**Ningún gráfico de producción usa el núcleo.** `ChartFrame` —el marco con los cuatro estados de
la misma altura, la tabla accesible y el foco de teclado— aparece exactamente en un sitio fuera
del catálogo: en su propio archivo. Todo lo demás usa los envoltorios de `charts/lazy.tsx`, que
son los gráficos _sin_ marco.

Lo que eso significa en la práctica: en producción **no hay tabla de datos, ni estados de carga
con altura conservada, ni recorrido por teclado** en ninguna gráfica. El núcleo se construyó y se
probó en `/dev/ui`, y ahí se quedó.

## Web

| archivo                                        | gráfico                                | tipo        | primitiva del catálogo      |
| ---------------------------------------------- | -------------------------------------- | ----------- | --------------------------- |
| `financial-base/components/v2/sections.tsx`    | ×3 `PerformanceChart`                  | área        | `#gr-area` con `ChartFrame` |
| `financial-base/components/v2/sections.tsx`    | `PremiumLineChart`                     | línea       | `#gr-linea`                 |
| `financial-base/components/v2/sections.tsx`    | `DonutConLeyenda`                      | dona        | `#gr-dona`                  |
| `financial-base/components/v2/sections.tsx`    | `HistoricoGasto`                       | columnas    | **ya es del núcleo**        |
| `dashboard/components/dashboard-view.tsx`      | `DonutConLeyenda`                      | dona        | `#gr-dona`                  |
| `rich-life/components/rich-life-dashboard.tsx` | `DonutConLeyenda`                      | dona        | `#gr-dona`                  |
| `wealth/components/portfolio-view.tsx`         | `PerformanceChart` + `DonutConLeyenda` | área + dona | `#gr-area`, `#gr-dona`      |
| `wealth/components/indicators-view.tsx`        | `PerformanceChart`                     | área        | `#gr-area`                  |
| `wealth/components/growth-view.tsx`            | `DonutConLeyenda`                      | dona        | `#gr-dona`                  |
| `wealth/components/holding-detail-modal.tsx`   | `PerformanceChart`                     | área        | `#gr-area`                  |
| `control/components/debts-view.tsx`            | `PerformanceChart`                     | área        | `#gr-area`                  |
| `control/components/debt-detail.tsx`           | `PerformanceChart`                     | área        | `#gr-area`                  |

## `/m`

Tiene **su propia implementación paralela**, que no comparte nada con el núcleo ni con los
envoltorios web:

| archivo                                              | gráfico                    | tipo            | primitiva del catálogo           |
| ---------------------------------------------------- | -------------------------- | --------------- | -------------------------------- |
| `m/components/m-scrub-chart.tsx`                     | `MScrubChart`              | línea con scrub | `#gr-linea` + fijado del tooltip |
| `m/components/m-donut.tsx`                           | `MDonut`                   | dona            | `#gr-dona`                       |
| `m/(app)/patrimonio/page.tsx`                        | `MScrubChart`, `MDonut`    |                 |                                  |
| `m/(app)/inversiones/page.tsx`, `holding-detail.tsx` | `MScrubChart` ×2, `MDonut` |                 |                                  |

Son **dos donas y dos líneas distintas** para las mismas preguntas. Unificarlas es la mitad del
valor de la 2.7; la otra mitad es que al pasar por `ChartFrame` ganan tabla, estados y teclado.

## El formato compacto: NO son dos implementaciones

`₡66,7 M` y `₡1,5M` salen de dos funciones de `lib/format.ts`, y la diferencia **está razonada
en el propio archivo**:

- `formatCompact` → texto: `₡163,3 mil`, `₡18,2 M`. Con la palabra «mil» y espacio.
- `formatAxisCompact` → ejes: `₡607K`, `$1,2M`. Un solo token, «porque "163,3 mil" se parte en
  un eje de ~46 px».

Colapsarlas en una sola rompería una de las dos cosas: o el eje angosto, o la legibilidad del
texto. **Lo que sí hay que decidir es qué superficie usa cuál**, porque hoy conviven en la misma
pantalla sin una regla escrita: el centro de la dona usa `formatCompact` (`sections.tsx:458`) y
el eje de al lado usa `formatAxisCompact`.

Propuesta para `10-decisions.md`, para que Memo la confirme o la cambie:

> **Texto → `formatCompact`. Ejes y etiquetas dentro de un gráfico → `formatAxisCompact`.**
> El centro de una dona es TEXTO (es la cifra principal de la tarjeta), así que va con
> `formatCompact`. La regla se aplica sin excepciones: dos cifras del mismo dato en la misma
> pantalla pueden verse distintas, y eso es correcto si una está dentro del gráfico y la otra no.

## «ago 26»: no son tres implementaciones, son dos — y la segunda está repartida

Medido:

- `formatMonthShort` (`lib/format.ts:276`) — la buena: tabla propia de meses, año a dos dígitos.
- `formatoEjeX` (`charts/core/theme.ts:183`) — **delega** en la anterior tras comprobar el
  formato. No es una copia.
- **`/m` no tiene una, tiene seis**: `toLocaleDateString` suelto en `deudas/page.tsx`,
  `deudas/debt-manager.tsx`, `indicadores/page.tsx`, `patrimonio/page.tsx`,
  `inversiones/holding-detail.tsx` y alguno más — y ni siquiera con la misma configuración
  regional: unas dicen `es-MX` y otras `es-CR`.

O sea que el problema no es que haya tres funciones compitiendo, sino que **`/m` no usa ninguna**.
Con `es-MX` y `es-CR` mezclados en la misma app, dos pantallas pueden abreviar el mismo mes
distinto sin que nadie lo note, porque cada una lo pide a la biblioteca por su cuenta.

Arreglo: `/m` pasa por `formatMonthShort` como el resto. Es un cambio de una línea por archivo y
no depende de la migración al núcleo, así que puede ir antes y por separado.
