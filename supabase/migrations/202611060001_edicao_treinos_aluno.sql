-- Execute após 202611050001_acompanhamento.sql. Edição da ficha do aluno sem
-- conceder escrita direta nas tabelas de treino nem acesso à sua autenticação.
begin;
create table if not exists public.coaching_workout_edits (
  operation_id uuid primary key,
  link_id uuid not null references public.coaching_links(id),
  actor_id uuid not null,
  action text not null,
  request jsonb not null,
  before_snapshot jsonb,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.coaching_workout_edits enable row level security;
revoke all on public.coaching_workout_edits from public, anon, authenticated;

create or replace function public.tf_coaching_plan_snapshot(p_plan uuid, p_user uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('plan', jsonb_build_object('id', p.id, 'name', p.name),
    'exercises', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'plan_id', e.plan_id, 'name', e.name, 'sets_goal', e.sets_goal,
      'reps_goal', e.reps_goal, 'position', e.position, 'photo_path', e.photo_path,
      'loads', coalesce((select jsonb_agg(jsonb_build_object('set_number', c.set_number,
        'reps', c.reps, 'weight_kg', c.weight_kg) order by c.set_number)
        from public.exercise_load_defaults c where c.exercise_id=e.id and c.user_id=p_user), '[]'::jsonb)
      ) order by e.position,e.id) from public.exercises e where e.plan_id=p.id and e.user_id=p_user), '[]'::jsonb))
  from public.workout_plans p where p.id=p_plan and p.user_id=p_user;
$$;
revoke all on function public.tf_coaching_plan_snapshot(uuid,uuid) from public, anon, authenticated;

