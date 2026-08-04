-- ============================================================================
-- A2 — Aplanar la taxonomía de sistema a DOS niveles: frasco → sobre.
--
-- QUÉ PASÓ. `20260605000004_transactions_revamp` creó los frascos `g_*` y
-- degradó las raíces viejas (`vivienda`, `alimentacion`, `automovil`,
-- `servicios_hogar`…) a hoja dentro de ellos. Sus hojas quedaron un nivel más
-- abajo, en el Nivel 2. La propia migración lo asumió: "La UI aplana los
-- descendientes de cada grupo para mostrar 2 niveles visibles".
--
-- Ese aplanado es SOLO de presentación, y no todos los caminos lo hacen:
--   · `listCategoryTree` sí aplana → el chat y el selector premium las ven.
--   · `buildCategoryOptionGroups` NO: lista únicamente las hijas DIRECTAS del
--     frasco. O sea que el modal de reasignar huérfanas (web y móvil) hoy no
--     puede ofrecer Luz, Agua, Internet, Celular, Marchamo, Feria, Café,
--     Delivery… 21 sobres que existen y son inalcanzables desde ahí.
--   · `selectableCategoryLeaves` define hoja como "sin hijas activas", así que
--     `automovil` y `servicios_hogar` no son seleccionables hoy.
-- Aplanar de verdad en la BD hace que los tres caminos coincidan.
--
-- Continúa 20260811000001, que consolidó las tres gemelas. Aquella dejó el
-- trigger `cat_sin_gemelas`: cada re-parenteo de acá lo dispara, así que la
-- migración se auto-verifica — si subir una hoja al frasco creara un nombre
-- duplicado, Postgres la rechaza. La auditoría dice que no hay ninguno.
--
-- QUÉ NO TOCA — el frasco «Ingresos». `inc_activo` / `inc_pasivo` / `inc_extra`
-- NO son residuo legado: los sembró 20260615000004 a propósito y sostienen la
-- distinción activo/pasivo/extraordinario. `inc_pasivo` es destino de ESCRITURA
-- de dividend-service.ts y rental-service.ts (los dividendos y el alquiler
-- cobrado entran ahí), y los formularios de ingreso de web y móvil mapean sus
-- tres opciones a esas keys. Aplanarlo borraría la noción de ingreso pasivo.
--
-- `automovil` y `servicios_hogar` se CONSERVAN como sobres tras subirles las
-- hijas: no son homónimas del frasco, tienen nombre propio legítimo ("Automóvil"
-- para gasto genérico del carro, "Servicios y hogar" para servicios sueltos) y
-- ya figuran en EXPENSE_CATEGORIES. Solo se retiran las CUATRO que repiten el
-- nombre de su propio frasco, que es lo que producía pares indistinguibles.
-- ============================================================================

do $do$
declare
  n_movidas    int := 0;
  n_retiradas  int := 0;
  n_hijas      int := 0;
  n_refs       int := 0;
  -- Raíces legadas cuyas hojas suben al frasco.
  legadas      constant text[] := array['vivienda', 'alimentacion', 'automovil', 'servicios_hogar'];
  -- Hojas que repiten el nombre de su frasco y se retiran.
  homonimas    constant text[] := array['vivienda', 'alimentacion', 'transporte', 'educacion'];
