begin;

create or replace function public.tf_salvar_programacao(p_dia smallint, p_plano uuid, p_descanso boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or p_dia is null or p_dia not between 0 and 6 or p_descanso is null
      or (p_descanso and p_plano is not null) then
    raise exception 'Programação inválida.' using errcode='22023';
  end if;
  if p_plano is not null and not exists (select 1 from public.workout_plans where id=p_plano and user_id=u) then
    raise exception 'Treino indisponível.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text || ':programacao',0));
  delete from public.weekly_workout_schedule where user_id=u and day_of_week=p_dia;
  if p_descanso or p_plano is not null then
    insert into public.weekly_workout_schedule(user_id,day_of_week,plan_id,is_rest_day)
      values(u,p_dia,p_plano,p_descanso);
  end if;
end;
$$;

create or replace function public.tf_indicadores_painel(p_fuso text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with dias as (
    select distinct (coalesce(finished_at,started_at) at time zone p_fuso)::date dia
    from public.workout_sessions where user_id=auth.uid() and (status='concluido' or (status is null and finished_at is not null))
  ), grupos as (
    select dia, dia-row_number() over(order by dia)::integer as grupo from dias
    where dia <= (now() at time zone p_fuso)::date
  ), recentes as (
    select id, coalesce(finished_at,started_at) as fim from public.workout_sessions
    where user_id=auth.uid() and (status='concluido' or (status is null and finished_at is not null))
    order by fim desc,id desc limit 12
  ), series_sessao as (
    select distinct on (w.session_id,w.exercise_id,w.set_number)
      w.session_id,w.exercise_id,w.exercise_name,w.set_number,w.weight_kg,r.fim
    from recentes r join public.workout_sets w on w.session_id=r.id
    where w.user_id=auth.uid() and w.exercise_id is not null and w.reps>0
    order by w.session_id,w.exercise_id,w.set_number,w.created_at desc,w.id desc
  ), comparaveis as (
    select *, lag(weight_kg) over(partition by exercise_id,set_number order by fim,session_id) anterior
    from series_sessao
  )
  select jsonb_build_object(
    'sequencia',coalesce((select count(*) from grupos group by grupo having max(dia) >= (now() at time zone p_fuso)::date-1 order by max(dia) desc limit 1),0),
    'carga',(select jsonb_build_object('exercicio',exercise_name,'serie',set_number,'atual',weight_kg,'anterior',anterior)
      from comparaveis where anterior is not null order by fim desc,exercise_id,set_number limit 1)
  );
$$;

revoke all on function public.tf_salvar_programacao(smallint,uuid,boolean), public.tf_indicadores_painel(text) from public,anon;
grant execute on function public.tf_salvar_programacao(smallint,uuid,boolean), public.tf_indicadores_painel(text) to authenticated;
commit;
