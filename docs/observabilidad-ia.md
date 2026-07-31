# Observabilidad de la IA — cómo leer los cuatro números

Las preguntas que quedaron abiertas al construir el carril deep (#562), el comparador (#567) y el
informe determinista, y la consulta que contesta cada una.

Esto dice **cómo obtener el número**, no qué hacer con él. La decisión vive fuera del repo.

## Dónde vive cada cosa

| Fuente | Qué guarda | Retención |
|---|---|---|
| `ai_events` | un evento por turno de chat (`event='lane'`) y uno por invocación de herramienta (`event='tool'`) | permanente |
| `investment_reports` | un informe generado, con su evidencia | permanente |
| `logger.info` (Vercel) | los mismos números, en vivo | 1 hora (Hobby) / 1 día (Pro) |

`ai_events` **no guarda contenido**: ni mensajes, ni respuestas, ni el resumen redactado. `reply_len`
y `resumen_len` son largos en caracteres, no texto.

Las consultas van con el **service-role** (SQL Editor de Supabase). Un usuario autenticado solo ve
sus propias filas.

---

## Antes de leer cualquier número: contá USUARIOS, no eventos

Con tráfico propio de pruebas los conteos engañan: veinte llamadas tuyas al comparador se ven igual
que veinte usuarios usándolo una vez. Casi todas las consultas de abajo traen `usuarios` al lado del
conteo — **ese es el número que importa**. Si `usuarios` es 1 y sos vos, todavía no hay señal.

Para excluirte del todo, agregá `and user_id <> '<tu-uuid>'` a cualquier consulta.

---

## 1 · ¿Se repite el informe?

Si alguien lo pide una vez y nunca más, la Etapa B no tiene a quién servirle.

```sql
select
  count(*)                       as informes,
  count(distinct user_id)        as usuarios,
  round(count(*)::numeric / nullif(count(distinct user_id), 0), 2) as por_usuario
from public.investment_reports
where created_at > now() - interval '30 days';
```

Y quiénes volvieron:

```sql
select user_id, count(*) as veces, max(created_at) as ultimo
from public.investment_reports
where created_at > now() - interval '30 days'
group by user_id
having count(*) > 1
order by veces desc;
```

El carril que produce esos informes también deja su evento: `event='lane' and name='deep'`.

## 2 · ¿Cuánto tarda el comparador?

Corre cinco lecturas en paralelo dentro del tool-loop, con un tope de 6 s.

```sql
select
  count(*)                                             as invocaciones,
  count(distinct user_id)                              as usuarios,
  round(avg(ms))                                       as ms_promedio,
  percentile_cont(0.5) within group (order by ms)      as ms_p50,
  percentile_cont(0.95) within group (order by ms)     as ms_p95,
  max(ms)                                              as ms_max,
  count(*) filter (where not ok)                       as fallidas
from public.ai_events
where event = 'tool'
  and name = 'comparar_abonar_vs_invertir'
  and created_at > now() - interval '30 days';
```

`ms_max` cerca de 6000 y `fallidas` > 0 significan que el tope se está activando: las que vencen
devuelven error, no una comparación a medias.

## 3 · ¿El modelo pasa `resumen_md` entero?

La herramienta devuelve un bloque ya redactado y el prompt le pide pasarlo tal cual. Esto compara lo
que se le entregó contra lo que salió, emparejando cada invocación con el turno que la siguió.

```sql
with tool as (
  select user_id, created_at, resumen_len
  from public.ai_events
  where event = 'tool' and resumen_len is not null
    and created_at > now() - interval '30 days'
)
select
  t.resumen_len,
  l.reply_len,
  round(l.reply_len::numeric / nullif(t.resumen_len, 0), 2) as ratio,
  t.created_at
from tool t
join lateral (
  select reply_len, created_at
  from public.ai_events l
  where l.event = 'lane' and l.user_id = t.user_id and l.created_at >= t.created_at
  order by l.created_at
  limit 1
) l on true
order by ratio;
```

`ratio` cerca de 1 (o mayor, si el modelo agregó su frase de encuadre) = pasó el bloque. `ratio` de
0,2 = se lo comió.

## 4 · ¿Se elige la herramienta?

Qué tools se usan de verdad, y qué carriles resuelven los turnos.

```sql
select name as herramienta, count(*) as veces, count(distinct user_id) as usuarios, round(avg(ms)) as ms_promedio
from public.ai_events
where event = 'tool' and created_at > now() - interval '30 days'
group by name
order by veces desc;
```

```sql
select name as carril, count(*) as turnos, count(distinct user_id) as usuarios,
       round(avg(tokens_in + tokens_out)) as tokens_promedio
from public.ai_events
where event = 'lane' and created_at > now() - interval '30 days'
group by name
order by turnos desc;
```

Una herramienta con `veces = 0` (ausente de la lista) no se está eligiendo: o el modelo no la
encuentra, o nadie pregunta lo que resuelve. Son dos problemas distintos y se arreglan distinto.
