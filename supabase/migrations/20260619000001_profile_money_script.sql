-- Perfil conductual · Fase 3a: "money script" (creencia dominante sobre el dinero).
-- Aditivo e idempotente. Hereda las políticas RLS de personal_profiles (no se tocan).
alter table public.personal_profiles
  add column if not exists money_script text;
