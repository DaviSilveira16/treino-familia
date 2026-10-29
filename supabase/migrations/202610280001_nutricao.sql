-- Treino Família: nutrição privada, documentos atômicos e controle de revisão.
-- Aplicar uma vez no SQL Editor do projeto Supabase antes do catálogo 002.
begin;

create table if not exists public.nutrition_days (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid,
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create table if not exists public.nutrition_templates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.nutrition_goals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.nutrition_preferences (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid,
  updated_at timestamptz not null default now(),
  check (id = user_id)
);
create table if not exists public.nutrition_foods (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  operation_id uuid,
  updated_at timestamptz not null default now()
);

-- Recibos tornam um reenvio idempotente mesmo se outro aparelho já tiver
-- gravado uma revisão posterior após a resposta original se perder.
create table if not exists public.nutrition_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_days_user_date on public.nutrition_days(user_id, local_date);
create index if not exists nutrition_templates_user on public.nutrition_templates(user_id, id);
create index if not exists nutrition_goals_user_date on public.nutrition_goals(user_id, effective_from);
create index if not exists nutrition_foods_user on public.nutrition_foods(user_id, id);
create index if not exists nutrition_foods_name on public.nutrition_foods(name, id);
create index if not exists nutrition_operations_user on public.nutrition_operations(user_id, created_at);

alter table public.nutrition_days enable row level security;
alter table public.nutrition_templates enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.nutrition_preferences enable row level security;
alter table public.nutrition_foods enable row level security;
alter table public.nutrition_operations enable row level security;

-- PostgreSQL combina políticas permissivas com OR. Remove políticas antigas
-- destas tabelas próprias do módulo antes de definir seu único contrato.
do $$
declare existing_policy record;
begin
  for existing_policy in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('nutrition_days','nutrition_templates','nutrition_goals','nutrition_preferences','nutrition_foods','nutrition_operations') loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end;
$$;

drop policy if exists nutrition_days_read on public.nutrition_days;
create policy nutrition_days_read on public.nutrition_days for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nutrition_templates_read on public.nutrition_templates;
create policy nutrition_templates_read on public.nutrition_templates for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nutrition_goals_read on public.nutrition_goals;
create policy nutrition_goals_read on public.nutrition_goals for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nutrition_preferences_read on public.nutrition_preferences;
create policy nutrition_preferences_read on public.nutrition_preferences for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists nutrition_foods_read on public.nutrition_foods;
create policy nutrition_foods_read on public.nutrition_foods for select to authenticated using (user_id is null or user_id = (select auth.uid()));

-- Leituras têm RLS. Escritas de clientes passam exclusivamente pelo RPC abaixo;
-- o catálogo público só pode ser administrado por migração/service role.
revoke all on public.nutrition_days, public.nutrition_templates, public.nutrition_goals,
  public.nutrition_preferences, public.nutrition_foods, public.nutrition_operations from public, anon, authenticated;
grant select on public.nutrition_days, public.nutrition_templates, public.nutrition_goals,
  public.nutrition_preferences, public.nutrition_foods to authenticated;

create or replace function public.nutrition_valid_date(value text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare parsed date;
begin
  if value is null or value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  parsed := value::date;
  return to_char(parsed, 'YYYY-MM-DD') = value;
exception when others then return false;
end;
$$;

create or replace function public.nutrition_valid_nutrients(value jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare field text;
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  foreach field in array array['kcal','proteinas','carboidratos','gorduras'] loop
    if jsonb_typeof(value->field) is distinct from 'number' then return false; end if;
    if (value->>field)::numeric < 0 or (value->>field)::numeric > 100000 then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.nutrition_valid_meals(value jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare meal jsonb; item jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 100 then return false; end if;
  for meal in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(meal) <> 'object' or coalesce(length(trim(meal->>'nome')),0) = 0
       or coalesce(length(meal->>'nome'),0) > 200 or jsonb_typeof(meal->'itens') is distinct from 'array'
       or coalesce(meal->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    if jsonb_array_length(meal->'itens') > 300 then return false; end if;
    for item in select * from jsonb_array_elements(meal->'itens') loop
      if jsonb_typeof(item) <> 'object' or coalesce(length(trim(item->>'nome')),0) = 0
         or jsonb_typeof(item->'gramas') is distinct from 'number'
         or jsonb_typeof(item->'baseGramas') is distinct from 'number'
         or jsonb_typeof(item->'consumido') is distinct from 'boolean'
         or coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      if (item->>'gramas')::numeric <= 0 or (item->>'gramas')::numeric > 100000
         or (item->>'baseGramas')::numeric <= 0 or (item->>'baseGramas')::numeric > 100000
         or not public.nutrition_valid_nutrients(item->'nutrientesBase') then return false; end if;
    end loop;
    if (select count(*) <> count(distinct entry->>'id') from jsonb_array_elements(meal->'itens') entry) then return false; end if;
  end loop;
  if (select count(*) <> count(distinct entry->>'id') from jsonb_array_elements(value) entry) then return false; end if;
  return true;
end;
$$;

create or replace function public.nutrition_valid_goal(value jsonb, owner_id uuid)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare field text; profile jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object'
     or value->>'usuarioId' is distinct from owner_id::text
     or coalesce(value->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not public.nutrition_valid_date(value->>'vigenteDesde')
     or coalesce(value->>'objetivo','') not in ('manter','perder','ganhar')
     or value->>'metodo' is distinct from 'repouso-rotina-v1'
     or jsonb_typeof(value->'fatorRotina') is distinct from 'number'
     or jsonb_typeof(value->'restricaoAutomatica') is distinct from 'boolean'
     or jsonb_typeof(value->'toleranciaKcal') is distinct from 'number' then return false; end if;
  if (value->>'fatorRotina')::numeric < 1 or (value->>'fatorRotina')::numeric > 3 then return false; end if;
  foreach field in array array['metaKcal','metaProteinas','metaCarboidratos','metaGorduras','repousoKcal','baseDiariaKcal','toleranciaKcal'] loop
    if value->field is null then return false; end if;
    if value->field <> 'null'::jsonb then
      if jsonb_typeof(value->field) <> 'number' then return false; end if;
      if (value->>field)::numeric < 0 or (value->>field)::numeric > 100000 then return false; end if;
    end if;
  end loop;
  profile := value->'perfil';
  if profile is null then return false; end if;
  if profile <> 'null'::jsonb then
    if jsonb_typeof(profile) <> 'object' or coalesce(profile->>'sexo','') not in ('masculino','feminino') then return false; end if;
    foreach field in array array['pesoKg','alturaCm','idade'] loop
      if jsonb_typeof(profile->field) is distinct from 'number' then return false; end if;
    end loop;
    if (profile->>'pesoKg')::numeric <= 0 or (profile->>'pesoKg')::numeric > 500
       or (profile->>'alturaCm')::numeric < 50 or (profile->>'alturaCm')::numeric > 300
       or (profile->>'idade')::numeric < 1 or (profile->>'idade')::numeric > 120
       or (profile->>'idade')::numeric <> trunc((profile->>'idade')::numeric) then return false; end if;
  end if;
  return true;
end;
$$;

create or replace function public.nutrition_save_document(
  p_type text, p_id uuid, p_document jsonb,
  p_expected_revision bigint, p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  owner_id uuid := auth.uid();
  table_name text;
  current_row record;
  receipt record;
  result jsonb;
  new_revision bigint;
  local_day date;
  effective_day date;
  row_id uuid;
  inserted_id uuid;
  fingerprint text := md5(p_type || ':' || p_id::text || ':' || p_document::text);
begin
  if owner_id is null then raise exception 'Sessão inválida para salvar a nutrição.' using errcode = '42501'; end if;
  if p_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0
     or jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text) > 512000 then
    raise exception 'Documento de nutrição inválido.' using errcode = '22023';
  end if;
  table_name := case p_type when 'day' then 'nutrition_days' when 'template' then 'nutrition_templates'
    when 'goal' then 'nutrition_goals' when 'preferences' then 'nutrition_preferences'
    when 'food' then 'nutrition_foods' else null end;
  if table_name is null then raise exception 'Tipo de nutrição inválido.' using errcode = '22023'; end if;

  if p_type <> 'preferences' then
    if p_document->>'usuarioId' is distinct from owner_id::text or p_document->>'id' is distinct from p_id::text then
      raise exception 'Este documento de nutrição pertence a outra conta ou identificador.' using errcode = '42501';
    end if;
  elsif p_id <> owner_id then
    raise exception 'Preferências de outra conta.' using errcode = '42501';
  end if;

  if p_type in ('day','template') and not public.nutrition_valid_meals(p_document->'refeicoes') then
    raise exception 'Confira as refeições, quantidades e nutrientes.' using errcode = '22023';
  end if;
  if p_type = 'day' then
    if not public.nutrition_valid_date(p_document->>'data') or jsonb_typeof(p_document->'concluido') is distinct from 'boolean' then
      raise exception 'Data ou confirmação do diário inválida.' using errcode = '22023';
    end if;
    local_day := (p_document->>'data')::date;
    if (p_document->>'concluido')::boolean and local_day > (now() at time zone 'UTC')::date + 1 then
      raise exception 'Não é possível confirmar um diário futuro.' using errcode = '22023';
    end if;
    if p_document->'configuracao' is null then raise exception 'Configuração do diário ausente.' using errcode = '22023'; end if;
    if p_document->'configuracao' <> 'null'::jsonb then
      if p_document->'configuracao'->>'usuarioId' is distinct from owner_id::text then
        raise exception 'Configuração de outra conta no diário.' using errcode = '42501';
      end if;
      if not public.nutrition_valid_goal(p_document->'configuracao', owner_id) then
        raise exception 'Configuração inválida no diário.' using errcode = '22023';
      end if;
      if (p_document->'configuracao'->>'vigenteDesde')::date > local_day then
        raise exception 'Esta configuração ainda não estava vigente na data do diário.' using errcode = '22023';
      end if;
    end if;
    execute format('select id, revision, document, operation_id from public.%I where user_id = $1 and local_date = $2 for update', table_name)
      into current_row using owner_id, local_day;
  else
    if p_type = 'template' and (not public.nutrition_valid_date(p_document->>'vigenteDesde')
      or coalesce(length(trim(p_document->>'nome')),0) = 0 or jsonb_typeof(p_document->'versao') is distinct from 'number'
      or (p_document->>'versao')::numeric < 1 or (p_document->>'versao')::numeric > 1000000
      or (p_document->>'versao')::numeric <> trunc((p_document->>'versao')::numeric)
      or coalesce(p_document->>'grupoId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or length(p_document->>'nome') > 200) then
      raise exception 'Confira o nome, a versão e a vigência da dieta.' using errcode = '22023';
    end if;
    if p_type = 'goal' then
      if not public.nutrition_valid_goal(p_document, owner_id) then
        raise exception 'Confira as metas e o método de estimativa.' using errcode = '22023';
      end if;
      effective_day := (p_document->>'vigenteDesde')::date;
    end if;
    if p_type = 'food' and (coalesce(length(trim(p_document->>'nome')),0) = 0
      or coalesce(length(trim(p_document->>'fonte')),0) = 0
      or jsonb_typeof(p_document->'baseGramas') is distinct from 'number'
      or (p_document->>'baseGramas')::numeric <= 0 or (p_document->>'baseGramas')::numeric > 100000
      or length(p_document->>'nome') > 200 or length(p_document->>'fonte') > 2000
      or not public.nutrition_valid_nutrients(p_document->'nutrientes')) then
      raise exception 'Confira o alimento, sua fonte, porção e valores nutricionais.' using errcode = '22023';
    end if;
    if p_type = 'preferences' and (jsonb_typeof(p_document->'repetirDiariamente') is distinct from 'boolean'
      or jsonb_typeof(p_document->'favoritos') is distinct from 'array'
      or jsonb_typeof(p_document->'recentes') is distinct from 'array'
      or p_document->>'repetirDesde' is null
      or (p_document->>'repetirDesde' <> '' and not public.nutrition_valid_date(p_document->>'repetirDesde'))) then
      raise exception 'Preferências de nutrição inválidas.' using errcode = '22023';
    end if;
    if p_type = 'preferences' then
      if jsonb_array_length(p_document->'favoritos') > 200 or jsonb_array_length(p_document->'recentes') > 200
        or (p_document->'modeloPadraoId' is not null and p_document->'modeloPadraoId' <> 'null'::jsonb and
          coalesce(p_document->>'modeloPadraoId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        or exists(select 1 from jsonb_array_elements(p_document->'favoritos') entry where jsonb_typeof(entry) <> 'string' or entry#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        or exists(select 1 from jsonb_array_elements(p_document->'recentes') entry where jsonb_typeof(entry) <> 'string' or entry#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        raise exception 'Identificadores de favoritos ou modelo inválidos.' using errcode='22023';
      end if;
    end if;
    execute format('select id, revision, document, operation_id from public.%I where user_id = $1 and id = $2 for update', table_name)
      into current_row using owner_id, p_id;
  end if;

  select * into receipt from public.nutrition_operations where operation_id = p_operation_id and user_id = owner_id;
  if found then
    if receipt.payload_hash <> fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode = '22023'; end if;
    return receipt.result;
  end if;

  if current_row.id is not null then
    if current_row.revision <> p_expected_revision or current_row.id <> p_id then
      return jsonb_build_object('status','conflict','id',current_row.id,'revision',current_row.revision,'document',current_row.document);
    end if;
    row_id := current_row.id;
    new_revision := current_row.revision + 1;
    if p_type = 'food' then
      execute format('update public.%I set document=$1, revision=$2, operation_id=$3, name=$4, updated_at=now() where id=$5 and user_id=$6', table_name)
        using p_document,new_revision,p_operation_id,p_document->>'nome',row_id,owner_id;
    elsif p_type = 'goal' then
      execute format('update public.%I set document=$1, revision=$2, operation_id=$3, effective_from=$4, updated_at=now() where id=$5 and user_id=$6', table_name)
        using p_document,new_revision,p_operation_id,effective_day,row_id,owner_id;
    else
      execute format('update public.%I set document=$1, revision=$2, operation_id=$3, updated_at=now() where id=$4 and user_id=$5', table_name)
        using p_document,new_revision,p_operation_id,row_id,owner_id;
    end if;
  else
    if p_expected_revision <> 0 then return jsonb_build_object('status','conflict','id',p_id,'revision',0,'document',null); end if;
    row_id := p_id;
    new_revision := 1;
    if p_type = 'day' then
      execute format('insert into public.%I(id,user_id,local_date,document,revision,operation_id) values($1,$2,$3,$4,1,$5) on conflict do nothing returning id', table_name)
        into inserted_id using p_id,owner_id,local_day,p_document,p_operation_id;
    elsif p_type = 'goal' then
      execute format('insert into public.%I(id,user_id,effective_from,document,revision,operation_id) values($1,$2,$3,$4,1,$5) on conflict do nothing returning id', table_name)
        into inserted_id using p_id,owner_id,effective_day,p_document,p_operation_id;
    elsif p_type = 'food' then
      execute format('insert into public.%I(id,user_id,name,document,revision,operation_id) values($1,$2,$3,$4,1,$5) on conflict do nothing returning id', table_name)
        into inserted_id using p_id,owner_id,p_document->>'nome',p_document,p_operation_id;
    else
      execute format('insert into public.%I(id,user_id,document,revision,operation_id) values($1,$2,$3,1,$4) on conflict do nothing returning id', table_name)
        into inserted_id using p_id,owner_id,p_document,p_operation_id;
    end if;
    if inserted_id is null then
      if p_type = 'day' then
        execute format('select id,revision,document from public.%I where user_id=$1 and local_date=$2',table_name)
          into current_row using owner_id,local_day;
      else
        execute format('select id,revision,document from public.%I where user_id=$1 and id=$2',table_name)
          into current_row using owner_id,p_id;
      end if;
      -- A primeira requisição pode ter criado a linha enquanto esta aguardava
      -- a restrição única. O recibo é visível após a espera do INSERT.
      select * into receipt from public.nutrition_operations where operation_id = p_operation_id and user_id = owner_id;
      if found then
        if receipt.payload_hash <> fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode = '22023'; end if;
        return receipt.result;
      end if;
      if current_row.id is null then raise exception 'Identificador indisponível. Sua cópia local foi preservada.' using errcode='23505'; end if;
      return jsonb_build_object('status','conflict','id',current_row.id,'revision',current_row.revision,'document',current_row.document);
    end if;
  end if;

  result := jsonb_build_object('status','ok','id',row_id,'revision',new_revision);
  insert into public.nutrition_operations(operation_id,user_id,resource_type,resource_id,payload_hash,result)
    values(p_operation_id,owner_id,p_type,row_id,fingerprint,result);
  return result;
end;
$$;

revoke all on function public.nutrition_save_document(text,uuid,jsonb,bigint,uuid) from public;
grant execute on function public.nutrition_save_document(text,uuid,jsonb,bigint,uuid) to authenticated;
revoke all on function public.nutrition_valid_date(text), public.nutrition_valid_nutrients(jsonb), public.nutrition_valid_meals(jsonb), public.nutrition_valid_goal(jsonb,uuid) from public;

commit;
