-- ============================================================
-- 0033 (2026-07-02) · Corpus semántico de la Biblia (andamiaje, Fase 2b-1)
--
-- Tabla de chunks curados de la "Biblia" conductual con su embedding (pgvector). Es DATO DE
-- ENTORNO (no de usuario): no lleva user_id. La recuperación todavía NO se cablea al
-- orquestador (eso es 2b-2); este delta solo deja el corpus migrado y embebido.
--
-- RLS: lectura para usuarios autenticados; SIN policies de insert/update/delete → solo el
-- service-role (que bypassa RLS, vía la ruta de reseed) escribe. Aditivo e idempotente.
-- ============================================================

create extension if not exists vector;

create table if not exists public.biblia_chunks (
  id         uuid primary key default gen_random_uuid(),
  tag        text not null,                    -- 'tema' | 'emocion' | 'patrimonio' | …
  content    text not null unique,             -- el texto curado; unique → upsert idempotente
  embedding  vector(768),                      -- null hasta que el reseed lo calcula
  source     text not null default 'curado',   -- 'curado' | 'documento'
  created_at timestamptz not null default now()
);

-- Índice ANN para búsqueda por similitud coseno (se usará en 2b-2).
create index if not exists idx_biblia_chunks_embedding
  on public.biblia_chunks using hnsw (embedding vector_cosine_ops);

alter table public.biblia_chunks enable row level security;
alter table public.biblia_chunks force row level security;

-- Lectura para autenticados; la escritura queda para service-role (bypassa RLS).
create policy biblia_chunks_sel on public.biblia_chunks
  for select to authenticated using (true);
