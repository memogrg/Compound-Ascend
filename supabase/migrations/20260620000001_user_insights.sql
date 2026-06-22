-- Fase 4a · Memoria conductual: tabla de insights del asesor.
-- Una fila = una observación conductual sobre el usuario (meta estancada, alza de
-- gasto de disfrute, deuda creciendo, racha positiva, …). RLS estándar dueño+hogar.

create table public.user_insights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  kind          text not null,
  severity      text not null check (severity in ('celebrar','info','observar','accionar')),
  title         text not null,
  body          text not null,
  metric        numeric(18,2),
  related_kind  text check (related_kind in ('goal','debt','category')),
  related_id    uuid,
  status        text not null default 'activo'
                  check (status in ('activo','descartado','resuelto')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, kind, related_id)
);

-- RLS estándar (dueño + hogar) + trigger updated_at + índices user/household/created.
select public.apply_user_data_policies(array['user_insights']);

-- Índice extra para las lecturas del asesor/dashboard (insights activos del usuario).
create index if not exists idx_user_insights_status on public.user_insights(user_id, status);
