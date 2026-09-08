-- ============================================================
-- 20260909000001 · Mis acciones: estado por acción + prioridad del usuario
--
-- "Mis acciones" es el ÚNICO lugar donde viven las recomendaciones. Las acciones NO se
-- guardan: se DERIVAN cada vez de los motores (control, wealth, insights, fondos). Lo único
-- que persiste es lo que la persona DECIDIÓ sobre cada una — hecha, pospuesta, descartada —
-- y el impacto que tenía al marcarla, para poder mostrar el progreso acumulado después.
--
-- Por eso `action_key` es una clave DETERMINISTA que el motor recompone en cada corrida
-- ('<source>:<kind>:<related|periodo>'): la misma condición vuelve a generar la misma clave, y
-- así el estado se reencuentra con su acción sin que exista una tabla de acciones.
--
-- PERSONAL (no del hogar): decidir "ya la hice" es de quien la hizo, aunque las finanzas sean
-- compartidas. household_id se guarda igual (etiquetado de datos del hogar, como el resto de la
-- app) pero la RLS es solo del DUEÑO — NO usa apply_user_data_policies, que abre lectura a todo
-- el hogar. Mismo criterio que chat_messages (20260804000001).
--
-- Aditiva e idempotente.
-- ============================================================

create table if not exists public.user_action_states (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  -- Clave determinista de la acción: '<source>:<kind>:<related|periodo>'.
  action_key    text not null,
  status        text not null check (status in ('hecha','pospuesta','descartada')),
  -- Solo para 'pospuesta': hasta cuándo no se vuelve a proponer.
  snooze_until  date,
  -- Impacto MEDIDO al marcar 'hecha' (monto/meses/moneda), congelado: el motor puede dejar de
  -- emitir la acción justo porque se hizo, y el progreso tiene que sobrevivir a eso.
  impact        jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, action_key)
);

create index if not exists idx_user_action_states_user_status
  on public.user_action_states(user_id, status);

alter table public.user_action_states enable row level security;
alter table public.user_action_states force row level security;

-- updated_at automático (mismo trigger que usa el resto de las tablas de datos de usuario).
drop trigger if exists trg_user_action_states_updated on public.user_action_states;
create trigger trg_user_action_states_updated
  before update on public.user_action_states
  for each row execute function public.set_updated_at();

-- RLS PERSONAL: solo el dueño lee/escribe sus decisiones (idempotente: drop antes de crear).
drop policy if exists user_action_states_sel on public.user_action_states;
drop policy if exists user_action_states_ins on public.user_action_states;
drop policy if exists user_action_states_upd on public.user_action_states;
drop policy if exists user_action_states_del on public.user_action_states;
create policy user_action_states_sel on public.user_action_states
  for select using (user_id = auth.uid());
create policy user_action_states_ins on public.user_action_states
  for insert with check (user_id = auth.uid());
create policy user_action_states_upd on public.user_action_states
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_action_states_del on public.user_action_states
  for delete using (user_id = auth.uid());

-- ------------------------------------------------------------
-- Prioridad declarada del usuario para ordenar sus acciones.
--
-- Nullable a propósito: null = "no la eligió a mano" → se DERIVA del ranking `priorities` del
-- onboarding (personal_profiles.extra.draft). Guardar un default aquí borraría esa distinción y
-- congelaría una elección que la persona nunca hizo.
--
-- Ojo: `profiles` tiene el trigger protect_profile_plan, que solo blinda las columnas de plan y
-- suscripción. Esta es una preferencia de UI y la escribe el propio usuario.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists action_priority text
    check (action_priority in ('deudas','orden','proteger','crecer'));
