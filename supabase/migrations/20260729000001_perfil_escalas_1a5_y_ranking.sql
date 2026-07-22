-- ============================================================
-- 20260729000001 · Perfil financiero: escalas 1-10 → 1-5 + ranking de respuestas
-- ============================================================
-- Aplicar MANUALMENTE en el SQL Editor y luego:
--   supabase migration repair --status applied 20260729000001
--
-- Dos cambios de datos, cada uno idempotente:
--   (1) ESCALAS: rescala 1-10 → 1-5 con round(v/2) acotado a [1,5]
--       (1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5). Toca las 6 columnas + el JSON
--       extra.draft + profile_snapshots.metrics, y APRIETA los CHECK a [1,5].
--   (2) RANKING: envuelve en array los 15 campos que eran respuesta única (single→[valor])
--       y capa a 3 los que ya eran array. La primaria = índice 0 (conserva prioridad).
--
-- IMPORTANTE: rescatar los datos ANTES de apretar el CHECK (si no, filas 6-10 lo violan).
-- Reejecutable: el rescale sobre valores ya en 1-5 los deja igual; el wrap detecta arrays.
-- ============================================================

begin;

-- ── (1) ESCALAS ─────────────────────────────────────────────
-- Helper de rescale: greatest(1, least(5, round(v/2))). NULL queda NULL.
-- (round de Postgres redondea .5 hacia arriba, igual que Math.round del cliente.)

-- 1a. Columnas normalizadas.
update public.personal_profiles set
  perceived_control = greatest(1, least(5, round(perceived_control / 2.0)))::int
    where perceived_control is not null and perceived_control > 5;
update public.personal_profiles set
  satisfaction = greatest(1, least(5, round(satisfaction / 2.0)))::int
    where satisfaction is not null and satisfaction > 5;

update public.behavior_profiles set
  discipline  = case when discipline  > 5 then greatest(1, least(5, round(discipline  / 2.0)))::int else discipline  end,
  impulsivity = case when impulsivity > 5 then greatest(1, least(5, round(impulsivity / 2.0)))::int else impulsivity end,
  consistency = case when consistency > 5 then greatest(1, least(5, round(consistency / 2.0)))::int else consistency end,
  anxiety     = case when anxiety     > 5 then greatest(1, least(5, round(anxiety     / 2.0)))::int else anxiety     end;

update public.risk_profiles set
  volatility_comfort = greatest(1, least(5, round(volatility_comfort / 2.0)))::int
    where volatility_comfort is not null and volatility_comfort > 5;

-- 1b. JSON del borrador (personal_profiles.extra.draft.<escala>). Solo si el valor > 5.
update public.personal_profiles p set extra = jsonb_set(
  extra, '{draft}',
  (
    select coalesce(jsonb_object_agg(k, v2), '{}'::jsonb)
    from (
      select k,
        case
          when k in ('perceivedControl','satisfaction','discipline','impulsivity','consistency','volatilityComfort')
               and jsonb_typeof(v) = 'number' and (v::text)::numeric > 5
          then to_jsonb(greatest(1, least(5, round((v::text)::numeric / 2.0)))::int)
          else v
        end as v2
      from jsonb_each(p.extra->'draft') as e(k, v)
    ) s
  )
)
where extra ? 'draft' and jsonb_typeof(extra->'draft') = 'object';

-- 1c. Snapshots históricos (profile_snapshots.metrics.<escala>) — evita saltos falsos en evolution.
update public.profile_snapshots s set metrics = (
  select coalesce(jsonb_object_agg(k, v2), '{}'::jsonb)
  from (
    select k,
      case
        when k in ('discipline','impulsivity','perceivedControl')
             and jsonb_typeof(v) = 'number' and (v::text)::numeric > 5
        then to_jsonb(greatest(1, least(5, round((v::text)::numeric / 2.0)))::int)
        else v
      end as v2
    from jsonb_each(s.metrics) as e(k, v)
  ) t
)
where metrics is not null and jsonb_typeof(metrics) = 'object';

-- 1d. Apretar los CHECK a [1,5] (después del rescale).
alter table public.personal_profiles
  drop constraint if exists personal_profiles_perceived_control_check,
  add  constraint personal_profiles_perceived_control_check check (perceived_control between 1 and 5),
  drop constraint if exists personal_profiles_satisfaction_check,
  add  constraint personal_profiles_satisfaction_check check (satisfaction between 1 and 5);

alter table public.behavior_profiles
  drop constraint if exists behavior_profiles_discipline_check,
  add  constraint behavior_profiles_discipline_check check (discipline between 1 and 5),
  drop constraint if exists behavior_profiles_impulsivity_check,
  add  constraint behavior_profiles_impulsivity_check check (impulsivity between 1 and 5),
  drop constraint if exists behavior_profiles_consistency_check,
  add  constraint behavior_profiles_consistency_check check (consistency between 1 and 5),
  drop constraint if exists behavior_profiles_anxiety_check,
  add  constraint behavior_profiles_anxiety_check check (anxiety between 1 and 5);

alter table public.risk_profiles
  drop constraint if exists risk_profiles_volatility_comfort_check,
  add  constraint risk_profiles_volatility_comfort_check check (volatility_comfort between 1 and 5);

-- ── (2) RANKING: single → array (top-3), en extra.draft ─────
-- Los 15 campos que eran respuesta única (string) se envuelven en array [valor]; los que
-- ya eran array (mainConcerns, goals, priorities, hardest) se capan a 3 conservando orden.
-- Idempotente: si ya es array, wrap lo deja igual (solo capa); si es string, lo envuelve.

update public.personal_profiles p set extra = jsonb_set(
  extra, '{draft}',
  (
    select coalesce(jsonb_object_agg(k, v2), '{}'::jsonb)
    from (
      select k,
        case
          when k in (
            'lifeStage','mainConcerns','dominantEmotionAnswer','singleProblem','goals',
            'priorities','dineroPrimero','conectaFrase','hardest','incomeReaction',
            'stressSpending','unplannedPurchase','socialComparison','moneyScriptPhrase',
            'lossReaction','alertStyle','interventionStyle','richLifePhrase','futureImage'
          )
          then case
            -- string no vacío → [valor]
            when jsonb_typeof(v) = 'string' and v::text <> '""' then jsonb_build_array(v)
            -- array → primeros 3 (conserva orden = ranking)
            when jsonb_typeof(v) = 'array'
              then (select coalesce(jsonb_agg(elem), '[]'::jsonb)
                    from (select elem, row_number() over () rn
                          from jsonb_array_elements(v) elem) z where rn <= 3)
            else v
          end
          else v
        end as v2
      from jsonb_each(p.extra->'draft') as e(k, v)
    ) s
  )
)
where extra ? 'draft' and jsonb_typeof(extra->'draft') = 'object';

-- Nota: las columnas normalizadas single (life_stage, main_concern, risk_profiles.loss_reaction)
-- NO cambian de tipo: siguen guardando la PRIMARIA. La próxima vez que el usuario complete el
-- wizard, completeProfile las reescribe con [0]. La jerarquía completa vive en extra.draft.

commit;
