begin;
create table if not exists public.backup_restore_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,fingerprint)
);
alter table public.backup_restore_receipts enable row level security;
revoke all on public.backup_restore_receipts from public,anon,authenticated;

-- Mapeamento determinístico por conta. Nunca adota um registro de outra pessoa.
create or replace function public.tf_backup_id(t text, source_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owned boolean; u uuid:=auth.uid();
begin
  if u is null or t not in ('workout_plans','exercises','exercise_load_defaults','workout_sessions','workout_sets','cardio_activities','cardio_sessions','physical_measurements','weekly_workout_schedule','nutrition_foods','nutrition_goals','nutrition_templates','nutrition_days','nutrition_preferences') then raise exception 'Recurso inválido' using errcode='42501'; end if;
  if source_id is null then return null; end if;
  if t='nutrition_preferences' then return u; end if;
  execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',t) into owned using source_id,u;
  if owned then return source_id; end if;
  return md5(u::text||':'||t||':'||source_id::text)::uuid;
end $$;

create or replace function public.tf_backup_document(value jsonb, owner_id uuid, ids jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb; entry record;
begin
  if jsonb_typeof(value)='object' then
    result:='{}';
    for entry in select * from jsonb_each(value) loop
      result:=result||jsonb_build_object(entry.key,case when entry.key='usuarioId' then to_jsonb(owner_id::text) else public.tf_backup_document(entry.value,owner_id,ids) end);
    end loop; return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(public.tf_backup_document(v,owner_id,ids) order by n),'[]') into result from jsonb_array_elements(value) with ordinality as a(v,n); return result;
  elsif jsonb_typeof(value)='string' and ids ? (value#>>'{}') then return ids->(value#>>'{}');
  end if;
  return value;
end $$;

create or replace function public.tf_restore_backup(p_backup jsonb,p_expected_user uuid,p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid(); t text; row_data jsonb; clean jsonb; target uuid; own_id uuid;
  ids jsonb:='{}'; report jsonb:='[]'; result jsonb; receipt jsonb; v_fingerprint text;
  cols text[]; required text[]; selected_cols text; k text; ref_table text; ref_id uuid; source_ref uuid;
  total integer:=0; inserted integer; preserved integer; refused integer; n integer; duplicate boolean; available boolean;
  nutrition_type text; response jsonb; inserted_id uuid;
  tables text[]:=array['workout_plans','exercises','exercise_load_defaults','workout_sessions','workout_sets','cardio_activities','cardio_sessions','physical_measurements','weekly_workout_schedule','nutrition_foods','nutrition_goals','nutrition_templates','nutrition_days','nutrition_preferences'];
begin
  if u is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if p_expected_user is distinct from u then raise exception 'A conta foi alterada; confira novamente a prévia' using errcode='42501'; end if;
  if p_confirmar is null or p_backup->>'formato' is distinct from 'treino-familia-backup' or coalesce(p_backup->>'versao','') not in ('1','2') or jsonb_typeof(p_backup->'tabelas') is distinct from 'object' or octet_length(p_backup::text)>10485760 then raise exception 'Backup inválido' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_backup->'tabelas') as x(key) where not key=any(tables)) then raise exception 'Tabela não permitida' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||':restore',0));
  v_fingerprint:=md5(p_backup::text);
  select r.result into receipt from public.backup_restore_receipts r where r.user_id=u and r.fingerprint=v_fingerprint;
  if found then return receipt||jsonb_build_object('reutilizado',true); end if;
  foreach t in array tables loop
    if p_backup->'tabelas' ? t then
      if jsonb_typeof(p_backup->'tabelas'->t) is distinct from 'array' then raise exception 'Lista inválida' using errcode='22023'; end if;
      total:=total+jsonb_array_length(p_backup->'tabelas'->t);
      if exists(select 1 from jsonb_array_elements(p_backup->'tabelas'->t) x group by x->>'id' having count(*)>1) then raise exception 'IDs repetidos' using errcode='22023'; end if;
      for row_data in select * from jsonb_array_elements(p_backup->'tabelas'->t) loop
        if jsonb_typeof(row_data) is distinct from 'object' or coalesce(row_data->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'ID inválido' using errcode='22023'; end if;
        ids:=ids||jsonb_build_object(row_data->>'id',public.tf_backup_id(t,(row_data->>'id')::uuid)::text);
      end loop;
    end if;
  end loop;
  if total not between 1 and 10000 then raise exception 'Limite de registros excedido' using errcode='22023'; end if;
  foreach t in array tables loop
    inserted:=0; preserved:=0; refused:=0;
    for row_data in select * from jsonb_array_elements(coalesce(p_backup->'tabelas'->t,'[]')) loop
      if (t='workout_sessions' and row_data->>'status'='em_andamento') or (t='workout_sets' and exists(select 1 from jsonb_array_elements(coalesce(p_backup->'tabelas'->'workout_sessions','[]')) s where s->>'id'=row_data->>'session_id' and s->>'status'='em_andamento')) then refused:=refused+1; continue; end if;
      target:=public.tf_backup_id(t,(row_data->>'id')::uuid);
      execute format('select id from public.%I where id=$1 and user_id=$2',t) into own_id using target,u;
      duplicate:=own_id is not null;
      if t='weekly_workout_schedule' then select exists(select 1 from public.weekly_workout_schedule where user_id=u and day_of_week=(row_data->>'day_of_week')::smallint) into available; duplicate:=duplicate or available;
      elsif t='exercise_load_defaults' then select exists(select 1 from public.exercise_load_defaults where user_id=u and exercise_id=public.tf_backup_id('exercises',(row_data->>'exercise_id')::uuid) and set_number=(row_data->>'set_number')::integer) into available; duplicate:=duplicate or available;
      elsif t='nutrition_days' then select exists(select 1 from public.nutrition_days where user_id=u and local_date=(row_data->'document'->>'data')::date) into available; duplicate:=duplicate or available;
      end if;
      if duplicate then preserved:=preserved+1; continue; end if;
      if t like 'nutrition_%' then
        nutrition_type:=case t when 'nutrition_foods' then 'food' when 'nutrition_goals' then 'goal' when 'nutrition_templates' then 'template' when 'nutrition_days' then 'day' else 'preferences' end;
        clean:=public.tf_backup_document(row_data->'document',u,ids);
        if jsonb_typeof(clean) is distinct from 'object' then raise exception 'Documento de nutrição inválido' using errcode='22023'; end if;
        if nutrition_type<>'preferences' then clean:=clean||jsonb_build_object('id',target,'usuarioId',u); end if;
        if nutrition_type in ('day','template') and not public.nutrition_valid_meals(clean->'refeicoes') then raise exception 'Refeições inválidas' using errcode='22023'; end if;
        if nutrition_type='goal' and not public.nutrition_valid_goal(clean,u) then raise exception 'Metas inválidas' using errcode='22023'; end if;
        if nutrition_type='day' and (not public.nutrition_valid_date(clean->>'data') or jsonb_typeof(clean->'concluido') is distinct from 'boolean') then raise exception 'Diário inválido' using errcode='22023'; end if;
        if nutrition_type='template' and (not public.nutrition_valid_date(clean->>'vigenteDesde') or coalesce(length(btrim(clean->>'nome')),0)=0) then raise exception 'Dieta inválida' using errcode='22023'; end if;
        if nutrition_type='food' and (not public.nutrition_valid_nutrients(clean->'nutrientes') or coalesce((clean->>'baseGramas')::numeric,0)<=0 or coalesce(length(btrim(clean->>'nome')),0)=0 or coalesce(length(btrim(clean->>'fonte')),0)=0) then raise exception 'Alimento inválido' using errcode='22023'; end if;
        if nutrition_type='preferences' and (jsonb_typeof(clean->'favoritos') is distinct from 'array' or jsonb_typeof(clean->'recentes') is distinct from 'array' or jsonb_typeof(clean->'repetirDiariamente') is distinct from 'boolean') then raise exception 'Preferências inválidas' using errcode='22023'; end if;
        if p_confirmar then
          response:=public.nutrition_save_document(nutrition_type,target,clean,0,md5(u::text||v_fingerprint||t||target::text)::uuid);
          if response->>'status'<>'ok' then raise exception 'Conflito na restauração da nutrição' using errcode='40001'; end if;
        end if;
      else
        cols:=case t
          when 'workout_plans' then array['name','created_at']
          when 'exercises' then array['plan_id','name','sets_goal','reps_goal','position','created_at']
          when 'exercise_load_defaults' then array['exercise_id','set_number','reps','weight_kg','updated_at']
          when 'workout_sessions' then array['plan_id','started_at','finished_at','notes','duration_minutes','intensity','active_calories','weight_kg_snapshot','height_cm_snapshot','age_snapshot','sex_snapshot','met_value','exercise_count','sets_count','total_reps','total_volume_kg','status','volume_kg','exercises_count','sets_completed','reps_completed']
          when 'workout_sets' then array['session_id','exercise_id','exercise_name','set_number','reps','weight_kg','created_at']
          when 'cardio_activities' then array['nome','tipo','duracao_min','distancia_km','calorias','observacoes','created_at','updated_at']
          when 'cardio_sessions' then array['activity_id','activity_name','activity_type','started_at','duration_minutes','distance_km','calories','notes','created_at','active_calories','intensity','incline_percent','heart_rate_avg','speed_kmh','cadence_rpm','weight_kg_snapshot','met_value','height_cm_snapshot','age_snapshot','sex_snapshot','floors_up']
          when 'physical_measurements' then array['measured_at','weight_kg','body_fat_percentage','chest_cm','waist_cm','hip_cm','arm_cm','thigh_cm','notes','created_at']
          when 'weekly_workout_schedule' then array['day_of_week','plan_id','is_rest_day','created_at','updated_at']
        end;
        select coalesce(jsonb_object_agg(key,value),'{}') into clean from jsonb_each(row_data) where key=any(cols);
        clean:=clean||jsonb_build_object('id',target,'user_id',u);
        required:=case t
          when 'workout_plans' then array['name'] when 'exercises' then array['plan_id','name']
          when 'exercise_load_defaults' then array['exercise_id','set_number','reps','weight_kg']
          when 'workout_sessions' then array['started_at'] when 'workout_sets' then array['session_id','exercise_name','set_number','reps','weight_kg']
          when 'cardio_activities' then array['nome'] when 'cardio_sessions' then array['activity_name','started_at']
          when 'physical_measurements' then array['measured_at','weight_kg'] else array['day_of_week','is_rest_day'] end;
        foreach k in array required loop
          if clean->k is null or clean->k='null'::jsonb then raise exception 'Campo obrigatório ausente: %',k using errcode='22023'; end if;
        end loop;
        foreach k in array array['name','nome','exercise_name','activity_name'] loop
          if clean ? k and (jsonb_typeof(clean->k)<>'string' or length(btrim(clean->>k)) not between 1 and 200) then raise exception 'Nome inválido' using errcode='22023'; end if;
        end loop;
        foreach k in array array['weight_kg','reps','set_number','sets_goal','duration_minutes','distance_km','calories','active_calories','duracao_min','distancia_km','calorias'] loop
          if clean->>k is not null and ((clean->>k)::numeric<0 or (clean->>k)::numeric>10000000 or (clean->>k)::text in ('NaN','Infinity','-Infinity')) then raise exception 'Valor fora do limite' using errcode='22023'; end if;
        end loop;
        foreach k in array array['plan_id','exercise_id','session_id','activity_id'] loop
          if clean->>k is null then continue; end if;
          ref_table:=case k when 'plan_id' then 'workout_plans' when 'exercise_id' then 'exercises' when 'session_id' then 'workout_sessions' else 'cardio_activities' end;
          source_ref:=(clean->>k)::uuid; ref_id:=public.tf_backup_id(ref_table,source_ref);
          execute format('select exists(select 1 from public.%I where id=$1 and user_id=$2)',ref_table) into available using ref_id,u;
          if not available and not exists(select 1 from jsonb_array_elements(coalesce(p_backup->'tabelas'->ref_table,'[]')) x where x->>'id'=source_ref::text) then raise exception 'Referência ausente no backup ou na conta' using errcode='22023'; end if;
          clean:=jsonb_set(clean,array[k],to_jsonb(ref_id));
        end loop;
        -- Converte todos os tipos também na prévia, sem gravar registros.
        execute format('select to_jsonb(x) from jsonb_populate_record(null::public.%I,$1) x',t) into row_data using clean;
        if p_confirmar then
          select string_agg(format('%I',key),',') into selected_cols from jsonb_object_keys(clean) as x(key);
          execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict do nothing returning id',t,selected_cols,selected_cols,t) into inserted_id using clean;
          if inserted_id is null then raise exception 'Conflito durante a restauração; nenhum registro alterado' using errcode='40001'; end if;
        end if;
      end if;
      inserted:=inserted+1;
    end loop;
    if p_backup->'tabelas' ? t then report:=report||jsonb_build_array(jsonb_build_object('tabela',t,'novos',inserted,'preservados',preserved,'recusados',refused)); end if;
  end loop;
  result:=jsonb_build_object('tabelas',report,'concluido',p_confirmar);
  if p_confirmar then insert into public.backup_restore_receipts(user_id,fingerprint,result) values(u,v_fingerprint,result); end if;
  return result;
end $$;
revoke all on function public.tf_backup_id(text,uuid),public.tf_backup_document(jsonb,uuid,jsonb),public.tf_restore_backup(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.tf_restore_backup(jsonb,uuid,boolean) to authenticated;
commit;
