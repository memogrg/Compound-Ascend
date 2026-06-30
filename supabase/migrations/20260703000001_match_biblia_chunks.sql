-- ============================================================
-- 0034 (2026-07-03) · RPC de recuperación semántica de la Biblia (Fase 2b-2)
--
-- match_biblia_chunks: dado el embedding de la consulta, devuelve los chunks más cercanos por
-- similitud de coseno (= 1 - distancia <=> de pgvector), filtrando por un umbral mínimo. Solo
-- LEE dato de entorno (biblia_chunks); no toca datos de usuario. STABLE.
-- Aditivo e idempotente (create or replace).
-- ============================================================

create or replace function public.match_biblia_chunks(
  query_embedding vector(768),
  match_count int,
  min_similarity float8
)
returns table(content text, tag text, similarity float8)
language sql
stable
as $$
  select
    content,
    tag,
    1 - (embedding <=> query_embedding) as similarity
  from public.biblia_chunks
  where embedding is not null
    and 1 - (embedding <=> query_embedding) >= min_similarity
  order by embedding <=> query_embedding
  limit match_count
$$;
