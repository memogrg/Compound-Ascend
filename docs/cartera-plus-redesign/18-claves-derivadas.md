# 18 · Las líneas derivadas y su gasto real no comparten clave

**Inventario, solo lectura. No cambia nada; la decisión es de Memo.**

Salió de dos avisos falsos en la campana de la cuenta de demo:

```
Casi no usás Aporte — Fondo de emergencia · ₡200.000 al mes y en 3 meses usaste ₡0
Casi no usás Otras deudas                 · ₡620.680 al mes y en 3 meses usaste ₡0
```

En esa misma ventana hay **₡400.000 de aportes reales** al fondo (julio y agosto) y **tres cuotas
pagadas**. El ₡0 no es un dato del usuario: es que las dos mitades se cuentan con claves distintas.

## Las dos claves

|                      | dónde                        | regla                                                     |
| -------------------- | ---------------------------- | --------------------------------------------------------- |
| presupuesto, gasto   | `budget-service.ts:746`      | `category_id` ?? `name:<nombre en minúsculas>`            |
| presupuesto, ingreso | `budget-service.ts:742`      | `<nombre en minúsculas>`                                  |
| real, gasto          | `transaction-service.ts:757` | `category_id` ?? `sin_categoria`                          |
| real, ingreso        | `transaction-service.ts:735` | `merchant_or_source` ?? `description` ?? «Otros ingresos» |

## Por `source_kind`

| `source_kind` | categoría de la línea                                                       | categoría de la transacción                                                                  | ¿coinciden?                                                                                                    |
| ------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `goal`        | **`null`** (`derived-budget-service.ts:219`) ⇒ clave `name:aporte — <meta>` | la app la crea con **`categoryId: null`** (`control-service.ts:640`) ⇒ clave `sin_categoria` | **Nunca.** Y aunque la transacción tuviera categoría, la línea no la tiene                                     |
| `debt`        | categoría de sistema «deudas» (`derived-budget-service.ts:205`)             | la app usa **la misma** (`control-service.ts:499`)                                           | **Sí**, por la app. En la demo NO, porque el sembrador categorizó los pagos por deuda («Hipoteca», «Vehículo») |
| `policy`      | categoría de sistema «seguros»                                              | el pago de prima va por el mismo camino de transacción vinculada                             | sí, por construcción                                                                                           |
| `rental`      | `null`, y es una línea de **ingreso** ⇒ clave `ingreso — <posición>`        | se concilia por `income_source_id` (`relinkRentalReceipts`), **no** por clave                | no aplica: tiene enlace explícito, que es mejor                                                                |
| `holding`     | no existe como `source_kind` de presupuesto                                 | las compras van con `linked_kind='holding'`                                                  | no aplica                                                                                                      |

## Los números, en producción

Ventana: los tres periodos cerrados/en curso más recientes. Filtrado por hogar, **solo conteos**:
ninguna cifra de dinero, ningún nombre, ningún id de persona. «Con pareja» = existe al menos una
transacción de ESE hogar con la misma clave en la ventana.

```
source_kind        líneas   con pareja   sin pareja   (hogar sin movs)   hogares
debt                    9            0            9                  0         1
goal                   63            0           63                  0         3
policy                  9            0            9                  0         1
rental                 21            0           21                  0         1
```

**102 líneas derivadas, 0 con pareja.** Para comparar, la base local —donde las cuentas de
certificación registran sus pagos POR LA APP— da `debt 30/39 con pareja`, que es justo la
diferencia: por la app las claves coinciden; sembradas o importadas, no.

## Qué habría que cambiar

**`control-service.ts:640`** — el aporte a una meta nace con `categoryId: null` («Sin categoría
fija: el tipo de meta varía; linked_kind='goal' basta»). Para el vínculo basta, sí; para el
presupuesto no, porque el sobre se agrupa por categoría. Opciones:

1. **Categoría de sistema «metas»**, como ya hacen deudas y seguros. Es la más barata y la más
   consistente: una línea, y las tres familias derivadas se comportan igual.
2. **La categoría de la meta**, si algún día las metas tienen una. Más fino, pero hoy no existe
   ese campo y habría que crearlo.

**`derived-budget-service.ts:219`** — la línea derivada de la meta nace con `categoryId: null`.
Tiene que recibir **la misma** que elija el punto anterior, o el arreglo solo mueve el problema.

### La migración de datos que exigiría

Las transacciones de aporte ya escritas (`linked_kind='goal'`) se quedarían con su categoría
vieja: `null` las de la app, la que puso el sembrador las de la demo. Para que el histórico
cuadre haría falta un `UPDATE ... SET category_id = <metas> WHERE linked_kind = 'goal' AND
category_id IS NULL`, acotado por hogar y **solo** sobre las que tienen `null` — nunca
sobrescribir una categoría que alguien eligió a mano.

Y **eso toca meses cerrados**, que es justo lo que el plan 15 prohíbe al cron. Así que si se hace,
se hace como migración explícita y anunciada, no desde una carga de pantalla ni desde un barrido.

## Mientras tanto

El PR que acompaña este documento **no arregla las claves**: hace que el detector de sobres
ociosos ignore toda línea derivada. Un sobre derivado no admite la pregunta «¿lo usás?» —no se
gasta desde él, se genera desde su entidad—, así que el aviso era falso incluso si las claves
coincidieran. Los sobres manuales subutilizados siguen avisando.
