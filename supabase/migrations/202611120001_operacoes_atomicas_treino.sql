begin;

create or replace function public.tf_move_own_exercise(
  p_plan_id uuid, p_exercise_id uuid, p_other_id uuid,
  p_position integer, p_other_position integer
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u uuid := auth.uid();
  atual integer;
  outra integer;
  temporaria integer;
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode = '42501'; end if;
  perform 1 from public.workout_plans where id = p_plan_id and user_id = u for update;
  if not found then raise exception 'Treino indisponível.' using errcode = '42501'; end if;
  perform 1 from public.exercises where plan_id = p_plan_id and user_id = u order by id for update;

  select position into atual from public.exercises where id = p_exercise_id and plan_id = p_plan_id and user_id = u;
  select position into outra from public.exercises where id = p_other_id and plan_id = p_plan_id and user_id = u;
  if atual is null or outra is null or p_exercise_id = p_other_id
      or p_position is null or p_other_position is null then
    raise exception 'Exercícios indisponíveis neste treino.' using errcode = '22023';
  end if;
  if atual = outra then
    raise exception 'Há exercícios com posições repetidas. Reabra o treino para conferir a ordem.' using errcode = '22023';
  end if;
  if atual = p_other_position and outra = p_position then return; end if;
  if atual <> p_position or outra <> p_other_position then
    raise exception 'A ordem mudou em outro aparelho. Reabra o treino antes de tentar novamente.' using errcode = '40001';
  end if;

  select coalesce(max(position), -1) + 1 into temporaria
    from public.exercises where plan_id = p_plan_id and user_id = u;
  update public.exercises set position = temporaria where id = p_exercise_id and user_id = u;
  update public.exercises set position = atual where id = p_other_id and user_id = u;
  update public.exercises set position = outra where id = p_exercise_id and user_id = u;
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
  delete from public.exercises where plan_id = p_plan_id and user_id = u;
  delete from public.workout_plans where id = p_plan_id and user_id = u;
end;
$$;

revoke all on function public.tf_move_own_exercise(uuid, uuid, uuid, integer, integer) from public, anon;
revoke all on function public.tf_delete_own_workout_plan(uuid) from public, anon;
grant execute on function public.tf_move_own_exercise(uuid, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.tf_delete_own_workout_plan(uuid) to authenticated;

commit;
