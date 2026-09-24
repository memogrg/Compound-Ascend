# CARTERA+ · Paleta categórica validada para daltonismo

Medición del 2026-09-24. Método: sRGB → CIELAB (D65), **ΔE76**, y simulación de dicromacia
**Viénot–Brettel** en espacio LMS — la misma implementación que corre en
`tests/unit/contraste-paleta.test.ts`, no una copia.

## Qué estaba mal

`tokens.css` y `12-progress.md` decían «paleta validada para daltonismo» desde el 16 de
septiembre. **Nadie lo había medido.** Al medirlo fallaban **tres** pares, no uno:

| par | visión | ΔE claro | ΔE oscuro | qué significa |
| --- | --- | --- | --- | --- |
| `--chart-2` / `--chart-4` (azul / morado) | protanopía | 3,3 | **1,2** | por debajo del umbral de percepción (~2,3): el **mismo color** |
| `--chart-1` / `--chart-5` (verde / rojo) | protanopía | 5,3 | 6,0 | la confusión clásica, y son «positivo» y «negativo» |
| `--chart-1` / `--chart-2` (verde / azul) | tritanopía | 6,9 | 3,6 | |

Los dos últimos se escaparon del test anterior porque solo miraba el **mínimo global**.

El par azul/morado además **convive en la misma pantalla**: en `/mi-rich-life`, «Inversión»
usa `--chart-2` y la rampa de pasivos se construye sobre `--chart-4`.

## Por qué la luminosidad y no el tono

La dicromacia colapsa un eje del color, así que **el tono deja de ser un canal fiable**. Lo
que sobrevive es la **luminosidad**. Por eso la corrección no es «re-espaciar los tonos»
—que era la hipótesis— sino separar en L los vecinos que competían. Y por eso la candidata
B (girar el morado hacia el fucsia) **no compra nada**: paga 3× más desvío para llegar al
mismo piso.

## Objetivo

- ΔE ≥ 8 entre **todos** los pares (los 15), no solo los adyacentes. «Adyacente» es un
  orden de la leyenda, no del ojo — y el par que fallaba no era adyacente.
- Bajo visión normal, protanopía, deuteranopía y tritanopía. En claro y en oscuro.
- Contraste ≥ 3:1 contra la superficie de tarjeta (WCAG 1.4.11).
- `--chart-1`, el verde de marca, **no se toca**.

## Las dos candidatas

| | `--chart-2` | `--chart-4` | `--chart-5` | desvío total (claro / oscuro) | mín. ΔE |
| --- | --- | --- | --- | --- | --- |
| actual claro | `#3a6ea5` | `#7b5ea7` | `#c34f4b` | — | **3,3** ✗ |
| actual oscuro | `#5a8ccb` | `#9b7cc8` | `#d46460` | — | **1,2** ✗ |
| **A** claro | `#36679b` | `#8163b0` | `#bc4845` | **8,7** | 8,0 ✓ |
| **A** oscuro | `#689ce0` | `#9a7bc7` | `#ce605d` | **8,8** | 8,0 ✓ |
| B claro | `#356da5` | `#965186` | `#bc4845` | 23,6 | 8,0 ✓ |
| B oscuro | `#4584c9` | `#b56fa4` | `#ce605d` | 27,3 | 8,1 ✓ |

`--chart-1`, `--chart-3` y `--chart-6` no cambian en ninguna de las dos.

### Recomendación: A

Mismo piso de ΔE que B con **un tercio del desvío**, y sin mover ningún tono: la paleta
sigue pareciendo la misma. Los tres tokens que se mueven lo hacen entre ΔE 0,4 y 6,5 — al
lado, el cambio no se nota.

**B tiene además un defecto medido**: con el morado girado a fucsia, el escalón «pasivo
patrimonial» de la rampa de pasivos cae a **2,97:1** en oscuro, por debajo del 3:1. A lo
deja en 3,06:1.

## Rampas derivadas

La rampa de **pasivos** se construye con `color-mix` sobre `--chart-4`; la del **calendario**,
sobre `--chart-1` (que no cambia, así que el calendario queda idéntico en las dos).

| | peor ΔE de la rampa de pasivos | escalón más bajo vs tarjeta |
| --- | --- | --- |
| actual claro / oscuro | 7,1 / 6,5 (tritanopía) | 3,18:1 / 3,10:1 |
| A claro / oscuro | 6,7 / 6,4 | 3,01:1 / 3,06:1 |
| B claro / oscuro | 6,8 / 6,7 | 3,30:1 / **2,97:1** ✗ |

