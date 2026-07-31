-- ============================================================
-- 20260805000001 · Informes de portafolio (carril "deep" del asesor)
--
-- Etapa A: el informe es DETERMINISTA — se arma con el paquete de evidencia (posiciones,
-- concentración, moneda, brecha a la Independencia, deuda vs. rendimiento supuesto, defensa,
-- frescura, banderas §15) y una plantilla; cero tokens de LLM. Se persiste para poder comparar
-- informes en el tiempo, para reabrirlo sin recalcular y para medir el uso del carril.
--
-- `evidence` guarda el paquete CRUDO (jsonb) y `report_md` el texto ya redactado: si mañana cambia
-- la redacción, la evidencia de un informe viejo sigue siendo auditable.
-- `analysis` (Etapa B) y `risk` (Etapa C) quedan reservadas, igual que model/tokens_* — nulas hoy.
--
-- PERSONAL (no del hogar): el informe es de quien lo pide, aunque las finanzas sean compartidas.
-- household_id queda como columna reservada (siempre null); la RLS es solo del DUEÑO — NO usa
-- apply_user_data_policies (que abre lectura a todo el hogar). Mismo patrón que chat_messages.
-- Aditivo e idempotente.
-- ============================================================

create table if not exists public.investment_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Reservada; el informe es personal, así que va siempre null (RLS por dueño, no por hogar).
  household_id uuid references public.households(id) on delete set null,
  -- Paquete de evidencia crudo (EvidencePack): la fuente auditable de cada cifra del informe.
  evidence     jsonb not null,
  -- Informe en markdown, ya redactado por plantilla determinista.
  report_md    text not null,
  analysis     text,   -- Etapa B (análisis con LLM): futura, null hoy
  risk         text,   -- Etapa C (lectura de riesgo): futura, null hoy
  model        text,   -- futura: modelo usado en B/C
  tokens_in    int,    -- futura
  tokens_out   int,    -- futura
  created_at   timestamptz not null default now()
);

create index if not exists idx_investment_reports_user_created
  on public.investment_reports(user_id, created_at desc);

alter table public.investment_reports enable row level security;
alter table public.investment_reports force row level security;

-- RLS PERSONAL: solo el dueño lee/escribe sus informes (idempotente: drop antes de crear).
drop policy if exists investment_reports_sel on public.investment_reports;
drop policy if exists investment_reports_ins on public.investment_reports;
drop policy if exists investment_reports_upd on public.investment_reports;
drop policy if exists investment_reports_del on public.investment_reports;
create policy investment_reports_sel on public.investment_reports
  for select using (user_id = auth.uid());
create policy investment_reports_ins on public.investment_reports
  for insert with check (user_id = auth.uid());
create policy investment_reports_upd on public.investment_reports
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investment_reports_del on public.investment_reports
  for delete using (user_id = auth.uid());
