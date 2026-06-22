-- Palanca 3 · Lectura escrita por IA, persistida y cacheada.
-- Guarda en personal_profiles la nota personal generada por la IA (ai_reading) y
-- la clave de los inputs con que se generó (ai_reading_key) para invalidarla solo
-- cuando el perfil cambia. Hereda la RLS de personal_profiles (sin política nueva).

alter table public.personal_profiles
  add column if not exists ai_reading      text,
  add column if not exists ai_reading_key  text;
