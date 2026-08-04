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
--
-- LO QUE COLGABA DE LAS HOMÓNIMAS. Un primer intento de aplicar esta migración se
-- detuvo solo, en su propia guarda: dos filas de `merchant_suggestion_cache`
-- ("fundatec" y "craving education") apuntaban a la hoja «Educación». Lo que
-- APUNTA a una homónima se repunta al frasco; lo que la REGISTRA para la
-- migración. Ver el detalle en el paso 3.
-- ============================================================================

do $do$
declare
  n_movidas    int := 0;
  n_retiradas  int := 0;
  n_hijas      int := 0;
  n_punteros   int := 0;
  n_registros  int := 0;
  k            int := 0;
  -- Raíces legadas cuyas hojas suben al frasco.
  legadas      constant text[] := array['vivienda', 'alimentacion', 'automovil', 'servicios_hogar'];
  -- Hojas que repiten el nombre de su frasco y se retiran.
  homonimas    constant text[] := array['vivienda', 'alimentacion', 'transporte', 'educacion'];
begin
  -- --------------------------------------------------------------------------
  -- 1) Subir TODAS las hojas al frasco, activas e inactivas.
  --
  --    Las inactivas también: 20260811000001 retiró tres gemelas (`vivienda_alquiler`,
  --    `alim_supermercado`, `auto_mantenimiento`) sin tocarles el `parent_id`, así que
  --    siguen colgando de una raíz legada. Dejarlas ahí las volvería hijas de una
  --    categoría retirada — un nivel 2 fantasma que nadie ve y que rompe el invariante
  --    de dos niveles. El trigger `cat_sin_gemelas` no se molesta: ignora las inactivas.
  --
  --    El `sort_order` se recalcula para no chocar con las hijas que el frasco ya tenía:
  --    arranca después del máximo actual y respeta el orden viejo (primero por la raíz
  --    legada de la que venían, después por su propio orden), así Luz/Agua/Internet
  --    siguen juntas y en secuencia.
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
  -- 2) Antes de retirar las homónimas: no les puede quedar ninguna hija.
  -- --------------------------------------------------------------------------
  select count(*) into n_hijas
  from public.expense_categories h
  join public.expense_categories p on p.id = h.parent_id
  where p.key = any(homonimas) and p.is_system;

  if n_hijas <> 0 then
    raise exception 'A las hojas legadas homónimas les quedan % hijas; no se pueden retirar.', n_hijas;
  end if;

  -- --------------------------------------------------------------------------
  -- 3) Lo que APUNTA a una homónima se repunta al frasco; lo que la REGISTRA
  --    detiene la migración.
  --
  --    La diferencia importa. Una sugerencia aprendida, una regla, una plantilla o la
  --    categoría por defecto de una meta son PREFERENCIAS: dicen "la próxima vez usá
  --    esto". Como la hoja retirada se llama igual que su frasco («Educación» dentro de
  --    «Educación»), repuntarlas al frasco conserva exactamente lo que el usuario eligió
  --    — y NO repuntarlas las rompería en silencio, que es el bug de #625: el índice de
  --    sugerencias descarta las categorías inactivas, así que la preferencia no se
  --    equivoca, desaparece.
  --
  --    Una transacción, un gasto o una línea de presupuesto son REGISTROS de plata ya
  --    movida. Moverlos del sobre al frasco cambiaría lo que dicen, y eso no lo decide
  --    una migración: si aparece alguno, se para y se mira.
  -- --------------------------------------------------------------------------
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
      where c.key = any(homonimas) and c.is_system)
  into n_registros;

  if n_registros <> 0 then
    raise exception
      'Hay % movimientos o líneas de presupuesto registrados en una hoja legada homónima. Reasignarlos al frasco cambiaría su significado: revisarlos a mano antes de aplicar.',
      n_registros;
  end if;

  -- Sugerencias aprendidas, reglas, plantillas y default de metas → al frasco.
  update public.merchant_suggestion_cache m
  set category_id = p.id
  from public.expense_categories c
  join public.expense_categories p on p.id = c.parent_id
  where m.category_id = c.id and c.key = any(homonimas) and c.is_system;
  get diagnostics k = row_count;  n_punteros := n_punteros + k;

  update public.transaction_rules r
  set suggested_category_id = p.id
  from public.expense_categories c
  join public.expense_categories p on p.id = c.parent_id
  where r.suggested_category_id = c.id and c.key = any(homonimas) and c.is_system;
  get diagnostics k = row_count;  n_punteros := n_punteros + k;

  update public.transaction_templates tt
  set category_id = p.id
  from public.expense_categories c
  join public.expense_categories p on p.id = c.parent_id
  where tt.category_id = c.id and c.key = any(homonimas) and c.is_system;
  get diagnostics k = row_count;  n_punteros := n_punteros + k;

  update public.savings_goals s
  set default_category_id = p.id
  from public.expense_categories c
  join public.expense_categories p on p.id = c.parent_id
  where s.default_category_id = c.id and c.key = any(homonimas) and c.is_system;
  get diagnostics k = row_count;  n_punteros := n_punteros + k;

  -- `category_overrides` NO se repunta: una intervención sobre la hoja se convertiría en
  -- una intervención sobre el FRASCO ENTERO — ocultar «Educación» la hoja pasaría a
  -- ocultar todo el frasco Educación. Se borra: lo que la personalización modificaba ya
  -- no existe, y sin la fila el hogar vuelve al comportamiento por defecto.
  delete from public.category_overrides o
  using public.expense_categories c
  where c.key = any(homonimas) and c.is_system
    and (o.category_id = c.id or o.fork_id = c.id);
  get diagnostics k = row_count;  n_punteros := n_punteros + k;

  -- --------------------------------------------------------------------------
  -- 4) Retirar las homónimas. Misma convención que `mergeCategory` y que
  --    20260811000001: trazabilidad + desactivación, sin borrar. Acá el destino es el
  --    propio FRASCO, que es lo que la hoja duplicaba.
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

  if n_movidas <> 24 or n_retiradas <> 4 then
    raise exception 'Se esperaban 24 hojas subidas y 4 retiradas; hubo % y %. Revisar el catálogo.',
      n_movidas, n_retiradas;
  end if;

  raise notice 'Aplanado: % hojas subidas al frasco, % retiradas, % preferencias repuntadas.',
    n_movidas, n_retiradas, n_punteros;
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