create or replace function public.tf_coaching_workouts(p_link_id uuid, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u uuid := auth.uid();
  l public.coaching_links%rowtype;
  saved public.coaching_workout_edits%rowtype;
  plan uuid := (p_data->>'plan_id')::uuid;
  ex_id uuid := (p_data->>'exercise_id')::uuid;
  op uuid := (p_data->>'operation_id')::uuid;
  before_doc jsonb;
  after_doc jsonb;
  item jsonb;
  ex public.exercises%rowtype;
  other public.exercises%rowtype;
  temp_position integer;
  name_value text;
  photo text;
  n integer := 0;
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode='42501'; end if;
  select * into l from public.coaching_links where id=p_link_id for update;
  if not found or (l.coach_id is distinct from u and l.student_id<>u) or l.ended_at is not null or l.coach_id is null then
    raise exception 'O vínculo não está ativo. Reabra o acompanhamento.' using errcode='42501';
  end if;
  if p_action='list' then
    return jsonb_build_object('plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
      from public.workout_plans p where p.user_id=l.student_id),'[]'::jsonb));
  end if;
  if p_action='read' then
    after_doc := public.tf_coaching_plan_snapshot(plan,l.student_id);
    if after_doc is null then raise exception 'Treino não encontrado.' using errcode='42501'; end if;
    return after_doc || jsonb_build_object('version',md5(after_doc::text));
  end if;
  if p_action not in ('create_plan','rename_plan','delete_plan','create_exercise','update_exercise','delete_exercise','move_exercise','save_loads','set_photo') then
    raise exception 'Operação não permitida.' using errcode='42501';
  end if;
  if op is null then raise exception 'Identificador da operação obrigatório.'; end if;
  select * into saved from public.coaching_workout_edits where operation_id=op;
  if found then
    if saved.actor_id<>u or saved.link_id<>l.id or saved.action<>p_action or saved.request<>p_data then
      raise exception 'Identificador já utilizado por outra operação.' using errcode='42501';
    end if;
    return saved.response;
  end if;
  if p_action='create_plan' then
    name_value := btrim(p_data->>'name');
    if name_value is null or length(name_value) not between 1 and 100 then raise exception 'Informe um nome com até 100 caracteres.'; end if;
    plan := gen_random_uuid();
    insert into public.workout_plans(id,user_id,name) values(plan,l.student_id,name_value);
  else
    perform 1 from public.workout_plans where id=plan and user_id=l.student_id for update;
    if not found then raise exception 'Treino não encontrado.' using errcode='42501'; end if;
    perform 1 from public.exercises where plan_id=plan and user_id=l.student_id order by id for update;
    perform 1 from public.exercise_load_defaults where user_id=l.student_id and exercise_id in
      (select id from public.exercises where plan_id=plan and user_id=l.student_id) order by exercise_id,set_number for update;
    before_doc := public.tf_coaching_plan_snapshot(plan,l.student_id);
    if p_data->>'version' is distinct from md5(before_doc::text) then
      raise exception 'Este treino mudou em outro aparelho. Atualize o treino antes de salvar novamente.' using errcode='40001';
    end if;
    if exists(select 1 from public.workout_sessions where user_id=l.student_id and plan_id=plan and status='em_andamento') then
      raise exception 'Há uma sessão deste treino em andamento. Aguarde a conclusão para editar a ficha.';
    end if;
    if p_action in ('create_exercise','update_exercise','rename_plan') then
      name_value := btrim(p_data->>'name');
      if name_value is null or length(name_value) not between 1 and 100 then raise exception 'Informe um nome com até 100 caracteres.'; end if;
    end if;
    if p_action in ('create_exercise','update_exercise') then
      if jsonb_typeof(p_data->'sets_goal') is distinct from 'number' or (p_data->>'sets_goal')!~'^[0-9]+$'
        or (p_data->>'sets_goal')::integer not between 1 and 20
        or jsonb_typeof(p_data->'reps_goal') is distinct from 'string' or length(btrim(p_data->>'reps_goal')) not between 1 and 100 then
        raise exception 'Informe de 1 a 20 séries e as repetições.';
      end if;
    end if;
    if p_action in ('update_exercise','delete_exercise','move_exercise','save_loads','set_photo') then
      select * into ex from public.exercises where id=ex_id and plan_id=plan and user_id=l.student_id;
      if not found then raise exception 'Exercício não encontrado neste treino.' using errcode='42501'; end if;
    end if;
    case p_action
    when 'rename_plan' then
      update public.workout_plans set name=name_value where id=plan and user_id=l.student_id;
    when 'create_exercise' then
      insert into public.exercises(id,user_id,plan_id,name,sets_goal,reps_goal,position)
        values(gen_random_uuid(),l.student_id,plan,name_value,(p_data->>'sets_goal')::integer,btrim(p_data->>'reps_goal'),
          (select coalesce(max(position),-1)+1 from public.exercises where plan_id=plan and user_id=l.student_id));
    when 'update_exercise' then
      update public.exercises set name=name_value,sets_goal=(p_data->>'sets_goal')::integer,reps_goal=btrim(p_data->>'reps_goal') where id=ex.id;
    when 'move_exercise' then
      select * into other from public.exercises where id=(p_data->>'other_id')::uuid and plan_id=plan and user_id=l.student_id;
      if not found or other.id=ex.id then raise exception 'Confira a ordem dos exercícios.'; end if;
      select coalesce(max(position),0)+1 into temp_position from public.exercises where plan_id=plan and user_id=l.student_id;
      update public.exercises set position=temp_position where id=ex.id;
      update public.exercises set position=ex.position where id=other.id;
      update public.exercises set position=other.position where id=ex.id;
    when 'save_loads' then
      if jsonb_typeof(p_data->'loads') is distinct from 'array' then raise exception 'Informe as séries.'; end if;
      if jsonb_array_length(p_data->'loads') not between 1 and 100 then raise exception 'Informe de 1 a 100 séries.'; end if;
      for item in select value from jsonb_array_elements(p_data->'loads') loop
        if jsonb_typeof(item->'reps') is distinct from 'number' or (item->>'reps')!~'^[0-9]+$' or (item->>'reps')::numeric not between 1 and 999
          or jsonb_typeof(item->'weight_kg') is distinct from 'number' or (item->>'weight_kg')::numeric not between 0 and 2000 then
          raise exception 'Confira repetições e cargas das séries.';
        end if;
      end loop;
      delete from public.exercise_load_defaults where exercise_id=ex.id and user_id=l.student_id;
      for item in select value from jsonb_array_elements(p_data->'loads') loop
        n:=n+1;
        insert into public.exercise_load_defaults(user_id,exercise_id,set_number,reps,weight_kg)
          values(l.student_id,ex.id,n,(item->>'reps')::integer,(item->>'weight_kg')::numeric);
      end loop;
    when 'set_photo' then
      photo:=p_data->>'photo_path';
      if photo is null or split_part(photo,'/',1)<>l.student_id::text or split_part(photo,'/',2)<>ex.id::text
        or photo!~'^[0-9a-f-]+/[0-9a-f-]+/[0-9]+\.(jpg|jpeg|png|webp)$' then raise exception 'Caminho de foto inválido.'; end if;
      if not exists(select 1 from storage.objects where bucket_id='exercise-photos' and name=photo) then raise exception 'Envie a foto antes de salvar.'; end if;
      update public.exercises set photo_path=photo where id=ex.id;
    when 'delete_exercise' then
      update public.workout_sets set exercise_id=null where user_id=l.student_id and exercise_id=ex.id;
      delete from public.exercise_load_defaults where user_id=l.student_id and exercise_id=ex.id;
      delete from public.exercises where id=ex.id and user_id=l.student_id;
    when 'delete_plan' then
      update public.workout_sets set exercise_id=null where user_id=l.student_id and exercise_id in
        (select id from public.exercises where plan_id=plan and user_id=l.student_id);
      update public.workout_sessions set plan_id=null where user_id=l.student_id and plan_id=plan;
      delete from public.exercise_load_defaults where user_id=l.student_id and exercise_id in
        (select id from public.exercises where plan_id=plan and user_id=l.student_id);
      delete from public.exercises where plan_id=plan and user_id=l.student_id;
      delete from public.workout_plans where id=plan and user_id=l.student_id;
    end case;
  end if;
  after_doc:=public.tf_coaching_plan_snapshot(plan,l.student_id);
  if after_doc is not null then after_doc:=after_doc || jsonb_build_object('version',md5(after_doc::text)); end if;
  after_doc:=jsonb_build_object('plan_id',plan,'snapshot',after_doc);
  insert into public.coaching_workout_edits(operation_id,link_id,actor_id,action,request,before_snapshot,response)
    values(op,l.id,u,p_action,p_data,before_doc,after_doc);
  return after_doc;
