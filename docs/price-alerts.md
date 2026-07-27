# Alertas de inversión — cadencias

Las alertas (`/api/investments/price-alerts`) se barren en **dos cadencias separadas** por tipo,
para que la alerta de **precio** sea útil para salidas sin pagar Vercel Pro:

| Tipo | Query | Cadencia | Quién la dispara |
|---|---|---|---|
| **Precio** | `?kinds=price` | cada hora | **GitHub Action** (`.github/workflows/price-alerts.yml`) |
| **Fecha** (años invertido, vesting) | `?kinds=date` | 1×/día | **Cron de Vercel** (`vercel.json`) |

Solo la corrida de **precio** llama a `getMarketPrice`; la de **fecha** es puro comparado de
fechas (no toca proveedores de mercado). Sin query (`?kinds=all`) evalúa todo — retrocompatible.

## Secrets a crear en GitHub

En **Settings → Secrets and variables → Actions → New repository secret**:

- `CRON_SECRET` — el **mismo valor** que el env `CRON_SECRET` de Vercel (autoriza el endpoint).
- `ALERTS_CRON_URL` — la URL de **producción** del endpoint, **sin** query. Ejemplo:
  `https://TU-APP.vercel.app/api/investments/price-alerts`

El Action manda `Authorization: Bearer $CRON_SECRET` a `${ALERTS_CRON_URL}?kinds=price` y falla si
el HTTP no es 2xx. Podés dispararlo a mano desde la pestaña **Actions → price-alerts-hourly → Run
workflow** para probar.

## Caveats honestos

- **No es tiempo real** — ni la corrida horaria. La alerta es tan frecuente como el barrido (a lo
  sumo cada hora en precio, 1×/día en fecha).
- El **cron de GitHub puede retrasarse** unos minutos, y **se PAUSA tras ~60 días sin actividad** en
  el repo. Un push/commit (o un "Run workflow" manual) lo reactiva.
- El **free tier de Finnhub/AlphaVantage** tiene rate limit → el endpoint **deduplica por símbolo**
  (un `getMarketPrice` por símbolo, no por alerta).

## Alternativa si algún día pagan Vercel Pro

Vercel Pro permite crons sub-diarios. En ese caso, agregá a `vercel.json`:

```json
{ "path": "/api/investments/price-alerts?kinds=price", "schedule": "0 * * * *" }
```

y **borrá** `.github/workflows/price-alerts.yml` (Vercel correría ambas cadencias nativamente).
