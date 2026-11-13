-- Base para projetos novos, a partir do DDL fornecido pelo mantenedor.
-- Em um projeto existente, compare índices, funções e políticas antes de registrar esta base.
begin;
do $$
begin
  if to_regclass('public.workout_plans') is not null then
    raise exception 'A base inicial é para bancos novos. Confira o esquema existente antes de registrar esta migração.';
  end if;
end;
$$;

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  name text not null, created_at timestamptz not null default now()
);
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  plan_id uuid not null references public.workout_plans(id), name text not null,
  sets_goal integer not null default 3 check (sets_goal > 0), reps_goal text not null default '8-12',
  position integer not null default 0, created_at timestamptz not null default now(), photo_path text
);
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  plan_id uuid references public.workout_plans(id), started_at timestamptz not null default now(),
  finished_at timestamptz, notes text, duration_minutes integer, intensity text, active_calories numeric,
  weight_kg_snapshot numeric, height_cm_snapshot numeric, age_snapshot integer, sex_snapshot text,
  met_value numeric, exercise_count integer, sets_count integer, total_reps integer, total_volume_kg numeric,
  status text, volume_kg numeric, exercises_count integer, sets_completed integer, reps_completed integer
);
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  session_id uuid not null references public.workout_sessions(id) on delete cascade, exercise_id uuid references public.exercises(id),
  exercise_name text not null, set_number integer not null check (set_number > 0),
  reps integer not null default 0 check (reps >= 0), weight_kg numeric not null default 0 check (weight_kg >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  measured_on date not null default current_date, weight_kg numeric check (weight_kg > 0),
  chest_cm numeric check (chest_cm > 0), waist_cm numeric check (waist_cm > 0), hip_cm numeric check (hip_cm > 0),
  arm_cm numeric check (arm_cm > 0), thigh_cm numeric check (thigh_cm > 0), notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.physical_measurements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  measured_at date not null default current_date, weight_kg numeric not null check (weight_kg > 0 and weight_kg <= 500),
  body_fat_percentage numeric check (body_fat_percentage between 0 and 100),
  chest_cm numeric check (chest_cm > 0), waist_cm numeric check (waist_cm > 0), hip_cm numeric check (hip_cm > 0),
  arm_cm numeric check (arm_cm > 0), thigh_cm numeric check (thigh_cm > 0), notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.weekly_workout_schedule (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  day_of_week smallint not null check (day_of_week between 0 and 6), plan_id uuid references public.workout_plans(id) on delete set null,
  is_rest_day boolean not null default false, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.exercise_load_defaults (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  exercise_id uuid not null references public.exercises(id) on delete cascade, set_number integer not null check (set_number > 0),
  reps integer not null check (reps > 0), weight_kg numeric not null default 0 check (weight_kg >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.cardio_activities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  nome text not null, tipo text not null default 'Outro',
  duracao_min numeric check (duracao_min >= 0), distancia_km numeric check (distancia_km >= 0),
  calorias numeric check (calorias >= 0), observacoes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.cardio_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  activity_id uuid references public.cardio_activities(id) on delete set null, activity_name text not null,
  activity_type text not null default 'Outro', started_at timestamptz not null,
  duration_minutes numeric check (duration_minutes >= 0), distance_km numeric check (distance_km >= 0),
  calories numeric check (calories >= 0), notes text, created_at timestamptz not null default now(),
  active_calories numeric, intensity text, incline_percent numeric, heart_rate_avg integer,
  speed_kmh numeric, cadence_rpm numeric, weight_kg_snapshot numeric, met_value numeric,
  height_cm_snapshot numeric, age_snapshot integer, sex_snapshot text, floors_up integer, client_request_id text
);
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(), name text not null check (length(btrim(name)) between 1 and 70),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_user_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.family_members (
  family_id uuid not null references public.families(id), user_id uuid not null references auth.users(id),
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(), primary key(family_id,user_id)
);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  user_id uuid not null references auth.users(id), author_name text not null, author_avatar_url text,
  content text check (length(content) <= 1600), post_type text not null check (post_type in ('texto','foto','treino')),
  image_path text, workout_plan_name text, workout_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Índices necessários aos fluxos de upsert e idempotência do aplicativo.
create unique index if not exists tf_load_defaults_user_exercise_set on public.exercise_load_defaults(user_id,exercise_id,set_number);
create unique index if not exists tf_cardio_session_request on public.cardio_sessions(user_id,client_request_id);
create index if not exists tf_workout_user_started on public.workout_sessions(user_id,started_at,id);
create index if not exists tf_workout_plan_latest_completed
  on public.workout_sessions(user_id,plan_id,started_at desc,finished_at desc,id desc)
  where status='concluido' and finished_at is not null;
create index if not exists tf_cardio_user_started on public.cardio_sessions(user_id,started_at,id);
create index if not exists tf_exercises_plan_position on public.exercises(plan_id,position,id);
create index if not exists tf_family_posts_cursor on public.community_posts(family_id,created_at,id);
create index if not exists tf_measurements_user_date on public.physical_measurements(user_id,measured_at,created_at,id);

-- Permissões propostas para ambientes novos. Conferir as políticas reais antes do uso em ambiente existente.
do $$
declare t text;
begin
  foreach t in array array['workout_plans','exercises','workout_sessions','workout_sets','body_measurements',
    'physical_measurements','weekly_workout_schedule','exercise_load_defaults','cardio_activities','cardio_sessions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('drop policy if exists tf_owner on public.%I',t);
    execute format('create policy tf_owner on public.%I for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',t);
  end loop;
end;
$$;
-- Também valida a propriedade das referências recebidas do cliente.
create policy tf_exercises_own_plan on public.exercises as restrictive for all to authenticated
  using (true) with check (exists(select 1 from public.workout_plans p where p.id=plan_id and p.user_id=(select auth.uid())));
create policy tf_sessions_own_plan on public.workout_sessions as restrictive for all to authenticated
  using (true) with check (plan_id is null or exists(select 1 from public.workout_plans p where p.id=plan_id and p.user_id=(select auth.uid())));
create policy tf_sets_own_links on public.workout_sets as restrictive for all to authenticated using (true) with check (
  exists(select 1 from public.workout_sessions s where s.id=session_id and s.user_id=(select auth.uid()))
  and (exercise_id is null or exists(select 1 from public.exercises e where e.id=exercise_id and e.user_id=(select auth.uid())))
);
create policy tf_loads_own_exercise on public.exercise_load_defaults as restrictive for all to authenticated
  using (true) with check (exists(select 1 from public.exercises e where e.id=exercise_id and e.user_id=(select auth.uid())));
create policy tf_schedule_own_plan on public.weekly_workout_schedule as restrictive for all to authenticated
  using (true) with check (plan_id is null or exists(select 1 from public.workout_plans p where p.id=plan_id and p.user_id=(select auth.uid())));
create policy tf_cardio_own_activity on public.cardio_sessions as restrictive for all to authenticated
  using (true) with check (activity_id is null or exists(select 1 from public.cardio_activities a where a.id=activity_id and a.user_id=(select auth.uid())));
commit;
