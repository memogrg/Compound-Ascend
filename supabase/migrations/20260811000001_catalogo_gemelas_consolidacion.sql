-- ============================================================================
-- Consolidación de categorías de sistema GEMELAS + guardas para que no vuelvan.
--
-- QUÉ PASÓ (auditoría 2026-08-03, catálogo completo, todos los usuarios):
--   1. 20260601000050_seed sembró la taxonomía original: Nivel 1 = `vivienda`,
--      `alimentacion`, `transporte`… con hojas `vivienda_alquiler`,
--      `alim_supermercado`, `auto_mantenimiento`.
--   2. 20260605000004_transactions_revamp creó los frascos `g_*` y DEGRADÓ esas
--      raíces a hoja (`parent_id = g_*`). Sus hojas quedaron como NIETAS. La
--      propia migración lo dice: "La UI aplana los descendientes de cada grupo".
--   3. 20260612000001_gastos_subcats_minimas sembró hojas mínimas DIRECTO bajo
--      `g_*` (`viv_alquiler`, `alim_super`, `trans_mantenimiento`) sin mirar si
--      el concepto ya existía enterrado un nivel más abajo.
--
-- El paso 2 enterró las hojas viejas un nivel; el paso 4 las re-creó en el nivel
-- nuevo; y el aplanado del selector (categories-service.ts, `listCategoryTree`)
-- las vuelve a poner lado a lado. Por eso CADA gemela real es (nieta vieja) vs
-- (hija nueva), y por eso la canónica es siempre la NUEVA: cuelga directo del
-- frasco, es la que tiene el uso y la que escriben los presupuestos derivados.
--
-- QUÉ NO TOCA. La auditoría encontró otras dos clases de homónimas que NO son
-- duplicados y fusionarlas CORROMPERÍA datos:
--   · Frasco vs. hoja legada homónima (`vivienda`/`g_vivienda`,
--     `alimentacion`/`g_alimentacion`, `transporte`, `educacion`): son niveles
--     de jerarquía. `alimentacion` tiene 7 hijas y `vivienda` 5 — fusionarlas
--     huerfanaría el subárbol. Se aplana en un PR aparte (A2).
--   · Homónimas de frascos DISTINTOS: «Mantenimiento» en Vivienda / Automóvil /
--     Transporte, «Hipoteca» en Vivienda vs Deudas, y «Alquiler» (gasto,
--     Vivienda) vs «Alquileres» (padre Ingreso pasivo — es un INGRESO).
--     Son conceptos distintos que comparten nombre.
--
-- Se sigue la convención de fusión que ya existe en el código
-- (`mergeCategory`): `merged_into_id` para trazabilidad + `is_active = false`.
-- NO se borra: las de sistema no se pueden borrar por RLS, y así el cambio es
-- reversible con un solo update.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0-2) Consolidación, entera dentro de un solo bloque.
--
--   Los tres pares van EXPLÍCITOS: una heurística por nombre fusionaría los tres
--   «Mantenimiento» y el Alquiler/Alquileres.
--
--   Todo en un `do $$` y sin tablas temporales a propósito. El SQL Editor de
--   Supabase va contra un pool en modo transacción: cada statement puede caer en
--   una sesión distinta, así que una tabla temporal creada en el primero no
--   existe en el segundo ("relation _gemelas does not exist"). Un bloque es UN
--   statement — misma sesión, misma transacción, y aplica igual desde el editor
--   que desde `supabase db reset`.
-- ----------------------------------------------------------------------------
do $$
declare
  r     record;
  n     int := 0;
  vacio constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  for r in
    select p.id as perdedora, c.id as canonica, g.perdedora_key, g.canonica_key
    from (values
      ('alim_supermercado',  'alim_super'),          -- «Supermercado»  → «Supermercados»
      ('vivienda_alquiler',  'viv_alquiler'),        -- «Alquiler»      → «Alquiler»
      ('auto_mantenimiento', 'trans_mantenimiento')  -- «Mantenimiento» → «Mantenimiento»
    ) as g(perdedora_key, canonica_key)
    join public.expense_categories p on p.key = g.perdedora_key and p.is_system
    join public.expense_categories c on c.key = g.canonica_key  and c.is_system
  loop
    n := n + 1;

    -- ---- Repuntar TODAS las referencias de la perdedora a la canónica.
    --      La lista sale de los FK reales a expense_categories(id); espeja lo
    --      que hace `reassignReferences` en categories-service.ts.
    update public.transactions
      set category_id = r.canonica where category_id = r.perdedora;

    update public.expense_items
      set category_id = r.canonica where category_id = r.perdedora;

    update public.expense_items
      set subcategory_id = r.canonica where subcategory_id = r.perdedora;

    update public.transaction_rules
      set suggested_category_id = r.canonica where suggested_category_id = r.perdedora;

    update public.transaction_templates
      set category_id = r.canonica where category_id = r.perdedora;

    update public.merchant_suggestion_cache
      set category_id = r.canonica where category_id = r.perdedora;

    update public.savings_goals
      set default_category_id = r.canonica where default_category_id = r.perdedora;

    -- Hijas: hoy las tres perdedoras tienen 0, pero si alguien colgó algo va al
    -- frasco correcto en vez de quedar bajo una categoría inactiva.
    update public.expense_categories
      set parent_id = r.canonica where parent_id = r.perdedora;

    -- `budget_items` NO tiene unique sobre (usuario, periodo, categoría), así que
    -- un update ciego podría dejar DOS líneas de la misma categoría en el mismo
    -- periodo. Hoy las perdedoras tienen 0 líneas, pero se fusiona el monto en
    -- vez de duplicar la fila por si algo entra entre la auditoría y el apply.
    update public.budget_items dst
    set amount = dst.amount + src.amount,
        updated_at = now()
    from public.budget_items src
    where src.category_id = r.perdedora
      and dst.category_id = r.canonica
      and dst.user_id = src.user_id
      and dst.period_year = src.period_year
      and dst.period_month = src.period_month
      and dst.type = src.type
      and coalesce(dst.household_id, vacio) = coalesce(src.household_id, vacio);

    delete from public.budget_items src
    using public.budget_items dst
    where src.category_id = r.perdedora
      and dst.category_id = r.canonica
      and dst.user_id = src.user_id
      and dst.period_year = src.period_year
      and dst.period_month = src.period_month
      and dst.type = src.type
      and coalesce(dst.household_id, vacio) = coalesce(src.household_id, vacio);

    update public.budget_items
      set category_id = r.canonica where category_id = r.perdedora;

    -- `category_overrides` sí tiene unique por scope (uq_covr_household /
    -- uq_covr_user): si el hogar ya intervino la canónica, la intervención sobre
    -- la perdedora sobra — se borra en vez de reventar el índice.
    delete from public.category_overrides src
    using public.category_overrides dst
    where src.category_id = r.perdedora
      and dst.category_id = r.canonica
      and dst.user_id = src.user_id
      and coalesce(dst.household_id, vacio) = coalesce(src.household_id, vacio);

    update public.category_overrides
      set category_id = r.canonica where category_id = r.perdedora;

    update public.category_overrides
      set fork_id = r.canonica where fork_id = r.perdedora;

    -- ---- Retirar la perdedora. Misma convención que `mergeCategory`:
    --      trazabilidad + desactivación, sin borrar (las de sistema no se pueden
    --      borrar por RLS, y así el cambio se revierte con un solo update).
    update public.expense_categories
    set is_active     = false,
        is_favorite   = false,
        merged_into_id = r.canonica,
        updated_at    = now()
    where id = r.perdedora;

    raise notice 'Fusionada % → %', r.perdedora_key, r.canonica_key;
  end loop;

  -- Si el catálogo no tuviera los 3 pares, algo cambió desde la auditoría: el
  -- bloque entero se revierte.
  if n <> 3 then
    raise exception 'Se esperaban 3 pares de gemelas y se resolvieron %. Revisar el catálogo antes de consolidar.', n;
  end if;
