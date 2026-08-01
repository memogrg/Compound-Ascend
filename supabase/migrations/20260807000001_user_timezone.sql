-- Zona horaria IANA del usuario, para calcular "mes/día actual" en SU zona y no la del
-- servidor (Vercel corre en UTC). Nullable: mientras no se capture, el servidor cae a la
-- cookie `tz` del dispositivo o a UTC. La captura silenciosa (layout autenticado) y el
-- selector de Configuración la persisten aquí.
--
-- Sin cambio de RLS: la política user_settings_update_own ya deja al dueño editar su fila.

alter table public.user_settings
  add column if not exists timezone text;

comment on column public.user_settings.timezone is
  'IANA time zone del usuario (p.ej. America/Costa_Rica). Null → cookie tz o UTC.';
