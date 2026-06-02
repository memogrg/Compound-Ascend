-- ============================================================
-- 0009 · Seguridad y auditoría
-- Estas tablas las escribe el backend (service-role). El usuario no las lee.
-- ============================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  diff jsonb default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_actor on public.audit_logs(actor_id);
create index idx_audit_created on public.audit_logs(created_at);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  severity text check (severity in ('info','warn','critical')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_sec_events_type on public.security_events(event_type);
create index idx_sec_events_created on public.security_events(created_at);

create table public.user_sessions_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device text,
  ip text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index idx_sessions_user on public.user_sessions_metadata(user_id);

-- RLS: tablas internas. Sin políticas para 'authenticated' (deny por defecto).
-- Solo accesibles vía service-role (que omite RLS).
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table public.user_sessions_metadata enable row level security;
alter table public.user_sessions_metadata force row level security;

-- El usuario puede ver sus propios metadatos de sesión (transparencia), nada más.
create policy sessions_select_own on public.user_sessions_metadata
  for select using (user_id = auth.uid());
