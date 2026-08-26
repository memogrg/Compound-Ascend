-- ============================================================
-- 20260826000001 · Referidos
--
-- Cada usuario tiene un código corto y compartible para invitar; una fila en
-- `referrals` por referido efectivo. El contador es count(*), no un acumulador
-- en profiles: un contador desnormalizado se desincroniza y no hay forma de
-- auditarlo. La fila ES el hecho.
--
-- Idempotente: re-ejecutable sin efectos colaterales.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Generador de códigos
--
-- 8 caracteres de un alfabeto SIN AMBIGÜEDADES (sin O/0/I/1/L): el código se
-- dicta por teléfono y se transcribe de un QR impreso, así que confundir O con
-- 0 no es un detalle estético — manda al usuario a un código inexistente.
--
-- ALEATORIO, no secuencial: con 31^8 ≈ 8,5·10^11 combinaciones, el código no
-- permite enumerar usuarios ni estimar cuántas cuentas hay. `gen_random_bytes`
-- (pgcrypto) es CSPRNG; `random()` no lo es y sería predecible.
-- ------------------------------------------------------------
create or replace function public.gen_referral_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars
  len      constant int  := 8;
  bytes    bytea;
  out      text := '';
  i        int;
begin
  bytes := gen_random_bytes(len);
  for i in 0..len - 1 loop
    -- get_byte da 0-255; el módulo sesga levemente hacia los primeros símbolos
    -- (256 no es múltiplo de 31). El sesgo es < 0,4% por carácter y no afecta
    -- ni la unicidad ni la inenumerabilidad a esta escala.
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end;
$$;

/**
 * Código único garantizado. El UNIQUE de la columna es la verdad; esto solo
 * evita que una colisión (rarísima) tumbe un alta. Tras los intentos, cae a un
 * código más largo antes que fallar: crear la cuenta importa más que la
 * estética del código.
 */
create or replace function public.gen_unique_referral_code()
returns text
language plpgsql
volatile
as $$
declare
  candidate text;
  i         int;
begin
  for i in 1..10 loop
    candidate := public.gen_referral_code();
    if not exists (select 1 from public.profiles where referral_code = candidate) then
      return candidate;
    end if;
  end loop;
  return public.gen_referral_code() || public.gen_referral_code();
end;
$$;

-- ------------------------------------------------------------
-- 2) profiles.referral_code
--
-- En tres pasos porque la tabla ya tiene filas: columna nullable → backfill →
-- NOT NULL. Poner NOT NULL de entrada fallaría con usuarios existentes.
-- ------------------------------------------------------------
alter table public.profiles add column if not exists referral_code text;

-- Backfill de los existentes, uno por uno (el default de columna no sirve: se
-- evaluaría una sola vez para todas las filas y daría el MISMO código a todos).
do $$
declare
  r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles
       set referral_code = public.gen_unique_referral_code()
     where id = r.id;
  end loop;
end;
$$;

create unique index if not exists uq_profiles_referral_code
  on public.profiles(referral_code);

alter table public.profiles alter column referral_code set not null;

-- ------------------------------------------------------------
-- 3) Alta de usuario: el código nace con el perfil
--
-- Se re-declara handle_new_user COMPLETA (no se puede parchear una función en
-- Postgres). El resto del cuerpo es idéntico al de 0001.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'es',
    public.gen_unique_referral_code()
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4) Tabla referrals
--
-- UNIQUE en referred_user_id: un usuario se cuenta UNA sola vez, pase lo que
-- pase. Es lo que hace idempotente a la atribución sin necesidad de coordinar
-- los dos caminos de alta (correo y Google) — el segundo intento choca contra
-- el índice y se ignora.
-- ------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'registrado' check (status in ('registrado','activo','anulado')),
  created_at timestamptz not null default now(),
  unique (referred_user_id),
  -- Nadie se refiere a sí mismo. Se comprueba también en la aplicación, pero la
  -- BD es la que no se puede saltar.
  constraint referrals_no_auto check (referrer_user_id <> referred_user_id)
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_user_id);
create index if not exists idx_referrals_created on public.referrals(created_at desc);

-- ------------------------------------------------------------
-- 5) RLS: el usuario ve SOLO sus propios referidos
--
-- Sin políticas de escritura a propósito: la fila la crea el service-role
-- (bypassa RLS) al completarse el alta. Si el usuario pudiera insertar, podría
-- inventarse referidos.
-- ------------------------------------------------------------
alter table public.referrals enable row level security;
alter table public.referrals force row level security;

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select using (auth.uid() = referrer_user_id);

-- ------------------------------------------------------------
-- 6) Resolución de código → usuario, para el alta
--
-- SECURITY DEFINER porque quien se registra NO puede leer el profile de quien
-- lo invitó. Devuelve solo el id: nada de nombre ni correo — el código es
-- público por diseño, el resto del perfil no.
-- ------------------------------------------------------------
create or replace function public.resolve_referral_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.profiles
   where referral_code = upper(trim(p_code))
   limit 1;
$$;

revoke all on function public.resolve_referral_code(text) from public;
grant execute on function public.resolve_referral_code(text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 7) Visibilidad para el equipo (consulta por SQL, sin panel)
--
-- `security_invoker = true`: la vista respeta las RLS de quien la consulta, así
-- que desde el cliente NO filtra datos de otros. El equipo la lee con
-- service-role desde el SQL Editor, que es donde tiene sentido.
-- ------------------------------------------------------------
create or replace view public.referral_counts
with (security_invoker = true) as
  select
    p.id            as user_id,
    p.display_name,
    p.referral_code,
    count(r.id)     as referred_count,
    max(r.created_at) as last_referral_at
  from public.profiles p
  left join public.referrals r on r.referrer_user_id = p.id
  group by p.id, p.display_name, p.referral_code;

comment on view public.referral_counts is
  'Referidos por usuario. Uso: select * from referral_counts where referred_count > 0 order by referred_count desc;';
