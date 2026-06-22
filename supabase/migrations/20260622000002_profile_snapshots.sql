-- Palanca 4 · Snapshots del perfil: una foto diaria de las métricas conductuales
-- y de estado financiero, para medir progreso en el tiempo. RLS estándar dueño+hogar.

create table public.profile_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  captured_on   date not null default current_date,
  metrics       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, captured_on)
);

-- RLS estándar (dueño + hogar) + trigger updated_at + índices user/household/created.
select public.apply_user_data_policies(array['profile_snapshots']);
