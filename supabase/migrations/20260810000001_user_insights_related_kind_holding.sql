-- ============================================================
-- 20260810000001 · user_insights.related_kind admite 'holding'
--
-- La tabla nació (20260620000001) con un check de tres valores:
--   check (related_kind in ('goal','debt','category'))
-- pero `detectOpenContributions` emite relatedKind 'holding' desde que existe el aporte
-- automático de los recurrentes (brecha de aporte / DCA). Ese valor NUNCA pudo entrar.
--
-- Y el daño no se limita a esa fila. syncInsights hace UN upsert con TODAS las filas de la
-- pasada, así que la violación del check aborta el statement COMPLETO: a un usuario con un
-- aporte del mes sin confirmar no se le guardaba NINGÚN insight — ni metas, ni deudas, ni
-- fondos. Silencioso, porque el error del upsert no se miraba (eso también se arregla en la app).
--
-- El check se re-crea listando los valores desde cero en vez de solo agregar uno: la fuente de
-- verdad es INSIGHT_RELATED_KINDS (lib/insights/types.ts), y hay un test que exige que los
-- detectores no emitan nada fuera de esa lista.
--
-- Se busca el constraint por su DEFINICIÓN y no por su nombre autogenerado: si alguna vez se
-- renombró, dropear por nombre fijo lo dejaría vivo y el nuevo se sumaría al viejo (ambos deben
-- cumplirse) — es decir, el bug seguiría exactamente igual.
--
-- Aditivo (solo afloja una restricción; ninguna fila existente puede violar el nuevo check) e
-- idempotente.
-- ============================================================

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'user_insights'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%related_kind%'
  loop
    execute format('alter table public.user_insights drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.user_insights
  add constraint user_insights_related_kind_check
  check (related_kind is null or related_kind in ('goal', 'debt', 'category', 'holding'));