end $$;

-- ============================================================================
-- B) PREVENCIÓN
--
-- El job `migrations` del CI hace `supabase db reset`, o sea que re-aplica toda
-- la cadena sobre una BD limpia. Cualquier restricción de acá abajo que una
-- migración FUTURA viole rompe ese job y bloquea el PR — que es exactamente lo
-- que faltó las cuatro veces que se sembró taxonomía encima de taxonomía.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1) Mismo padre + mismo nombre exacto. Barato y estructural.
--     `parent_id` es null en las raíces y en un unique index los NULL son
--     distintos entre sí, así que se colapsa a un uuid fijo para que dos
--     frascos homónimos también choquen.
--     NO habría atajado ninguna de las tres gemelas de arriba (tienen padres
--     distintos: nieta vs hija) — de eso se encarga B2.
-- ----------------------------------------------------------------------------
create unique index if not exists uq_expense_categories_sys_parent_name
  on public.expense_categories (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where is_system and is_active;

-- ----------------------------------------------------------------------------
-- B2) La regla que SÍ muerde: dentro de un mismo FRASCO, dos descendientes
--     activos de sistema no pueden normalizar al mismo nombre.
--
--     Se compara por frasco RAÍZ y no por padre porque eso es lo que el usuario
--     ve: `listCategoryTree` aplana TODOS los descendientes de cada Nivel 1 en
--     una sola lista. Por eso una nieta y una hija aparecen juntas.
--
--     La raíz se EXCLUYE de la comparación a propósito: el patrón "hoja legada
--     homónima del frasco" (`vivienda` dentro de «Vivienda») es la Clase 2, es
--     jerarquía legítima y sigue viva hasta que se aplane en A2.
-- ----------------------------------------------------------------------------

