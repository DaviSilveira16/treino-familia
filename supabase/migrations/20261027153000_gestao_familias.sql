-- Somente para instalação nova. Em um Supabase ativo, preserve as funções e políticas existentes.
begin;

create function public.tf_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members where family_id=p_family_id and user_id=auth.uid());
$$;

create function public.tf_resumo_semanal(p_inicio timestamptz, p_fim timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with atividades as (
    select 'treino' as tipo, duration_minutes, active_calories from public.workout_sessions
      where user_id=auth.uid() and started_at>=p_inicio and started_at<p_fim and status is distinct from 'em_andamento'
    union all
    select 'cardio',duration_minutes,active_calories from public.cardio_sessions
      where user_id=auth.uid() and started_at>=p_inicio and started_at<p_fim
  )
  select jsonb_build_object('treinos',count(*) filter (where tipo='treino'),
    'cardios',count(*) filter (where tipo='cardio'),'minutos',coalesce(sum(duration_minutes),0),
    'calorias',coalesce(sum(active_calories),0),'caloriasDisponiveis',count(active_calories))
  from atividades;
$$;

revoke all on function public.tf_resumo_semanal(timestamptz,timestamptz) from public,anon;
grant execute on function public.tf_resumo_semanal(timestamptz,timestamptz) to authenticated;

create function public.criar_familia_completa(p_id uuid, p_nome text)
returns public.families language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); f public.families;
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode='42501'; end if;
  insert into public.families(id,name,owner_user_id) values(p_id,btrim(p_nome),u) on conflict(id) do nothing;
  select * into f from public.families where id=p_id and owner_user_id=u for update;
  if not found then raise exception 'Família indisponível.' using errcode='42501'; end if;
  insert into public.family_members(family_id,user_id,role) values(f.id,u,'owner') on conflict do nothing;
  return f;
end;
$$;

create function public.renomear_familia(p_family_id uuid, p_nome text)
returns public.families language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  update public.families set name=btrim(p_nome) where id=p_family_id and owner_user_id=auth.uid() returning * into f;
  if not found then raise exception 'Família indisponível.' using errcode='42501'; end if;
  return f;
end;
$$;

create function public.entrar_na_familia_por_codigo(p_codigo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); f uuid;
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode='42501'; end if;
  select id into f from public.families where invite_code=upper(btrim(p_codigo)) for update;
  if f is null then return null; end if;
  insert into public.family_members(family_id,user_id) values(f,u) on conflict do nothing;
  return f;
end;
$$;

