-- Perfil conductual · Fase 2: arquetipo del usuario y tono recomendado.
-- Aditivo e idempotente. Hereda las políticas RLS de personal_profiles (no se tocan).
alter table public.personal_profiles
  add column if not exists archetype_primary    text,
  add column if not exists archetype_secondary  text,
  add column if not exists dominant_emotion     text,
  add column if not exists ai_tone_recommended  text;
