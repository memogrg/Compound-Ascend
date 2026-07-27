# Alertas de inversión — cadencias

Las alertas (`/api/investments/price-alerts`) se barren en **dos cadencias separadas** por tipo,
para que la alerta de **precio** sea útil para salidas sin pagar Vercel Pro:

| Tipo | Query | Cadencia | Quién la dispara |
|---|---|---|---|
| **Precio** | `?kinds=price` | cada 5 min | **GitHub Action** (`.github/workflows/price-alerts.yml`) |
| **Fecha** (años invertido, vesting) | `?kinds=date` | 1×/día | **Cron de Vercel** (`vercel.json`) |

Solo la corrida de **precio** llama a `getMarketPrice`; la de **fecha** es puro comparado de
fechas (no toca proveedores de mercado). Sin query (`?kinds=all`) evalúa todo — retrocompatible.

## Config a crear en GitHub

En **Settings → Secrets and variables → Actions**:

- **Secrets** → `CRON_SECRET` — el **mismo valor** que el env `CRON_SECRET` de Vercel (autoriza el
  endpoint; es sensible, se enmascara en los logs).
- **Variables** → `ALERTS_CRON_URL` — la URL de **producción** del endpoint, **sin** query (no es
  secreto). Ejemplo: `https://TU-APP.vercel.app/api/investments/price-alerts`

El Action manda `Authorization: Bearer $CRON_SECRET` a `${ALERTS_CRON_URL}?kinds=price` y falla si
el HTTP no es 2xx. Podés dispararlo a mano desde la pestaña **Actions → price-alerts-hourly → Run
workflow** para probar.

## Caveats honestos

- **No es tiempo real** — ni cada 5 min. La alerta es tan frecuente como el barrido (a lo sumo cada
  5 min en precio, 1×/día en fecha). GitHub no permite `schedule` por debajo de 5 min y **puede
  retrasar** la corrida bajo carga.
- El **cron de GitHub se PAUSA tras ~60 días sin actividad** en el repo. Un push/commit (o un "Run
  workflow" manual) lo reactiva.
- **Rate limits del proveedor (el cuello de botella real a 5 min):** cada corrida llama
  `getMarketPrice` **1× por símbolo** (por eso el dedupe). Finnhub (60/min) y Binance aguantan; ojo
  con el **fallback AlphaVantage (25/DÍA)** y con Yahoo/CoinGecko (límite por IP) si tenés muchos
  símbolos — a 288 corridas/día se puede agotar el free tier. Si eso pasa, subí la cadencia (10–15
  min) o reducí símbolos.
- **Costo:** en repo **público** los minutos de GitHub Actions son **gratis e ilimitados**; las
  invocaciones en Vercel son livianas y quedan dentro de Hobby. El límite práctico es el proveedor
  de precios, no la infra.

## Alternativa si algún día pagan Vercel Pro

Vercel Pro permite crons sub-diarios. En ese caso, agregá a `vercel.json`:

```json
{ "path": "/api/investments/price-alerts?kinds=price", "schedule": "0 * * * *" }
```

y **borrá** `.github/workflows/price-alerts.yml` (Vercel correría ambas cadencias nativamente).
