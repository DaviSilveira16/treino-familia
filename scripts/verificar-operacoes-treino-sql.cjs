const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm");

(async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const [dono, outro, plano, exercicio, vizinho, sessao] = [1, 2, 3, 4, 5, 6].map(id);
  const pasta = path.join(__dirname, "../supabase/migrations");
  const conta = async (usuario) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario]);
    await db.exec("set role authenticated");
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage; create schema extensions;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,storage to authenticated;
      create table storage.buckets(id text primary key, name text, public boolean);
      create table storage.objects(bucket_id text references storage.buckets(id), name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into auth.users values ('${dono}','{}'), ('${outro}','{}');
    `);
    for (const arquivo of readdirSync(pasta).filter((nome) => nome.endsWith(".sql")).sort())
      await db.exec(readFileSync(path.join(pasta, arquivo), "utf8"));

    // Reproduz as FKs sem cascata presentes no DDL do banco existente.
    await db.exec(`alter table exercise_load_defaults drop constraint exercise_load_defaults_exercise_id_fkey;
      alter table exercise_load_defaults add foreign key(exercise_id) references exercises(id);
      alter table exercise_load_default_sources drop constraint exercise_load_default_sources_exercise_id_fkey;
      alter table exercise_load_default_sources add foreign key(exercise_id) references exercises(id);`);
    await conta(dono);
    await db.query("insert into workout_plans(id,user_id,name) values($1,$2,'Treino')", [plano,dono]);
    await db.query("insert into exercises(id,user_id,plan_id,name,position) values($1,$3,$4,'A',0),($2,$3,$4,'B',1)", [exercicio,vizinho,dono,plano]);
    await db.query("insert into workout_sessions(id,user_id,plan_id) values($1,$2,$3)", [sessao,dono,plano]);
    await db.query("insert into workout_sets(user_id,session_id,exercise_id,exercise_name,set_number,weight_kg) values($1,$2,$3,'A',1,30)", [dono,sessao,exercicio]);
    await db.query("insert into exercise_load_defaults(user_id,exercise_id,set_number,reps) values($1,$2,1,8)", [dono,exercicio]);
    const familia = (await db.query("select (criar_familia_completa($1,'Família')).*", [id(7)])).rows[0];
    const foto = `${familia.id}/${dono}/foto.png`;
    await db.query("insert into storage.objects values('community-photos',$1)", [foto]);
    await conta(outro);
    assert.deepEqual((await db.query("select id from workout_plans")).rows, []);
    assert.deepEqual((await db.query("select name from storage.objects")).rows, []);
    await assert.rejects(db.query("insert into exercises(user_id,plan_id,name) values($1,$2,'Alheio')", [outro,plano]), { code: "42501" });
    await assert.rejects(db.query("select tf_delete_own_exercise($1,$2)", [plano,exercicio]), { code: "42501" });
    await db.query("select entrar_na_familia_por_codigo($1)", [familia.invite_code]);
    assert.deepEqual((await db.query("select name from storage.objects")).rows, [{ name: foto }]);
    await db.query("select sair_da_familia($1)", [familia.id]);
    assert.deepEqual((await db.query("select name from storage.objects")).rows, []);

    await conta(dono);
    const mover = "select tf_move_own_exercise($1,$2,$3,0,1)";
    await db.query(mover, [plano,exercicio,vizinho]);
    await db.query(mover, [plano,exercicio,vizinho]);
    assert.equal((await db.query("select position from exercises where id=$1", [exercicio])).rows[0].position, 1);
    await db.exec(`reset role;
      create function fail_delete() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$;
      create trigger test_failure before delete on exercises for each row execute function fail_delete();
      set role authenticated;`);
    const excluir = "select tf_delete_own_exercise($1,$2)";
    await assert.rejects(db.query(excluir, [plano,exercicio]), /falha simulada/);
    assert.equal((await db.query("select exercise_id from workout_sets")).rows[0].exercise_id, exercicio);
    await db.exec("reset role; drop trigger test_failure on exercises; set role authenticated;");
    await db.query(excluir, [plano,exercicio]);
    await db.query(excluir, [plano,exercicio]);
    assert.deepEqual((await db.query("select exercise_id,weight_kg::integer from workout_sets")).rows, [{ exercise_id: null, weight_kg: 30 }]);
    await db.query("insert into exercise_load_defaults(user_id,exercise_id,set_number,reps) values($1,$2,1,8)", [dono,vizinho]);
    await db.query("insert into weekly_workout_schedule(user_id,plan_id,day_of_week) values($1,$2,1)", [dono,plano]);
    await db.query("select tf_delete_own_workout_plan($1)", [plano]);
    assert.deepEqual((await db.query("select plan_id from weekly_workout_schedule")).rows, [{ plan_id: null }]);
    assert.deepEqual((await db.query("select plan_id from workout_sessions")).rows, [{ plan_id: null }]);
    await db.query("select tf_salvar_programacao(1::smallint,null,true)");
    await db.query("select tf_salvar_programacao(1::smallint,null,true)");
    assert.deepEqual((await db.query("select is_rest_day from weekly_workout_schedule")).rows, [{ is_rest_day: true }]);
    await db.query("select tf_salvar_programacao(1::smallint,null,false)");
    assert.deepEqual((await db.query("select day_of_week from weekly_workout_schedule")).rows, []);
    const indicadores = await db.query("select tf_indicadores_painel('America/Sao_Paulo') as resultado");
    assert.deepEqual(indicadores.rows[0].resultado, { sequencia: 0, carga: null });
    await assert.rejects(db.query("select tf_excluir_dados_conta($1)", [outro]), { code: "42501" });
    await conta(outro);
    await db.query("select entrar_na_familia_por_codigo($1)", [familia.invite_code]);
    const planoAlheio = id(8);
    await db.query("insert into workout_plans(id,user_id,name) values($1,$2,'Alheio')", [planoAlheio,outro]);
    await db.query("select tf_salvar_programacao(1::smallint,$1,false)", [planoAlheio]);
    const exercicioAlheio = id(9);
    const sessoesAlheias = [id(10), id(11), id(12)];
    await db.query("insert into exercises(id,user_id,plan_id,name) values($1,$2,$3,'Agachamento')", [exercicioAlheio,outro,planoAlheio]);
    for (const [indice, sessaoAlheia] of sessoesAlheias.entries()) {
      await db.query(`insert into workout_sessions(id,user_id,plan_id,started_at,finished_at,status)
        values($1,$2,$3,date_trunc('day',now(),'America/Sao_Paulo') - ($4::int * interval '1 day') + interval '10 hours',
                     date_trunc('day',now(),'America/Sao_Paulo') - ($4::int * interval '1 day') + interval '11 hours','concluido')`,
        [sessaoAlheia,outro,planoAlheio,indice === 0 ? 1 : 0]);
      await db.query(`insert into workout_sets(user_id,session_id,exercise_id,exercise_name,set_number,reps,weight_kg)
        values($1,$2,$3,'Agachamento',$4,8,$5)`, [outro,sessaoAlheia,exercicioAlheio,indice === 2 ? 2 : 1,40 + indice * 5]);
    }
    assert.deepEqual((await db.query("select tf_indicadores_painel('America/Sao_Paulo') as resultado")).rows[0].resultado,
      { sequencia: 2, carga: { exercicio: "Agachamento", serie: 1, anterior: 40, atual: 45 } });
    await conta(dono);
    await assert.rejects(db.query("select tf_salvar_programacao(1::smallint,$1,false)", [planoAlheio]), { code: "42501" });
    assert.deepEqual((await db.query("select day_of_week from weekly_workout_schedule")).rows, []);
    await db.exec("reset role");
    assert.equal((await db.query("select has_function_privilege('service_role','public.tf_excluir_dados_conta(uuid)','EXECUTE') as permitido")).rows[0].permitido, true);
    assert.deepEqual((await db.query("select * from tf_arquivos_proprios_conta($1)", [dono])).rows,
      [{ bucket: "community-photos", caminho: foto }]);
    assert.deepEqual((await db.query("select * from tf_arquivos_proprios_conta($1)", [outro])).rows, []);
    await assert.rejects(db.query("select tf_excluir_dados_conta($1)", [dono]), /TF_FAMILIA_COMPARTILHADA/);
    await conta(outro);
    await db.query("select sair_da_familia($1)", [familia.id]);
    await db.exec("reset role");
    await db.query("select tf_excluir_dados_conta($1)", [dono]);
    await db.query("select tf_excluir_dados_conta($1)", [dono]);
    assert.deepEqual((await db.query("select id from workout_plans")).rows, [{ id: planoAlheio }]);
    assert.deepEqual((await db.query("select id from workout_sessions order by id")).rows.map((r) => r.id), sessoesAlheias);
    console.log("OK — instalação do zero, permissões, buckets, ordem e exclusões transacionais");
  } finally {
    await db.close();
  }
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