begin
  -- --------------------------------------------------------------------------
  -- 1) Subir las nietas al frasco.
  --
  --    El `sort_order` se recalcula para que no choque con las hijas que el
  --    frasco ya tenía: arranca después del máximo actual y respeta el orden
  --    viejo (primero por la raíz legada de la que venían, después por su propio
  --    orden), así Luz/Agua/Internet siguen juntas y en su secuencia.
  -- --------------------------------------------------------------------------
  with movidas as (
    select h.id,
           raiz.id as nuevo_padre,
           row_number() over (
             partition by raiz.id
             order by p.sort_order, h.sort_order, h.name
           ) as rn
    from public.expense_categories h
    join public.expense_categories p    on p.id = h.parent_id
    join public.expense_categories raiz on raiz.id = p.parent_id
    where p.key = any(legadas)
      and p.is_system
      and h.is_system
      and h.is_active
      and raiz.parent_id is null
  ),
  tope as (
    select parent_id, coalesce(max(sort_order), 0) as m
    from public.expense_categories
    where is_system and parent_id is not null
    group by parent_id
  )
  update public.expense_categories c
  set parent_id  = mv.nuevo_padre,
      sort_order = coalesce(t.m, 0) + mv.rn,
      updated_at = now()
  from movidas mv
  left join tope t on t.parent_id = mv.nuevo_padre
  where c.id = mv.id;

  get diagnostics n_movidas = row_count;

  -- --------------------------------------------------------------------------
  -- 2) Las cuatro homónimas tienen que quedar SIN hijas activas y SIN nada
  --    colgando antes de retirarlas. Si algo cuelga, parar: mover esas filas al
  --    frasco cambiaría su significado (de un sobre concreto al frasco entero) y
  --    esa es una decisión de producto, no de una migración.
  -- --------------------------------------------------------------------------
  select count(*) into n_hijas
  from public.expense_categories h
  join public.expense_categories p on p.id = h.parent_id
  where p.key = any(homonimas) and p.is_system and h.is_active;

  if n_hijas <> 0 then
    raise exception 'Las hojas legadas homónimas todavía tienen % hijas activas; no se pueden retirar.', n_hijas;
  end if;

  select
    (select count(*) from public.transactions t
       join public.expense_categories c on c.id = t.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.expense_items e
       join public.expense_categories c on c.id = e.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.expense_items e
       join public.expense_categories c on c.id = e.subcategory_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.budget_items b
       join public.expense_categories c on c.id = b.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.transaction_rules r
       join public.expense_categories c on c.id = r.suggested_category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.transaction_templates tt
       join public.expense_categories c on c.id = tt.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.merchant_suggestion_cache m
       join public.expense_categories c on c.id = m.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.savings_goals s
       join public.expense_categories c on c.id = s.default_category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.category_overrides o
       join public.expense_categories c on c.id = o.category_id
      where c.key = any(homonimas) and c.is_system) +
    (select count(*) from public.category_overrides o
       join public.expense_categories c on c.id = o.fork_id
      where c.key = any(homonimas) and c.is_system)
  into n_refs;

  if n_refs <> 0 then
    raise exception 'Las hojas legadas homónimas tienen % referencias colgando; revisar antes de retirarlas.', n_refs;
  end if;

  -- --------------------------------------------------------------------------
  -- 3) Retirar las homónimas. Misma convención que `mergeCategory` y que
  --    20260811000001: trazabilidad + desactivación, sin borrar. Acá el destino
  --    es el propio FRASCO, que es lo que la hoja duplicaba.
  -- --------------------------------------------------------------------------
  update public.expense_categories c
  set is_active      = false,
      is_favorite    = false,
      merged_into_id = p.id,
      updated_at     = now()
  from public.expense_categories p
  where c.parent_id = p.id
    and p.parent_id is null
    and c.is_system
    and c.is_active
    and c.key = any(homonimas);

  get diagnostics n_retiradas = row_count;

  if n_movidas <> 21 or n_retiradas <> 4 then
    raise exception 'Se esperaban 21 hojas subidas y 4 retiradas; hubo % y %. Revisar el catálogo.',
      n_movidas, n_retiradas;
  end if;

  raise notice 'Aplanado: % hojas subidas al frasco, % hojas legadas retiradas.', n_movidas, n_retiradas;
end $do$;

-- ============================================================================
-- VERIFICACIÓN. `ok` debe dar true. Si da false, NO correr el repair.
--
-- Se espera: cero categorías de gasto en Nivel 2 (el frasco «Ingresos» conserva
-- su subestructura a propósito), las cuatro homónimas retiradas con su
-- merged_into_id, y ningún nombre repetido dentro de un frasco.
-- ============================================================================
with recursive arbol as (
  select c.id, c.id as raiz, c.parent_id, c.name, c.key, c.is_system, c.is_active, 0 as nivel
  from public.expense_categories c
  where c.parent_id is null
  union all
  select h.id, a.raiz, h.parent_id, h.name, h.key, h.is_system, h.is_active, a.nivel + 1
  from public.expense_categories h
  join arbol a on h.parent_id = a.id
),
profundas as (
  select a.key, a.name, r.name as frasco
  from arbol a
  join public.expense_categories r on r.id = a.raiz
  where a.is_system and a.is_active and a.nivel > 1
    and r.key <> 'g_ingresos'
),
retiradas as (
  select c.key, c.merged_into_id
  from public.expense_categories c
  where c.is_system and c.key in ('vivienda', 'alimentacion', 'transporte', 'educacion')
),
duplicadas as (
  select a.raiz, public.cat_norm(a.name) as n
  from arbol a
  where a.is_system and a.is_active and a.raiz <> a.id
  group by a.raiz, public.cat_norm(a.name)
  having count(*) > 1
)
select
  (select count(*) from profundas)                                     as gastos_en_nivel_2,
  (select count(*) from retiradas)                                     as homonimas,
  (select count(*) from retiradas where merged_into_id is not null)    as homonimas_retiradas,
  (select count(*) from duplicadas)                                    as nombres_duplicados,
  (select count(*) = 0 from profundas)
    and (select count(*) = 4 from retiradas)
    and (select count(*) = 4 from retiradas where merged_into_id is not null)
    and (select count(*) = 0 from duplicadas)                          as ok;
