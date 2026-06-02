-- ============================================================
-- 0010 · Guardado progresivo del onboarding de perfil
-- Almacena el borrador del wizard y respuestas sin columna propia
-- (protección, acompañamiento, Rich Life) como jsonb.
-- ============================================================

alter table public.personal_profiles
  add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.personal_profiles.extra is
  'Borrador del wizard y respuestas auxiliares (protección, Rich Life). No sustituye columnas normalizadas.';
