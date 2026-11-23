begin;
create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table if not exists public.community_comments (
  id uuid primary key, post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check(length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists tf_comments_post_cursor on public.community_comments(post_id,created_at desc,id desc);
alter table public.community_likes enable row level security;
alter table public.community_comments enable row level security;
revoke all on public.community_likes,public.community_comments from public,anon,authenticated;

create or replace function public.tf_community_interaction(
  p_action text,p_family_id uuid,p_post_id uuid,p_comment_id uuid default null,
  p_content text default null,p_like boolean default null,p_before timestamptz default null,p_before_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); author_id uuid; moderator boolean; result jsonb;
begin
  if u is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  perform 1 from public.family_members where family_id=p_family_id and user_id=u for share;
  if not found then raise exception 'Família indisponível' using errcode='42501'; end if;
  select user_id into author_id from public.community_posts where id=p_post_id and family_id=p_family_id for update;
  if not found then raise exception 'Publicação indisponível' using errcode='42501'; end if;
  select exists(select 1 from public.families where id=p_family_id and owner_user_id=u) into moderator;
  if p_action='like' then
    if p_like is null then raise exception 'Escolha a reação'; end if;
    if p_like then insert into public.community_likes(post_id,user_id) values(p_post_id,u) on conflict do nothing;
    else delete from public.community_likes where post_id=p_post_id and user_id=u; end if;
  elsif p_action='comment' then
    if p_comment_id is null or p_content is null or length(btrim(p_content)) not between 1 and 1000 then raise exception 'Comentário inválido' using errcode='22023'; end if;
    insert into public.community_comments(id,post_id,user_id,content) values(p_comment_id,p_post_id,u,btrim(p_content)) on conflict do nothing;
    if not exists(select 1 from public.community_comments where id=p_comment_id and post_id=p_post_id and user_id=u and content=btrim(p_content)) then
      raise exception 'Identificador de comentário já utilizado' using errcode='23505';
    end if;
  elsif p_action='delete_comment' then
    delete from public.community_comments where id=p_comment_id and post_id=p_post_id and (user_id=u or moderator);
    if exists(select 1 from public.community_comments where id=p_comment_id and post_id=p_post_id) then raise exception 'Sem permissão' using errcode='42501'; end if;
  elsif p_action='delete_post' then
    if author_id<>u and not moderator then raise exception 'Sem permissão' using errcode='42501'; end if;
    delete from public.community_posts where id=p_post_id and family_id=p_family_id;
    return jsonb_build_object('deleted',true);
  elsif p_action not in ('state','comments') then raise exception 'Ação inválida' using errcode='22023';
  end if;
  result := jsonb_build_object('likes',(select count(*) from public.community_likes where post_id=p_post_id),
    'liked',exists(select 1 from public.community_likes where post_id=p_post_id and user_id=u),
    'comment_count',(select count(*) from public.community_comments where post_id=p_post_id),'can_moderate',moderator);
  if p_action in ('comments','comment','delete_comment') then
    result := result || jsonb_build_object('comments',coalesce((select jsonb_agg(x order by x.created_at desc,x.id desc) from (
      select c.id,c.content,c.created_at,c.user_id=u as own,
        coalesce(nullif(a.raw_user_meta_data->>'nome',''),nullif(a.raw_user_meta_data->>'full_name',''),'Membro') as author
      from public.community_comments c join auth.users a on a.id=c.user_id where c.post_id=p_post_id
        and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
      order by c.created_at desc,c.id desc limit 21
    ) x),'[]'::jsonb));
  end if;
  return result;
end $$;
revoke all on function public.tf_community_interaction(text,uuid,uuid,uuid,text,boolean,timestamptz,uuid) from public,anon;
grant execute on function public.tf_community_interaction(text,uuid,uuid,uuid,text,boolean,timestamptz,uuid) to authenticated;
commit;
