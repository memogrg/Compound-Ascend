# Revisión de producción · 02 — Pendientes que la limpieza NO tocó

> Cosas detectadas en Fase 2 que requieren cambio de comportamiento o decisión:
> prohibidas en limpieza, van a Fase 3 (o a la fase indicada).

1. **`formatMoney` divergente con los selectores de moneda.** El mapa interno de
   `lib/format.ts` renderiza `$` plano para MXN/COP; los selectores usan
   `MX$`/`COL$` (ahora unificados en `CURRENCY_SYMBOL`). Unificar cambia el output
   de todos los montos MXN/COP → decisión de producto (¿`MX$2.500` o `$2.500`?).
2. **`formatMoney` duplicado en WhatsApp** (`lib/whatsapp/format.ts`): copia
   aislada a propósito (módulo sin dependencias). Decidir: documentar el
   aislamiento como regla o re-exportar desde `lib/format`.
3. **Arrays de monedas en selects con órdenes distintos**: `add-spend-modal.tsx`
   (CRC,USD,EUR,GBP,MXN,COP) vs `jar-normal-modal.tsx` (CRC,USD,EUR,MXN,COP,GBP)
   vs `CODES` de currency-switch. Unificar orden = cambio visible de UI → F5.
4. **`@/modules/*/constants` queda como excepción del barrel**: `coach-panel.tsx`
   (cliente) y `dashboard-view.tsx` la importan. Mover las constantes compartidas
   a `src/lib/` o exportarlas del barrel exige separar datos puros de servicios
   server-only → F3/F4 si se quiere cerrar.
5. **`src/app/` (composition root) importa internos de módulos directamente**
   (páginas → components/v2/*, services/base-view). La regla ESLint nueva cubre
   solo módulo→módulo. Cubrir app/ exigiría barrels mucho más grandes — evaluar
   si vale el costo.
6. Los hallazgos alto/medio de la auditoría (cron snapshot roto, market-price sin
   auth, Bearer fallback, rate-limit webhooks, CORS assistant) — plan de Fase 3
   en `01-auditoria.md` §TOP 10.