end;
$$;
revoke all on function public.tf_coaching_workouts(uuid,text,jsonb) from public, anon;
grant execute on function public.tf_coaching_workouts(uuid,text,jsonb) to authenticated;

-- Fotos de exercícios, exclusivamente. Não libera fotos de perfil/medidas.
create or replace function public.tf_coaching_exercise_photo(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and p_name ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9]+\.(jpg|jpeg|png|webp)$'
    and exists(select 1 from public.exercises e where e.id::text=split_part(p_name,'/',2)
      and e.user_id::text=split_part(p_name,'/',1) and (e.user_id=auth.uid() or exists(
        select 1 from public.coaching_links l where l.student_id=e.user_id and l.coach_id=auth.uid() and l.ended_at is null)));
$$;
revoke all on function public.tf_coaching_exercise_photo(text) from public, anon;
grant execute on function public.tf_coaching_exercise_photo(text) to authenticated;
drop policy if exists coaching_exercise_photos_read on storage.objects;
create policy coaching_exercise_photos_read on storage.objects for select to authenticated
  using(bucket_id='exercise-photos' and public.tf_coaching_exercise_photo(name));
drop policy if exists coaching_exercise_photos_insert on storage.objects;
create policy coaching_exercise_photos_insert on storage.objects for insert to authenticated
  with check(bucket_id='exercise-photos' and public.tf_coaching_exercise_photo(name));
-- Sem UPDATE/DELETE de fotos pelo treinador: substituir mantém os arquivos anteriores.
commit;