La rampa se queda por debajo de 8 en las tres, hoy incluida: es una rampa **secuencial** de
un solo tono, donde el orden y la posición ya codifican la magnitud, y el objetivo de ΔE 8
se fijó para los seis tokens **categóricos**. Queda anotado, no resuelto.

## Tablas completas del validador

Los 15 pares × 4 visiones × 2 temas, ordenados del peor al mejor. `<< bajo 8` marca lo que
no llega al objetivo.

```
### ACTUAL · claro   #378451 #3a6ea5 #be862d #7b5ea7 #c34f4b #0f9aa8
par    | normal | protan | deutan | tritan
  2-4  |   26.9 |    3.3 |    5.4 |   27.7   << bajo 8
  1-5  |   82.3 |    5.3 |   19.9 |   72.2   << bajo 8
  1-2  |   66.3 |   61.0 |   58.8 |    6.9   << bajo 8
  2-6  |   35.9 |   26.1 |   21.1 |   15.7
  4-6  |   59.5 |   29.3 |   15.7 |   38.9
  1-6  |   39.2 |   39.8 |   41.8 |   17.1
  1-4  |   84.4 |   64.1 |   54.2 |   22.5
  3-5  |   44.1 |   33.9 |   24.3 |   26.7
  3-4  |   91.0 |   93.5 |   96.5 |   29.8
  1-3  |   60.4 |   30.1 |   44.1 |   49.3
  5-6  |   86.1 |   38.9 |   59.6 |   87.1
  4-5  |   64.2 |   61.4 |   73.0 |   50.4
  2-3  |   90.5 |   90.3 |  101.4 |   55.7
  2-5  |   76.3 |   58.3 |   77.8 |   77.8
  3-6  |   81.7 |   67.6 |   82.6 |   62.8
contraste vs tarjeta: 4.58 5.31 3.16 5.25 4.63 3.38  (mín 3.16)
MÍNIMO GLOBAL ΔE: 3.3

### ACTUAL · oscuro   #3f9560 #5a8ccb #c4862c #9b7cc8 #d46460 #28a2b0
par    | normal | protan | deutan | tritan
  2-4  |   25.9 |    1.2 |    8.8 |   28.4   << bajo 8
  1-2  |   70.6 |   63.9 |   61.3 |    3.6   << bajo 8
  1-5  |   82.3 |    6.0 |   18.2 |   71.3   << bajo 8
  2-6  |   36.0 |   25.7 |   21.6 |    9.7
  4-6  |   57.9 |   26.1 |   13.1 |   37.5
  1-6  |   39.1 |   39.2 |   40.3 |   13.3
  3-5  |   42.2 |   34.9 |   28.0 |   19.0
  1-4  |   86.2 |   64.0 |   53.2 |   25.3
  3-4  |   90.9 |   93.3 |   96.9 |   28.1
  1-3  |   64.8 |   29.7 |   45.4 |   53.3
  5-6  |   81.8 |   35.3 |   56.3 |   83.4
  4-5  |   60.9 |   59.4 |   69.2 |   46.2
  2-3  |   93.8 |   93.2 |  105.2 |   56.3
  2-5  |   74.2 |   59.3 |   77.6 |   74.4
  3-6  |   83.7 |   68.3 |   84.0 |   65.1
contraste vs tarjeta: 4.61 4.91 5.51 4.96 4.70 5.58  (mín 4.61)
MÍNIMO GLOBAL ΔE: 1.2

### A · claro   #378451 #36679b #be862d #8163b0 #bc4845 #0f9aa8
par    | normal | protan | deutan | tritan
  1-5  |   82.7 |    8.0 |   19.3 |   72.8
  2-4  |   28.7 |    8.1 |    8.1 |   27.1
  1-2  |   65.3 |   59.2 |   57.8 |    8.3
  4-6  |   60.6 |   30.0 |   16.5 |   38.1
  1-6  |   39.2 |   39.8 |   41.8 |   17.1
  2-6  |   36.3 |   26.0 |   21.9 |   18.8
  1-4  |   86.2 |   66.0 |   56.2 |   22.2
  3-5  |   44.9 |   35.4 |   25.1 |   28.4
  3-4  |   92.4 |   95.2 |   98.2 |   28.7
  1-3  |   60.4 |   30.1 |   44.1 |   49.3
  5-6  |   86.8 |   39.6 |   59.9 |   87.9
  4-5  |   65.7 |   63.2 |   74.9 |   50.9
  2-3  |   89.6 |   88.8 |  100.7 |   55.4
  2-5  |   75.4 |   56.0 |   76.8 |   77.1
  3-6  |   81.7 |   67.6 |   82.6 |   62.8
contraste vs tarjeta: 4.58 5.88 3.16 4.83 5.06 3.38  (mín 3.16)
MÍNIMO GLOBAL ΔE: 8.0

### A · oscuro   #3f9560 #689ce0 #c4862c #9a7bc7 #ce605d #28a2b0
par    | normal | protan | deutan | tritan
  2-4  |   26.6 |    8.0 |   11.4 |   30.0
  1-5  |   81.8 |    8.1 |   16.6 |   70.7
  2-6  |   37.4 |   27.3 |   24.1 |    8.4
  1-2  |   72.9 |   66.3 |   64.3 |    8.9
  4-6  |   58.0 |   26.2 |   13.1 |   37.5
  1-6  |   39.1 |   39.2 |   40.3 |   13.3
  3-5  |   42.7 |   36.3 |   29.1 |   19.0
  1-4  |   86.3 |   64.1 |   53.2 |   25.3
  3-4  |   90.9 |   93.4 |   96.9 |   28.1
  1-3  |   64.8 |   29.7 |   45.4 |   53.3
  5-6  |   81.2 |   35.0 |   55.3 |   83.0
  4-5  |   60.2 |   58.6 |   68.3 |   45.8
  2-3  |   95.8 |   95.3 |  107.4 |   57.2
  2-5  |   75.5 |   61.6 |   79.1 |   75.3
  3-6  |   83.7 |   68.3 |   84.0 |   65.1
contraste vs tarjeta: 4.61 6.02 5.51 4.89 4.43 5.58  (mín 4.43)
MÍNIMO GLOBAL ΔE: 8.0

### B · claro   #378451 #356da5 #be862d #965186 #bc4845 #0e9aa8
par    | normal | protan | deutan | tritan
  1-5  |   82.7 |    8.0 |   19.3 |   72.8
  1-2  |   66.9 |   61.6 |   60.1 |    8.3
  4-6  |   65.7 |   19.0 |   13.4 |   60.8
  2-6  |   36.3 |   26.8 |   22.6 |   15.5
  2-4  |   40.6 |   15.5 |   29.9 |   51.4
  3-4  |   76.0 |   76.9 |   73.5 |   16.1
  1-6  |   39.2 |   39.8 |   41.8 |   17.1
  3-5  |   44.9 |   35.4 |   25.1 |   28.4
  4-5  |   44.8 |   43.5 |   49.5 |   28.6
  1-3  |   60.4 |   30.1 |   44.1 |   49.3
  1-4  |   81.6 |   47.1 |   30.5 |   44.9
  5-6  |   86.8 |   39.6 |   59.9 |   87.9
  2-3  |   91.4 |   91.0 |  102.8 |   57.0
  2-5  |   77.4 |   58.7 |   79.1 |   79.5
  3-6  |   81.8 |   67.6 |   82.6 |   62.8
contraste vs tarjeta: 4.58 5.41 3.16 5.50 5.06 3.38  (mín 3.16)
MÍNIMO GLOBAL ΔE: 8.0

### B · oscuro   #3f9560 #4584c9 #c4862c #b56fa4 #ce605d #28a2b0
par    | normal | protan | deutan | tritan
  1-2  |   74.0 |   68.3 |   66.3 |    8.1
  1-5  |   81.8 |    8.1 |   16.6 |   70.7
  3-4  |   74.6 |   75.1 |   73.9 |    8.2
  2-6  |   39.0 |   30.7 |   27.3 |    8.4
  4-6  |   63.1 |   10.8 |   10.3 |   58.9
  1-6  |   39.1 |   39.2 |   40.3 |   13.3
  3-5  |   42.7 |   36.3 |   29.1 |   19.0
  2-4  |   42.2 |   23.0 |   37.3 |   54.5
  4-5  |   40.4 |   39.8 |   45.1 |   24.4
  1-3  |   64.8 |   29.7 |   45.4 |   53.3
  1-4  |   82.9 |   45.5 |   30.2 |   46.6
  5-6  |   81.2 |   35.0 |   55.3 |   83.0
  2-3  |   98.0 |   97.6 |  110.5 |   61.3
  2-5  |   76.8 |   62.7 |   81.9 |   78.5
  3-6  |   83.7 |   68.3 |   84.0 |   65.1
contraste vs tarjeta: 4.61 4.38 5.51 4.68 4.43 5.58  (mín 4.38)
MÍNIMO GLOBAL ΔE: 8.1
```
