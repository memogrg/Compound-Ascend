-- ============================================================
-- 2026-09-02 · Ingesta por correo: la verificación deja de ser opcional
--
-- HUECO QUE CIERRA (P0, verificado en prod el 2 sep 2026): `authenticated` tenía
-- INSERT y UPDATE sobre TODAS las columnas de email_ingest_links —incluida
-- `verified`— y las policies solo validaban `user_id = auth.uid()`. Es decir: con
-- la anon key y su propio JWT, cualquier usuario logueado podía escribir
--
--     { user_id: <el suyo>, forwarder_email: "victima@gmail.com", verified: true }
--
-- y quedarse con el correo de otro. Consecuencias: (a) cuando la víctima
-- configurara su reenvío, SUS movimientos entrarían en la cuenta del atacante;
-- (b) el índice único uq_email_ingest_links_forwarder la dejaba sin poder
-- registrar su propia dirección ("Ese correo no está disponible").
--
-- La verificación por código vive en la server action, no en la base — y la base
-- es alcanzable directamente por PostgREST. Por eso el fix es quitarle al cliente
-- la ruta de escritura, no añadir otra validación en el código.
--
-- CÓMO QUEDA:
--   · anon/authenticated: SELECT (dueño + hogar) y DELETE (dueño). NADA más.
--   · Alta y verificación: SOLO desde el servidor (service-role), en
--     `ingest-email-service.ts`, que autentica con requireUser() y deriva
--     user_id/verified del servidor — el cliente nunca los elige. Es la misma
--     excepción que ya usan webhooks y alertas, y la única vía de confianza:
--     el código de 6 dígitos tiene que viajar SOLO por correo, así que no puede
--     devolverse al llamador (un RPC que lo devolviera no probaría nada).
--   · `verified_at` deja rastro de cuándo se probó la propiedad, para que la
--     invariante "verificado sin rastro de verificación" sea detectable.
--
-- Aditivo e idempotente. No toca datos: las filas existentes conservan su estado.
-- ============================================================

-- 1) Rastro de la verificación (auditoría). Las filas viejas quedan en null.
alter table public.email_ingest_links
  add column if not exists verified_at timestamptz;

-- 2) Quitar la ruta de escritura del cliente. Sin grant no hay PostgREST posible,
--    con o sin policy; las policies se borran para que la intención quede escrita.
revoke insert, update on public.email_ingest_links from anon, authenticated;

drop policy if exists eil_ins on public.email_ingest_links;
drop policy if exists eil_upd on public.email_ingest_links;

-- 3) Defensa en profundidad: si alguna vez se re-otorgara el grant por descuido
--    (p. ej. un `grant all` de un alter default privileges futuro), este trigger
--    impide igual que un rol no privilegiado marque `verified` o se adjudique una
--    dirección ajena. El service-role queda exento: es el camino legítimo.
create or replace function public.email_ingest_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- PostgREST hace SET LOCAL ROLE anon|authenticated por petición, así que
  -- current_user es la señal fiable (no la claim del JWT, que cambió de GUC
  -- entre versiones). El service-role y las migraciones (postgres) quedan fuera.
  if current_user in ('anon', 'authenticated') then
    raise exception 'email_ingest_links: alta y verificación solo desde el servidor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_ingest_guard on public.email_ingest_links;
create trigger trg_email_ingest_guard
  before insert or update on public.email_ingest_links
  for each row execute function public.email_ingest_guard();

comment on column public.email_ingest_links.verified is
  'Solo el servidor la pone en true, tras validar el código enviado a esa dirección. El cliente no tiene INSERT/UPDATE sobre esta tabla.';
comment on column public.email_ingest_links.verified_at is
  'Cuándo se probó la propiedad de la dirección. Null en las filas sembradas antes del 2 sep 2026.';
