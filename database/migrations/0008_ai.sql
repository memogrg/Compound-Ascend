-- ============================================================
-- 0008 · IA, acciones, recibos, consumo de tokens y rate limits
-- Regla crítica: el usuario NO puede modificar su consumo ni sus límites.
-- ============================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('assistant','finance_ai')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_conv_user on public.ai_conversations(user_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_in int default 0,
  tokens_out int default 0,
  model text,
  created_at timestamptz not null default now()
);
create index idx_ai_msg_conv on public.ai_messages(conversation_id);

-- Acciones propuestas por la IA: NUNCA se ejecutan sin confirmación del usuario.
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete cascade,
  type text not null check (type in
    ('create_transaction','create_goal','suggest_debt_strategy','suggest_budget_adjustment')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','confirmed','executed','rejected')),
  executed_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_actions_user on public.ai_actions(user_id);

create table public.ai_receipt_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text,
  extracted jsonb default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','extracted','confirmed','rejected')),
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Consumo de tokens — calculado server-side, inmodificable por el usuario.
create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null, -- primer día del mes
  tokens_used bigint not null default 0,
  requests int not null default 0,
  cost_est numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);
create index idx_ai_usage_period on public.ai_usage_ledger(user_id, period);

-- Rate limits internos — gestionados solo por backend.
create table public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null default now(),
  count int not null default 0,
  unique (user_id, bucket, window_start)
);

-- ============================================================
-- Triggers updated_at donde aplica
-- ============================================================
create trigger trg_ai_conv_updated before update on public.ai_conversations
  for each row execute function public.set_updated_at();
create trigger trg_ai_actions_updated before update on public.ai_actions
  for each row execute function public.set_updated_at();
create trigger trg_ai_receipts_updated before update on public.ai_receipt_scans
  for each row execute function public.set_updated_at();
create trigger trg_ai_usage_updated before update on public.ai_usage_ledger
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_messages force row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_actions force row level security;
alter table public.ai_receipt_scans enable row level security;
alter table public.ai_receipt_scans force row level security;
alter table public.ai_usage_ledger enable row level security;
alter table public.ai_usage_ledger force row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_rate_limits force row level security;

-- Conversaciones / mensajes / acciones / recibos: dueño gestiona lo suyo.
create policy ai_conv_all on public.ai_conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_msg_all on public.ai_messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_actions_all on public.ai_actions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ai_receipts_all on public.ai_receipt_scans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- CRÍTICO: consumo y límites son SOLO LECTURA para el usuario.
-- La escritura la realiza el backend con service-role (omite RLS) o RPC controlado.
create policy ai_usage_select_own on public.ai_usage_ledger
  for select using (user_id = auth.uid());
-- (sin políticas de insert/update/delete para 'authenticated')

create policy ai_rate_select_own on public.ai_rate_limits
  for select using (user_id = auth.uid());
-- (sin políticas de insert/update/delete para 'authenticated')
