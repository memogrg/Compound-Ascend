# Feed de mercado

Precios, ATH (cripto) y máximo de 52 semanas (acciones/ETF) de los activos que la gente tiene
cargados. La app, el asesor, la valuación y las alertas **leen del store** `market_price_cache`;
casi nunca le pegan a un proveedor en vivo.

## Dos caminos, una sola capa

| camino | dónde corre | cuándo | lee las llaves de |
|---|---|---|---|
| **Colector** — `scripts/market-data-collect.ts` | GitHub Actions | cada hora | secrets y variables del Action |
| **En vivo** — `src/lib/market-data/providers.ts` | Vercel | cuando el store no tiene el dato fresco | env de Vercel |

Los dos hablan con los proveedores a través de la misma capa, `src/lib/market-data/vendors/`. Ahí
hay **una** implementación de cada proveedor, detrás de un contrato único (`getQuotes` /
`getHighlights`). Cambiar de proveedor es cambiar variables, no código.

El colector corre en GitHub y no en Vercel porque desde Vercel CoinGecko no respondía (timeouts
hasta para BTC, y el store terminaba en $0).

## Las llaves viven en DOS lugares

**Esto ya costó una vuelta.** El `FINNHUB_TOKEN` del Action devolvió 401 desde el 2026-08-23, y
durante más de diez días nadie lo notó: la app seguía mostrando precios frescos de los ETF porque
el camino en vivo, con **otro** token (el de Vercel), los escribía cuando alguien abría Patrimonio.

Cada llave se carga en los dos lados, por separado:

| variable | Actions | Vercel | para qué |
|---|---|---|---|
| `MASSIVE_API_KEY` | secret | env | Massive, si está en la cadena de acciones |
| `TWELVEDATA_API_KEY` | secret | env | Twelve Data, si está en la cadena de acciones |
| `FINNHUB_TOKEN` | secret | env | Finnhub (respaldo) **y** el buscador de símbolos de la app |
| `COINGECKO_API_KEY` | secret | env | CoinGecko. Opcional: sin ella, API pública |
| `COINGECKO_API_PLAN` | variable | env | `pro` con cualquier plan pago. Ver abajo |
| `MARKET_PROVIDER_STOCKS` | variable | env | cadena de acciones/ETF |
| `MARKET_PROVIDER_CRYPTO` | variable | env | cadena de cripto |
| `MARKET_EXCHANGE_SUFFIXES` | variable | env | bolsas extra para Twelve Data |
| `MARKET_BUDGET_*`, `MARKET_RUNS_PER_DAY` | variable | — | guarda de costo; solo la lee el colector |

Al rotar una llave: **las dos**. Al cambiar de proveedor: **los dos**, y la cadena también.

## Elegir proveedor

La cadena es una lista en orden. El primero es el primario; los demás, respaldos que reciben
**solo** lo que los anteriores no resolvieron.

```
MARKET_PROVIDER_STOCKS=massive,finnhub     # Massive primario, Finnhub free de respaldo
MARKET_PROVIDER_STOCKS=twelvedata,finnhub  # Twelve Data primario
MARKET_PROVIDER_CRYPTO=coingecko
```

Sin setear, la cadena es la de siempre: `finnhub` para acciones y `coingecko` para cripto. Un
nombre mal escrito se descarta con aviso en el log.

### Massive vs. Twelve Data, lo que importa para decidir

| | Massive Stocks Starter | Twelve Data |
|---|---|---|
| Bolsas | **solo EE. UU.** | EE. UU. + Londres y otras |
| ETF UCITS (`VWRA.L`) | no los tiene: caen al respaldo | sí: `VWRA.L` → `VWRA:LSE` |
| Precio | 1 llamada para todos (snapshot) | 1 llamada para todos (lote) |
| Máximo 52 semanas | 1 llamada **por símbolo** (barras del año), con fecha | viene en la misma llamada, **sin fecha** |
| Cómo cobra | llamadas ilimitadas | **1 crédito por símbolo**, aunque vayan en lote |
| Frescura | 15 min diferido | según plan |