-- Normalización: minúsculas, sin acentos, sin puntuación y singular. Espeja
-- `raiz()` de la auditoría y el matcher de sobres del chat. Sin `unaccent()`:
-- esa función es STABLE (depende del diccionario) y no se puede usar en un
-- índice ni razonar sobre ella como inmutable; `translate` sí lo es.
create or replace function public.cat_norm(txt text)
returns text
language sql
immutable
as $$
  select coalesce(
    (
      select string_agg(
        case
          when length(w) > 3 and w like '%es' then left(w, length(w) - 2)
          when length(w) > 3 and w like '%s'  then left(w, length(w) - 1)
          else w
        end,
        ' ' order by ord
      )
      from unnest(
        string_to_array(
          btrim(
            regexp_replace(
              translate(lower(coalesce(txt, '')),
                        'áàäâéèëêíìïîóòöôúùüûñ',
                        'aaaaeeeeiiiioooouuuun'),
              '[^a-z0-9]+', ' ', 'g'
            )
          ),
          ' '
        )
      ) with ordinality as t(w, ord)
      where w <> ''
    ),
    ''
  );
$$;

comment on function public.cat_norm(text) is
  'Nombre de categoría normalizado (minúsculas, sin acentos, sin puntuación, singular). '
  'Usado por el guard cat_sin_gemelas para detectar «Supermercado» vs «Supermercados».';

create or replace function public.cat_sin_gemelas()
returns trigger
language plpgsql
as $$
declare
  v_raiz   uuid;
  v_padre  uuid;
  v_otra   text;
  v_saltos int := 0;
begin
  -- Solo el catálogo de sistema y solo lo visible. Las categorías propias de un
  -- usuario pueden llamarse como quieran, y una fila que se desactiva (p. ej. la
  -- perdedora de una fusión) deja de competir.
  if not new.is_system or not new.is_active then
    return new;
  end if;

  -- Frasco raíz de la fila, subiendo por parent_id. Se sube con un loop y no con
  -- un CTE recursivo porque el árbol tiene 3 niveles y así se evita la forma
  -- `with … select … into` de plpgsql. El tope de saltos es un cinturón por si
  -- alguna vez hubiera un ciclo de parent_id (el FK no lo impide).
  v_raiz := new.parent_id;
  while v_raiz is not null and v_saltos < 10 loop
    select c.parent_id into v_padre
    from public.expense_categories c
    where c.id = v_raiz;
    exit when v_padre is null;
    v_raiz := v_padre;
    v_saltos := v_saltos + 1;
  end loop;

  -- Una raíz no compite con sus descendientes: la hoja legada homónima del
  -- frasco (`vivienda` dentro de «Vivienda») es jerarquía legítima, no gemela.
  if v_raiz is null then
    return new;
  end if;

  -- Descendientes del frasco, propagando la raíz de arriba hacia abajo.
  v_otra := (
    with recursive arbol as (
      select c.id, c.name, c.is_system, c.is_active
      from public.expense_categories c
      where c.parent_id = v_raiz
      union all
      select h.id, h.name, h.is_system, h.is_active
      from public.expense_categories h
      join arbol a on h.parent_id = a.id
    )
    select a.name
    from arbol a
    where a.id <> new.id
      and a.is_system
      and a.is_active
      and public.cat_norm(a.name) = public.cat_norm(new.name)
    limit 1
  );

  if v_otra is not null then
    raise exception
      'Categoría de sistema duplicada dentro del mismo frasco: "%" choca con "%" (ambas normalizan a "%"). Reusá la categoría existente en vez de sembrar otra key.',
      new.name, v_otra, public.cat_norm(new.name)
      using errcode = 'unique_violation';
  end if;

  return new;
