-- Mantem a busca parcial de alimentos eficiente quando o catalogo crescer.
begin;

create extension if not exists pg_trgm with schema extensions;

do $$
declare
  schema_operadores text;
begin
  select n.nspname into schema_operadores
  from pg_opclass c
  join pg_namespace n on n.oid = c.opcnamespace
  join pg_am a on a.oid = c.opcmethod
  where c.opcname = 'gin_trgm_ops' and a.amname = 'gin'
  limit 1;

  if schema_operadores is null then
    raise exception 'A extensao pg_trgm nao disponibilizou gin_trgm_ops.';
  end if;

  execute format(
    'create index if not exists nutrition_foods_name_trgm on public.nutrition_foods using gin (name %I.gin_trgm_ops)',
    schema_operadores
  );
end;
$$;

-- Apoia a sincronizacao incremental dos documentos que nao sao diarios.
create index if not exists nutrition_templates_user_updated
  on public.nutrition_templates(user_id, updated_at, id);
create index if not exists nutrition_goals_user_updated
  on public.nutrition_goals(user_id, updated_at, id);
create index if not exists nutrition_preferences_user_updated
  on public.nutrition_preferences(user_id, updated_at, id);
create index if not exists nutrition_foods_user_updated
  on public.nutrition_foods(user_id, updated_at, id);

commit;
