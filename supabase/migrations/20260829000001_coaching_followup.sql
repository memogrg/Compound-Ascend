-- ============================================================
-- 20260829000001 · Seguimiento de recomendaciones (cerrar el loop del asesor)
--
-- El hilo de coaching (`ai_coaching_thread`) ya guardaba QUÉ se recomendó, pero como TEXTO: no se
-- puede cruzar con lo que pasó después. Sin ese cruce el asesor recomienda al vacío — no sabe si le
-- hicieron caso, así que no puede celebrar lo que sí se hizo ni retomar lo que quedó pendiente, que
-- es literalmente la diferencia entre un asesor y un generador de consejos.
--
-- Estas columnas hacen la recomendación ESTRUCTURADA para poder verificarla contra los datos reales
-- (el saldo de la deuda, el acumulado de la meta, el aporte configurado). Nada se infiere del texto.
--
-- Todas NULLABLE: las filas anteriores siguen siendo válidas y simplemente no se siguen.
--
-- Aplicación MANUAL (SQL Editor) + `supabase migration repair --status applied 20260829000001`.
-- Aditiva, idempotente y re-ejecutable.
-- ============================================================

alter table public.ai_coaching_thread
  add column if not exists action_type text,      -- 'create_goal' | 'debt_extra_payment' | 'set_dca' | …
  add column if not exists action_ref  uuid,      -- id de la meta/deuda/posición recomendada
  add column if not exists action_amount numeric(14, 2),
  -- El valor de la entidad EN EL MOMENTO de recomendar (acumulado de la meta, saldo de la deuda).
  -- Sin esta línea base no se puede saber si la meta avanzó POR el consejo o ya venía avanzando, y
  -- celebrar lo segundo suena a que el asesor no está mirando de verdad.
  add column if not exists action_baseline numeric(14, 2),
  -- 'abierta' = todavía no se sabe · 'cumplida' = se verificó que pasó · 'vencida' = pasó el plazo sin
  -- hacerse. Nunca se borra una fila: el hilo es memoria longitudinal.
  add column if not exists follow_status text not null default 'abierta',
  add column if not exists resolved_at timestamptz;

alter table public.ai_coaching_thread drop constraint if exists ai_coaching_follow_status_check;
alter table public.ai_coaching_thread
  add constraint ai_coaching_follow_status_check
  check (follow_status in ('abierta', 'cumplida', 'vencida', 'sin_seguimiento'));

-- La consulta del seguimiento es "las recomendaciones ABIERTAS de este usuario".
create index if not exists idx_ai_coaching_follow
  on public.ai_coaching_thread(user_id, follow_status, created_at desc);