end $$;

-- AFTER y no BEFORE: la comprobación necesita ver la fila ya en la tabla para
-- recorrer el árbol desde ella.
drop trigger if exists trg_cat_sin_gemelas on public.expense_categories;
create trigger trg_cat_sin_gemelas
  after insert or update of name, parent_id, is_active, is_system
  on public.expense_categories
  for each row
  execute function public.cat_sin_gemelas();

-- ============================================================================
-- VERIFICACIÓN. `ok` debe dar true. Si da false ⇒ NO correr el `repair`.
-- ============================================================================
with recursive
-- Cada categoría con su frasco RAÍZ, propagando de arriba hacia abajo.
arbol as (
  select c.id, c.id as raiz, c.name, c.is_system, c.is_active
  from public.expense_categories c
  where c.parent_id is null
  union all
  select h.id, a.raiz, h.name, h.is_system, h.is_active
  from public.expense_categories h
  join arbol a on h.parent_id = a.id
),
retiradas as (
  select c.id, c.key, c.name, c.merged_into_id
  from public.expense_categories c
  where c.key in ('alim_supermercado', 'vivienda_alquiler', 'auto_mantenimiento')
    and c.is_system
),
colgando as (
  select
    (select count(*) from public.transactions t         join retiradas r on t.category_id = r.id)            +
    (select count(*) from public.expense_items e        join retiradas r on e.category_id = r.id)            +
    (select count(*) from public.expense_items e        join retiradas r on e.subcategory_id = r.id)         +
    (select count(*) from public.budget_items b         join retiradas r on b.category_id = r.id)            +
    (select count(*) from public.transaction_rules tr   join retiradas r on tr.suggested_category_id = r.id) +
    (select count(*) from public.transaction_templates tt join retiradas r on tt.category_id = r.id)         +
    (select count(*) from public.merchant_suggestion_cache m join retiradas r on m.category_id = r.id)       +
    (select count(*) from public.savings_goals s        join retiradas r on s.default_category_id = r.id)    +
    (select count(*) from public.category_overrides o   join retiradas r on o.category_id = r.id)            +
    (select count(*) from public.expense_categories h   join retiradas r on h.parent_id = r.id) as n
),
-- El mismo criterio del trigger, evaluado sobre todo el catálogo activo: dentro
-- de un frasco, dos DESCENDIENTES (la raíz no cuenta) que normalicen igual.
gemelas_vivas as (
  select a.raiz, public.cat_norm(a.name) as n
  from arbol a
  where a.is_system and a.is_active and a.raiz <> a.id
  group by a.raiz, public.cat_norm(a.name)
  having count(*) > 1
)
select
  (select count(*) from retiradas)                                        as retiradas_encontradas,
  (select count(*) from retiradas where merged_into_id is not null)        as con_merged_into_id,
  (select n from colgando)                                                as referencias_colgando,
  (select count(*) from gemelas_vivas)                                    as gemelas_restantes,
  (select count(*) = 3 from retiradas)
    and (select count(*) = 3 from retiradas where merged_into_id is not null)
    and (select n = 0 from colgando)
    and (select count(*) = 0 from gemelas_vivas)                          as ok;