Con Finnhub free de respaldo, **un ETF de Londres no lo cotiza nadie** si el primario es Massive:
Finnhub free tampoco cubre Londres. Con la configuración de antes (`finnhub` solo) eso ya pasaba:
`VWRA.L` no se recolectaba nunca.

Twelve Data cotiza muchos instrumentos de Londres **en peniques** (`GBp`). El adaptador los pasa a
libras antes de guardarlos; sin eso un ETF de £98 quedaría como 9.800.

### CoinGecko: pasar de Demo a un plan pago

Los planes pagos (Basic incluido) usan otro host y otro header:

| plan | host | header |
|---|---|---|
| demo | `api.coingecko.com/api/v3` | `x-cg-demo-api-key` |
| pago | `pro-api.coingecko.com/api/v3` | `x-cg-pro-api-key` |

Mezclarlos **no degrada: falla**. Y las dos llaves no se distinguen mirándolas. Por eso el plan se
declara aparte con `COINGECKO_API_PLAN=pro`, y el cambio va **junto**: llave nueva + `pro`, en los
dos lugares, a la vez.

## Guarda de costo

El colector cuenta **créditos** por proveedor —lo que factura cada plan, no requests— y al final de
cada corrida imprime:

```
créditos coingecko: 1 esta corrida → ~24/día · tope 3300/día (1%)
créditos twelvedata: 3 esta corrida → ~72/día · tope 60/día (120%) — a este ritmo el plan se agota
```

El tope se configura en créditos por día: `MARKET_BUDGET_DAILY_COINGECKO=3300` (el Basic trae
100.000 al mes ÷ 30). Al pasar `MARKET_BUDGET_WARN_RATIO` (0.8 por defecto) sale un `::warning::`;
al pasar el 100%, un `::error::`. Ninguno de los dos corta la corrida.

Dos cosas que conviene saber:

- **Es una proyección.** Cada corrida es un proceso nuevo y no hay dónde guardar un acumulado sin
  migración: el "diario" es lo de esta corrida × `MARKET_RUNS_PER_DAY` (24). Es exacto mientras la
  cantidad de símbolos no cambie a mitad del día.
- **No ve el camino en vivo.** Vercel gasta del mismo plan si usa la misma cuenta, y el colector no
  lo cuenta. Por eso el aviso es al 80% y no al 100%.

## Autoverificación

El colector falla la corrida (y GitHub avisa por mail) en dos casos. En los dos **escribe primero**
lo que sí consiguió:

1. **Un tipo de activo entero sin precios.** Había acciones objetivo y ningún proveedor de la cadena
   trajo precio válido. El mensaje nombra la cadena y las llaves a revisar.
2. **El primario no resolvió nada.** Con cadena de más de uno, si el primario devolvió cero precios
   válidos, falla aunque el respaldo haya cubierto todo. Es el mismo silencio de Finnhub un piso más
   arriba: un proveedor pago con la llave vencida, tapado por el respaldo gratis, mientras la corrida
   sale verde. Si falla por esto, es la llave **o** que ese proveedor no cotiza esos símbolos.

Además, al arrancar avisa si un proveedor está en la cadena y **no tiene llave**: no falla, devuelve
vacío, y es exactamente como se esconde un 401.

## Nunca un $0

Un precio ≤0, `null` o `NaN` no se escribe: la fila del store conserva el último precio bueno y su
fecha. Un máximo inválido no se manda (ni en `null`), así que tampoco pisa el bueno de antes. Un
proveedor que devuelve 0 para un símbolo cuenta como que falló para ese símbolo, y el símbolo pasa
al siguiente de la cadena.

## Correr el colector a mano

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FINNHUB_TOKEN=... \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/market-data-collect.ts
```

Node ≥22.18 (el workflow usa 24). No hace falta `npm install`: el script y todo lo que importa es
TypeScript sin dependencias, y Node le quita los tipos al vuelo. Por eso los archivos de `vendors/`
se importan entre sí con la extensión `.ts` y no usan `@/`.
