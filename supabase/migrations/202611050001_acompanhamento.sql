-- Acompanhamento consentido. Não altera as políticas das tabelas de treino.
-- Fichas publicadas são cópias do aluno; encerrar vínculo não exclui registros.
begin;

create table if not exists public.coaching_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references auth.users(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  coach_name text not null,
  student_name text not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (coach_id is distinct from student_id)
);
create unique index if not exists coaching_active_pair on public.coaching_links(coach_id, student_id) where ended_at is null;
create index if not exists coaching_student on public.coaching_links(student_id);
create table if not exists public.coaching_invites (
  id uuid primary key,
  code uuid not null unique default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  coach_name text not null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  link_id uuid references public.coaching_links(id)
);
create index if not exists coaching_invites_coach on public.coaching_invites(coach_id);
create table if not exists public.coaching_drafts (
  id uuid primary key,
  link_id uuid not null references public.coaching_links(id),
  document jsonb not null,
  revision integer not null default 1,
  published_revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists coaching_drafts_link on public.coaching_drafts(link_id);
create table if not exists public.coaching_deliveries (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.coaching_drafts(id),
  link_id uuid not null references public.coaching_links(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  revision integer not null,
  coach_name text not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique(draft_id, revision)
);
create index if not exists coaching_deliveries_plan on public.coaching_deliveries(plan_id);
create index if not exists coaching_deliveries_user on public.coaching_deliveries(user_id);
create table if not exists public.coaching_feedback (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  comment text not null check (length(comment) <= 2000),
  updated_at timestamptz not null default now()
);

-- Nenhuma tabela deste módulo aceita acesso direto do cliente.
alter table public.coaching_links enable row level security;
alter table public.coaching_invites enable row level security;
alter table public.coaching_drafts enable row level security;
alter table public.coaching_deliveries enable row level security;
alter table public.coaching_feedback enable row level security;
revoke all on public.coaching_links, public.coaching_invites, public.coaching_drafts,
  public.coaching_deliveries, public.coaching_feedback from public, anon, authenticated;

create or replace function public.tf_coaching(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u uuid := auth.uid();
  link public.coaching_links%rowtype;
  invite public.coaching_invites%rowtype;
  draft public.coaching_drafts%rowtype;
  delivery public.coaching_deliveries%rowtype;
  doc jsonb;
  ex jsonb;
  delivered_exercises jsonb := '[]'::jsonb;
  result jsonb;
  target uuid;
  plan uuid;
  exercise uuid;
  n integer := 0;
  reps integer;
  username text;
  plan_name text;
  suffix integer := 0;
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Dados inválidos.'; end if;
  select left(coalesce(nullif(btrim(raw_user_meta_data->>'nome'), ''),
    nullif(btrim(raw_user_meta_data->>'full_name'), ''), 'Participante'), 100)
    into username from auth.users where id = u;

  if p_action = 'home' then
    return jsonb_build_object(
      'links', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc)
        from public.coaching_links l where l.coach_id = u or l.student_id = u), '[]'::jsonb),
      'invites', coalesce((select jsonb_agg(to_jsonb(i) order by i.expires_at desc)
        from public.coaching_invites i where i.coach_id = u and i.revoked_at is null
          and i.link_id is null and i.expires_at > now()), '[]'::jsonb));
  elsif p_action = 'invite_create' then
    target := (p_data->>'id')::uuid;
    if target is null then raise exception 'Identificador obrigatório.'; end if;
    insert into public.coaching_invites(id, coach_id, coach_name) values(target, u, username)
      on conflict(id) do nothing;
    select * into invite from public.coaching_invites where id = target and coach_id = u;
    if not found then raise exception 'Convite indisponível.' using errcode = '42501'; end if;
    return to_jsonb(invite);
  elsif p_action = 'invite_revoke' then
    update public.coaching_invites set revoked_at = coalesce(revoked_at, now())
      where id = (p_data->>'id')::uuid and coach_id = u;
    if not found then raise exception 'Convite indisponível.' using errcode = '42501'; end if;
    return 'true'::jsonb;
  elsif p_action in ('invite_preview', 'invite_accept') then
    select * into invite from public.coaching_invites where code = (p_data->>'code')::uuid for update;
    if not found or invite.revoked_at is not null or invite.coach_id = u then
      raise exception 'Convite inválido ou indisponível.';
    end if;
    if invite.link_id is not null then
      if p_action = 'invite_accept' and invite.accepted_by = u then
        select * into link from public.coaching_links where id = invite.link_id;
        if link.ended_at is null then return to_jsonb(link); end if;
      end if;
      raise exception 'Este convite já foi utilizado. Peça um novo convite.';
    end if;
    if invite.expires_at <= now() then raise exception 'Convite expirado. Peça um novo convite.'; end if;
    if p_action = 'invite_preview' then
      return jsonb_build_object('coach_name', invite.coach_name, 'expires_at', invite.expires_at);
    end if;
    if p_data->'consent' is distinct from 'true'::jsonb then raise exception 'Confirme o compartilhamento dos treinos.'; end if;
    -- A restrição parcial resolve aceites concorrentes de convites do mesmo treinador.
    insert into public.coaching_links(coach_id, student_id, coach_name, student_name)
      values(invite.coach_id, u, invite.coach_name, username)
      on conflict(coach_id, student_id) where ended_at is null do update
        set student_name = excluded.student_name returning * into link;
    update public.coaching_invites set accepted_by = u, link_id = link.id where id = invite.id;
    return to_jsonb(link);
  elsif p_action = 'delivery' then
    -- A leitura do aluno não depende de vínculo ativo, inclusive após separação.
    select * into delivery from public.coaching_deliveries
      where plan_id = (p_data->>'plan_id')::uuid and user_id = u;
    if not found then return 'null'::jsonb; end if;
    return to_jsonb(delivery);
  elsif p_action = 'my_deliveries' then
    return coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from public.coaching_deliveries d where d.user_id = u), '[]'::jsonb);
  elsif p_action = 'feedback' then
    target := (p_data->>'session_id')::uuid;
    if not exists(select 1 from public.workout_sessions s where s.id = target and s.user_id = u and s.status = 'concluido') then
      raise exception 'Escolha um treino concluído da sua conta.' using errcode = '42501';
    end if;
    if jsonb_typeof(p_data->'comment') is distinct from 'string' or length(p_data->>'comment') > 2000 then
      raise exception 'A observação deve ter até 2000 caracteres.';
    end if;
    insert into public.coaching_feedback(session_id, user_id, comment)
      values(target, u, btrim(p_data->>'comment')) on conflict(session_id) do update
        set comment = excluded.comment, updated_at = now();
    return 'true'::jsonb;
  end if;

  if p_action = 'my_history' then
    target := u;
  else
    -- Mesmo lock para publicar/salvar/consultar e encerrar: após a revogação,
    -- nenhuma nova operação do treinador passa na autorização.
    select * into link from public.coaching_links where id = (p_data->>'link_id')::uuid for update;
    if not found or (link.coach_id is distinct from u and link.student_id <> u) then
      raise exception 'Vínculo não disponível.' using errcode = '42501';
    end if;
    if p_action = 'end' then
      update public.coaching_links set ended_at = coalesce(ended_at, now()) where id = link.id;
      -- Deliberadamente não altera planos, exercícios, cargas, sessões ou fichas.
      return 'true'::jsonb;
    end if;
    if link.ended_at is not null or link.coach_id is null then
      raise exception 'O vínculo foi encerrado. Seus próprios registros continuam disponíveis.' using errcode = '42501';
    end if;
    target := link.student_id;
  end if;

  if p_action in ('history', 'my_history') then
    -- Campos explícitos: nenhuma informação de nutrição, medidas, fotos ou autenticação.
    select coalesce(jsonb_agg(to_jsonb(t) order by t.started_at desc, t.id desc), '[]'::jsonb) into result from (
      select s.id, s.started_at, s.finished_at, s.duration_minutes, s.intensity,
        s.notes, coalesce(p.name, 'Treino') as plan_name, coalesce(f.comment, '') as comment,
        coalesce((select jsonb_agg(jsonb_build_object('exercise_name', ws.exercise_name,
          'set_number', ws.set_number, 'reps', ws.reps, 'weight_kg', ws.weight_kg)
          order by ws.exercise_name, ws.set_number, ws.id)
          from public.workout_sets ws where ws.session_id = s.id and ws.user_id = target), '[]'::jsonb) as sets
      from public.workout_sessions s left join public.workout_plans p on p.id = s.plan_id and p.user_id = target
      left join public.coaching_feedback f on f.session_id = s.id and f.user_id = target
      where s.user_id = target and s.status = 'concluido'
      order by s.started_at desc, s.id desc limit 20 offset greatest(0, least(100000, coalesce((p_data->>'offset')::integer, 0)))
    ) t;
    return jsonb_build_object('sessions', result, 'total', (select count(*) from public.workout_sessions
      where user_id = target and status = 'concluido'), 'last30', (select count(*) from public.workout_sessions
      where user_id = target and status = 'concluido' and started_at >= now() - interval '30 days' and started_at <= now()));
  end if;
  if p_action = 'plans' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.name, t.id), '[]'::jsonb) into result from (
      select p.id, p.name, coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'sets', e.sets_goal,
        'reps', e.reps_goal, 'weight', coalesce((select c.weight_kg from public.exercise_load_defaults c
          where c.exercise_id = e.id and c.user_id = target and c.set_number = 1), 0),
        'rest', coalesce((select (item->>'rest')::integer from public.coaching_deliveries d,
          lateral jsonb_array_elements(d.document->'exercises') item
          where d.plan_id = p.id and d.user_id = target and item->>'exercise_id' = e.id::text limit 1), 60),
        'instructions', coalesce((select item->>'instructions' from public.coaching_deliveries d,
          lateral jsonb_array_elements(d.document->'exercises') item
          where d.plan_id = p.id and d.user_id = target and item->>'exercise_id' = e.id::text limit 1), ''),
        'loads', coalesce((select jsonb_agg(jsonb_build_object('set_number', c.set_number, 'reps', c.reps, 'weight_kg', c.weight_kg) order by c.set_number)
          from public.exercise_load_defaults c where c.exercise_id = e.id and c.user_id = target), '[]'::jsonb))
        order by e.position, e.id) from public.exercises e where e.plan_id = p.id and e.user_id = target), '[]'::jsonb) as exercises
      from public.workout_plans p where p.user_id = target order by p.name, p.id
      limit 20 offset greatest(0, least(100000, coalesce((p_data->>'offset')::integer, 0)))
    ) t;
    return jsonb_build_object('plans', result, 'total', (select count(*) from public.workout_plans where user_id = target));
  end if;
  if link.coach_id is distinct from u then raise exception 'Somente o treinador pode preparar fichas.' using errcode = '42501'; end if;
  if p_action = 'drafts' then
    return coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc)
      from public.coaching_drafts d where d.link_id = link.id), '[]'::jsonb);
  elsif p_action = 'draft_save' then
    doc := p_data->'document';
    if jsonb_typeof(doc) is distinct from 'object' or jsonb_typeof(doc->'name') is distinct from 'string'
      or length(btrim(doc->>'name')) not between 1 and 80
      or jsonb_typeof(doc->'instructions') is distinct from 'string' or length(doc->>'instructions') > 2000
      or jsonb_typeof(doc->'exercises') is distinct from 'array' then raise exception 'Confira nome e orientações da ficha.'; end if;
    if jsonb_array_length(doc->'exercises') not between 1 and 50 then raise exception 'Inclua de 1 a 50 exercícios.'; end if;
    for ex in select value from jsonb_array_elements(doc->'exercises') loop
      if jsonb_typeof(ex->'name') is distinct from 'string' or length(btrim(ex->>'name')) not between 1 and 100
        or jsonb_typeof(ex->'sets') is distinct from 'number' or (ex->>'sets') !~ '^[0-9]+$' or (ex->>'sets')::numeric not between 1 and 30
        or jsonb_typeof(ex->'reps') is distinct from 'string' or length(btrim(ex->>'reps')) not between 1 and 30
        or (ex->>'reps') !~ '^[0-9]{1,3}(-[0-9]{1,3})?$'
        or split_part(ex->>'reps', '-', 1)::integer not between 1 and 999
        or (position('-' in (ex->>'reps')) > 0 and split_part(ex->>'reps', '-', 2)::integer < split_part(ex->>'reps', '-', 1)::integer)
        or jsonb_typeof(ex->'weight') is distinct from 'number' or (ex->>'weight')::numeric not between 0 and 2000
        or jsonb_typeof(ex->'rest') is distinct from 'number' or (ex->>'rest') !~ '^[0-9]+$' or (ex->>'rest')::numeric not between 0 and 3600
        or jsonb_typeof(ex->'instructions') is distinct from 'string' or length(ex->>'instructions') > 1000
      then raise exception 'Confira séries, repetições, carga, descanso e orientações de cada exercício.'; end if;
    end loop;
    target := (p_data->>'id')::uuid;
    select * into draft from public.coaching_drafts where id = target for update;
    if found then
      if draft.link_id <> link.id then raise exception 'Ficha de outro vínculo.' using errcode = '42501'; end if;
      -- Resposta perdida: repetir exatamente o mesmo salvamento não cria outra revisão.
      if draft.document = doc and draft.revision = (p_data->>'revision')::integer + 1 then return to_jsonb(draft); end if;
      if draft.revision is distinct from (p_data->>'revision')::integer then raise exception 'A ficha mudou em outro aparelho. Reabra a ficha antes de editar.'; end if;
      if draft.document = doc then return to_jsonb(draft); end if;
      update public.coaching_drafts set document = doc, revision = revision + 1, updated_at = now()
        where id = target returning * into draft;
    else
      if (p_data->>'revision')::integer is distinct from 0 then raise exception 'Ficha não encontrada. Reabra o acompanhamento.'; end if;
      insert into public.coaching_drafts(id, link_id, document) values(target, link.id, doc) returning * into draft;
    end if;
    return to_jsonb(draft);
  elsif p_action = 'publish' then
    select * into draft from public.coaching_drafts where id = (p_data->>'id')::uuid and link_id = link.id for update;
    if not found then raise exception 'Ficha não encontrada.'; end if;
    if draft.revision is distinct from (p_data->>'revision')::integer then raise exception 'A ficha mudou. Confira a versão antes de disponibilizar.'; end if;
    select * into delivery from public.coaching_deliveries where draft_id = draft.id and revision = draft.revision;
    if found then return to_jsonb(delivery); end if;
    -- Nova cópia a cada publicação: não modifica sessão em andamento/offline nem histórico.
    loop
      plan := gen_random_uuid();
      plan_name := btrim(draft.document->>'name') || ' · v' || draft.revision || case when suffix = 0 then '' else ' (' || (suffix + 1) || ')' end;
      insert into public.workout_plans(id, user_id, name) values(plan, link.student_id, plan_name) on conflict do nothing;
      exit when found;
      suffix := suffix + 1;
      if suffix >= 100 then raise exception 'Há muitos treinos com este nome. Renomeie a ficha antes de disponibilizar.'; end if;
    end loop;
    for ex in select value from jsonb_array_elements(draft.document->'exercises') loop
      exercise := gen_random_uuid(); n := n + 1;
      insert into public.exercises(id, user_id, plan_id, name, sets_goal, reps_goal, position)
        values(exercise, link.student_id, plan, btrim(ex->>'name'), (ex->>'sets')::integer, ex->>'reps', n);
      reps := split_part(ex->>'reps', '-', 1)::integer;
      insert into public.exercise_load_defaults(user_id, exercise_id, set_number, reps, weight_kg)
        select link.student_id, exercise, s, reps, (ex->>'weight')::numeric from generate_series(1, (ex->>'sets')::integer) s;
      delivered_exercises := delivered_exercises || jsonb_build_array(ex || jsonb_build_object('exercise_id', exercise));
    end loop;
    insert into public.coaching_deliveries(draft_id, link_id, user_id, plan_id, revision, coach_name, document)
      values(draft.id, link.id, link.student_id, plan, draft.revision, link.coach_name,
        draft.document || jsonb_build_object('exercises', delivered_exercises)) returning * into delivery;
    update public.coaching_drafts set published_revision = revision where id = draft.id;
    return to_jsonb(delivery);
  end if;
  raise exception 'Operação de acompanhamento desconhecida.';
end;
$$;
revoke all on function public.tf_coaching(text, jsonb) from public, anon;
grant execute on function public.tf_coaching(text, jsonb) to authenticated;
commit;
