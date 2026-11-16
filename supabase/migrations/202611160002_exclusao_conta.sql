begin;

-- Chamado apenas pela função de servidor após confirmar a identidade por e-mail.
create or replace function public.tf_preparar_exclusao_conta(p_usuario uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_usuario is null then raise exception 'Conta indisponível.'; end if;
  perform 1 from public.families where owner_user_id=p_usuario order by id for update;
  if exists (
    select 1 from public.families f where f.owner_user_id=p_usuario and (
      exists(select 1 from public.family_members m where m.family_id=f.id and m.user_id<>p_usuario)
      or exists(select 1 from public.community_posts p where p.family_id=f.id and p.user_id<>p_usuario)
    )
  ) then raise exception 'TF_FAMILIA_COMPARTILHADA'; end if;
end;
$$;

create or replace function public.tf_excluir_dados_conta(p_usuario uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.tf_preparar_exclusao_conta(p_usuario);
  delete from public.community_posts where user_id=p_usuario;
  delete from public.family_members where user_id=p_usuario;
  delete from public.families where owner_user_id=p_usuario;

  delete from public.coaching_workout_edits where actor_id=p_usuario or link_id in
    (select id from public.coaching_links where student_id=p_usuario);
  delete from public.coaching_feedback where user_id=p_usuario;
  delete from public.coaching_deliveries where user_id=p_usuario;
  delete from public.coaching_drafts where link_id in (select id from public.coaching_links where student_id=p_usuario);
  delete from public.coaching_invites where coach_id=p_usuario or link_id in
    (select id from public.coaching_links where student_id=p_usuario);
  update public.coaching_invites set accepted_by=null where accepted_by=p_usuario;
  delete from public.coaching_links where student_id=p_usuario;
  update public.coaching_links set coach_id=null,coach_name='Treinador removido',ended_at=coalesce(ended_at,now())
    where coach_id=p_usuario;

  delete from public.nutrition_operations where user_id=p_usuario;
  delete from public.nutrition_days where user_id=p_usuario;
  delete from public.nutrition_templates where user_id=p_usuario;
  delete from public.nutrition_goals where user_id=p_usuario;
  delete from public.nutrition_preferences where user_id=p_usuario;
  delete from public.nutrition_foods where user_id=p_usuario;
  delete from public.weekly_workout_schedule where user_id=p_usuario;
  delete from public.exercise_load_default_sources where user_id=p_usuario;
  delete from public.exercise_load_defaults where user_id=p_usuario;
  delete from public.workout_sets where user_id=p_usuario;
  delete from public.workout_sessions where user_id=p_usuario;
  delete from public.exercises where user_id=p_usuario;
  delete from public.workout_plans where user_id=p_usuario;
  delete from public.cardio_sessions where user_id=p_usuario;
  delete from public.cardio_activities where user_id=p_usuario;
  delete from public.body_measurements where user_id=p_usuario;
  delete from public.physical_measurements where user_id=p_usuario;
end;
$$;

create or replace function public.tf_arquivos_proprios_conta(p_usuario uuid)
returns table(bucket text, caminho text)
language sql stable security invoker set search_path = '' as $$
  select o.bucket_id,o.name from storage.objects o where
    (o.bucket_id in ('avatars','exercise-photos') and split_part(o.name,'/',1)=p_usuario::text)
    or (o.bucket_id='community-photos' and split_part(o.name,'/',2)=p_usuario::text)
  order by o.bucket_id,o.name;
$$;

revoke all on function public.tf_preparar_exclusao_conta(uuid), public.tf_excluir_dados_conta(uuid),
  public.tf_arquivos_proprios_conta(uuid) from public,anon,authenticated;
grant execute on function public.tf_preparar_exclusao_conta(uuid), public.tf_excluir_dados_conta(uuid),
  public.tf_arquivos_proprios_conta(uuid) to service_role;
commit;
