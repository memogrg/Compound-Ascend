-- ============================================================
-- biblia_chunks — endurecimiento para alinear prod con el repo
-- ============================================================
-- La tabla se aplicó en prod por el SQL Editor con una versión más simple que la
-- declarada en 20260702000001 (source NULLABLE y sin FORCE RLS). Esto cierra ese
-- drift: source pasa a NOT NULL (con default 'curado') y se fuerza RLS.
-- Idempotente y re-ejecutable.

update public.biblia_chunks set source = 'curado' where source is null;

alter table public.biblia_chunks alter column source set not null;

alter table public.biblia_chunks force row level security;
