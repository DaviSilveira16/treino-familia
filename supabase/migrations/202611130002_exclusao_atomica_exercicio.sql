begin;

create or replace function public.tf_delete_own_exercise(p_plan_id uuid, p_exercise_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode = '42501'; end if;
  perform 1 from public.workout_plans where id = p_plan_id and user_id = u for update;
  if not found then raise exception 'Treino indisponível.' using errcode = '42501'; end if;
  perform 1 from public.exercises
    where id = p_exercise_id and plan_id = p_plan_id and user_id = u for update;
  if not found then return; end if;

  update public.workout_sets set exercise_id = null
    where exercise_id = p_exercise_id and user_id = u;
  delete from public.exercise_load_defaults where exercise_id = p_exercise_id and user_id = u;
  delete from public.exercise_load_default_sources where exercise_id = p_exercise_id and user_id = u;
  delete from public.exercises where id = p_exercise_id and plan_id = p_plan_id and user_id = u;
end;
$$;

create or replace function public.tf_delete_own_workout_plan(p_plan_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode = '42501'; end if;
  perform 1 from public.workout_plans where id = p_plan_id and user_id = u for update;
  if not found then return; end if;

  update public.workout_sessions set plan_id = null where plan_id = p_plan_id and user_id = u;
  perform 1 from public.exercises where plan_id = p_plan_id and user_id = u order by id for update;
  update public.workout_sets s set exercise_id = null
    where s.user_id = u and exists (
      select 1 from public.exercises e
      where e.id = s.exercise_id and e.plan_id = p_plan_id and e.user_id = u
    );
  delete from public.exercise_load_defaults d using public.exercises e
    where d.exercise_id=e.id and d.user_id=u and e.plan_id=p_plan_id and e.user_id=u;
  delete from public.exercise_load_default_sources d using public.exercises e
    where d.exercise_id=e.id and d.user_id=u and e.plan_id=p_plan_id and e.user_id=u;
  update public.weekly_workout_schedule set plan_id=null where plan_id=p_plan_id and user_id=u;
  update public.coaching_deliveries set plan_id=null where plan_id=p_plan_id and user_id=u;
  delete from public.exercises where plan_id = p_plan_id and user_id = u;
  delete from public.workout_plans where id = p_plan_id and user_id = u;
end;
$$;

revoke all on function public.tf_delete_own_exercise(uuid, uuid) from public, anon;
grant execute on function public.tf_delete_own_exercise(uuid, uuid) to authenticated;

commit;
