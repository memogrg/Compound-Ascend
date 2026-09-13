-- Aceptación de Términos y Política de privacidad.
--
-- Dos columnas y nada más: QUÉ versión se aceptó y CUÁNDO. La versión se guarda como
-- texto (el LEGAL_VERSION de src/lib/legal/version.ts, una fecha ISO) y no como
-- booleano a propósito: un "aceptó = true" no sirve el día que el texto cambie, porque
-- no dice qué fue lo que esa persona leyó. Con la versión, el banner de re-aceptación
-- sale solo comparando contra la constante.
--
-- NULL = pendiente. Toda cuenta anterior a esta migración queda en NULL y la ve el
-- banner; no se rellena con un valor inventado, porque afirmar que alguien aceptó algo
-- que nunca se le mostró es precisamente lo que este registro existe para evitar.
--
-- Aditiva e idempotente: se aplica a mano en el SQL Editor y después
-- `supabase migration repair --status applied 20260912000001`.

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Versión de Términos/Privacidad aceptada (LEGAL_VERSION). NULL = pendiente.';

comment on column public.profiles.terms_accepted_at is
  'Momento de la aceptación. Va junto a terms_version: la fecha sola no dice qué se aceptó.';