create function public.sair_da_familia(p_family_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Entre novamente na sua conta.' using errcode='42501'; end if;
  if exists(select 1 from public.families where id=p_family_id and owner_user_id=u) then
    raise exception 'O proprietário deve excluir a família.' using errcode='42501';
  end if;
  delete from public.family_members where family_id=p_family_id and user_id=u;
  return true;
end;
$$;

create function public.excluir_familia(p_family_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.families where id=p_family_id and owner_user_id=auth.uid() for update;
  if not found then raise exception 'Família indisponível.' using errcode='42501'; end if;
  delete from public.community_posts where family_id=p_family_id;
  delete from public.family_members where family_id=p_family_id;
  delete from public.families where id=p_family_id;
  return true;
end;
$$;

create function public.resumo_painel_familia_por_id(p_family_id uuid)
returns table(family_id uuid,family_name text,invite_code text,user_id uuid,display_name text,avatar_url text,
  workouts_this_week bigint,cardios_this_week bigint,minutes_this_week numeric,calories_this_week numeric)
language sql stable security definer set search_path = '' as $$
  with periodo as (select date_trunc('week',now(),'America/Sao_Paulo') as inicio)
  select f.id,f.name,f.invite_code,u.id,
    coalesce(nullif(u.raw_user_meta_data->>'nome',''),nullif(u.raw_user_meta_data->>'full_name',''),'Membro'),
    nullif(u.raw_user_meta_data->>'avatar_url',''), w.n,c.n,w.minutos+c.minutos,w.kcal+c.kcal
  from public.families f join public.family_members m on m.family_id=f.id
  join auth.users u on u.id=m.user_id cross join periodo p
  cross join lateral (select count(*) n,coalesce(sum(s.duration_minutes),0) minutos,coalesce(sum(s.active_calories),0) kcal
    from public.workout_sessions s where s.user_id=u.id and s.started_at>=p.inicio and s.started_at<p.inicio+interval '7 days'
    and s.finished_at is not null and (s.status='concluido' or s.status is null)) w
  cross join lateral (select count(*) n,coalesce(sum(s.duration_minutes),0) minutos,coalesce(sum(s.active_calories),0) kcal
    from public.cardio_sessions s where s.user_id=u.id and s.started_at>=p.inicio and s.started_at<p.inicio+interval '7 days') c
  where f.id=p_family_id and public.tf_family_member(f.id);
$$;

revoke all on function public.tf_family_member(uuid), public.criar_familia_completa(uuid,text),
  public.renomear_familia(uuid,text), public.entrar_na_familia_por_codigo(text), public.sair_da_familia(uuid),
  public.excluir_familia(uuid), public.resumo_painel_familia_por_id(uuid) from public,anon;
grant execute on function public.tf_family_member(uuid), public.criar_familia_completa(uuid,text),
  public.renomear_familia(uuid,text), public.entrar_na_familia_por_codigo(text), public.sair_da_familia(uuid),
  public.excluir_familia(uuid), public.resumo_painel_familia_por_id(uuid) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.community_posts enable row level security;
revoke all on public.families,public.family_members,public.community_posts from public,anon,authenticated;
grant select on public.families,public.family_members,public.community_posts to authenticated;
grant insert,delete on public.community_posts to authenticated;
create policy tf_family_read on public.families for select to authenticated using (public.tf_family_member(id));
create policy tf_own_membership on public.family_members for select to authenticated using (user_id=(select auth.uid()));
create policy tf_family_posts_read on public.community_posts for select to authenticated using (public.tf_family_member(family_id));
create policy tf_family_posts_write on public.community_posts for insert to authenticated with check (
  user_id=(select auth.uid()) and public.tf_family_member(family_id)
  and (image_path is null or image_path like family_id::text||'/'||user_id::text||'/%')
);
create policy tf_family_posts_delete on public.community_posts for delete to authenticated using (
  user_id=(select auth.uid()) and public.tf_family_member(family_id)
);

insert into storage.buckets(id,name,public) values
  ('exercise-photos','exercise-photos',false),('community-photos','community-photos',false),('avatars','avatars',true)
on conflict(id) do nothing;
create policy tf_owned_exercise_photos on storage.objects for all to authenticated
  using (bucket_id='exercise-photos' and split_part(name,'/',1)=(select auth.uid())::text)
  with check (bucket_id='exercise-photos' and split_part(name,'/',1)=(select auth.uid())::text);
create policy tf_owned_avatars on storage.objects for all to authenticated
  using (bucket_id='avatars' and split_part(name,'/',1)=(select auth.uid())::text)
  with check (bucket_id='avatars' and split_part(name,'/',1)=(select auth.uid())::text);
create policy tf_family_photo_read on storage.objects for select to authenticated using (
  bucket_id='community-photos' and exists(select 1 from public.family_members m
    where m.family_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid()))
);
create policy tf_family_photo_write on storage.objects for insert to authenticated with check (
  bucket_id='community-photos' and split_part(name,'/',2)=(select auth.uid())::text
  and exists(select 1 from public.family_members m where m.family_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid()))
);
create policy tf_family_photo_delete on storage.objects for delete to authenticated using (
  bucket_id='community-photos' and split_part(name,'/',2)=(select auth.uid())::text
  and exists(select 1 from public.family_members m where m.family_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid()))
);
commit;
