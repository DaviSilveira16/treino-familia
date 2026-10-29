-- Aplique após as tabelas existentes de treinos. Não reprocessa o histórico.
-- As referências mudam somente quando uma sessão do modo ativo é concluída.
begin;

create table if not exists public.exercise_load_default_sources (
  exercise_id uuid primary key references public.exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  session_started_at timestamptz not null,
  session_finished_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.exercise_load_default_sources enable row level security;
revoke all on public.exercise_load_default_sources from public, anon, authenticated;

create index if not exists workout_sets_session_exercise_defaults_idx
  on public.workout_sets (session_id, exercise_id, set_number);
create index if not exists workout_sets_exercise_session_defaults_idx
  on public.workout_sets (exercise_id, session_id);

create or replace function public.apply_finished_workout_load_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exercise public.exercises%rowtype;
  v_latest uuid;
  v_previous public.exercise_load_default_sources%rowtype;
  v_count integer;
  v_min_reps integer;
  v_max_reps integer;
begin
  -- Chamadas administrativas sem identidade não ganham uma identidade inferida.
  if auth.uid() is null then return new; end if;
  if auth.uid() <> new.user_id then
    raise exception 'Não é permitido atualizar referências de outra conta.' using errcode = '42501';
  end if;
  if new.status is distinct from 'concluido' or new.finished_at is null or new.plan_id is null
    or new.notes is null or new.notes not like 'Treino concluído no modo ativo;%'
  then return new; end if;
  -- Repetir a confirmação/detalhes não restaura cargas editadas manualmente.
  if tg_op = 'UPDATE' and old.status is not distinct from new.status
    and old.finished_at is not distinct from new.finished_at
    and old.plan_id is not distinct from new.plan_id
  then return new; end if;
  if not exists (select 1 from public.workout_plans p where p.id = new.plan_id and p.user_id = new.user_id)
  then return new; end if;

  -- Todas as sessões tomam os mesmos locks na mesma ordem, antes de comparar
  -- timestamps. Uma conclusão antiga que chega atrasada não vence uma nova.
  for v_exercise in
    select e.* from public.exercises e
    where e.user_id = new.user_id and e.plan_id = new.plan_id
      and exists (select 1 from public.workout_sets s where s.session_id = new.id
        and s.user_id = new.user_id and s.exercise_id = e.id)
    order by e.id for update of e
  loop
    select ws.id into v_latest
    from public.workout_sessions ws
    where ws.user_id = new.user_id and ws.plan_id = new.plan_id
      and ws.status = 'concluido' and ws.finished_at is not null
      and ws.notes like 'Treino concluído no modo ativo;%'
      and exists (select 1 from public.workout_sets s where s.session_id = ws.id
        and s.user_id = new.user_id and s.exercise_id = v_exercise.id)
    order by ws.started_at desc, ws.finished_at desc, ws.id desc limit 1;
    if v_latest is distinct from new.id then continue; end if;

    select * into v_previous from public.exercise_load_default_sources
      where exercise_id = v_exercise.id;
    if found and (v_previous.session_started_at, v_previous.session_finished_at, v_previous.session_id)
      >= (new.started_at, new.finished_at, new.id)
    then continue; end if;

    select count(*), min(s.reps), max(s.reps) into v_count, v_min_reps, v_max_reps
    from public.workout_sets s where s.session_id = new.id and s.user_id = new.user_id
      and s.exercise_id = v_exercise.id and s.set_number > 0
      and s.reps > 0 and s.weight_kg >= 0 and s.weight_kg <= 2000;
    -- Ausência de séries válidas não significa apagar o exercício ou suas cargas.
    if v_count = 0 then continue; end if;

    delete from public.exercise_load_defaults where user_id = new.user_id and exercise_id = v_exercise.id;
    insert into public.exercise_load_defaults (user_id, exercise_id, set_number, reps, weight_kg)
    select new.user_id, v_exercise.id,
      row_number() over (order by s.set_number, s.id)::integer, s.reps, s.weight_kg
    from public.workout_sets s where s.session_id = new.id and s.user_id = new.user_id
      and s.exercise_id = v_exercise.id and s.set_number > 0
      and s.reps > 0 and s.weight_kg >= 0 and s.weight_kg <= 2000;
    update public.exercises set sets_goal = v_count,
      reps_goal = case when v_min_reps = v_max_reps then v_min_reps::text
        else v_min_reps::text || '-' || v_max_reps::text end
    where id = v_exercise.id and user_id = new.user_id and plan_id = new.plan_id;
    insert into public.exercise_load_default_sources
      (exercise_id, user_id, session_id, session_started_at, session_finished_at)
    values (v_exercise.id, new.user_id, new.id, new.started_at, new.finished_at)
    on conflict (exercise_id) do update set user_id = excluded.user_id,
      session_id = excluded.session_id, session_started_at = excluded.session_started_at,
      session_finished_at = excluded.session_finished_at, updated_at = now();
  end loop;
  return new;
end;
$$;
revoke all on function public.apply_finished_workout_load_defaults() from public, anon, authenticated;
drop trigger if exists workout_sessions_apply_load_defaults on public.workout_sessions;
create trigger workout_sessions_apply_load_defaults
after insert or update of status, finished_at, plan_id on public.workout_sessions
for each row execute function public.apply_finished_workout_load_defaults();

commit;
