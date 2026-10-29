// PostgreSQL isolado: node scripts/verificar-cargas-sql.cjs <caminho-para-@electric-sql/pglite>
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const u1 = id(1), u2 = id(2), p1 = id(3), p2 = id(4), e1 = id(5), e2 = id(6), omitido = id(7), alheio = id(8);
const notes = "Treino concluído no modo ativo;esforco_percebido=adequado;modelo=sessao";
async function conta(uid, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
  await db.exec(`set role ${role}`);
}
async function sessao(n, dia, plan = p1, anotacao = notes) {
  await db.query("insert into workout_sessions(id,user_id,plan_id,started_at,status,notes) values($1,$2,$3,$4,'em_andamento',$5)", [id(n), u1, plan, `${dia}T12:00:00Z`, anotacao]);
}
async function serie(n, sn, ex, numero, peso, reps = 10) {
  await db.query("insert into workout_sets(id,user_id,session_id,exercise_id,set_number,reps,weight_kg) values($1,$2,$3,$4,$5,$6,$7)", [id(n), u1, id(sn), ex, numero, reps, peso]);
}
async function concluir(n, dia, plan) {
  await db.query("update workout_sessions set status='concluido',finished_at=$2,plan_id=coalesce($3,plan_id) where id=$1", [id(n), `${dia}T13:00:00Z`, plan || null]);
}
async function cargas(ex = e1) {
  const result = await db.query("select set_number,reps,weight_kg::float8 as weight_kg from exercise_load_defaults where exercise_id=$1 order by set_number", [ex]);
  return result.rows;
}
(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values('${u1}'),('${u2}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create table workout_plans(id uuid primary key,user_id uuid not null references auth.users,name text);
    create table exercises(id uuid primary key,user_id uuid not null references auth.users,plan_id uuid references workout_plans,name text,sets_goal integer,reps_goal text);
    create table workout_sessions(id uuid primary key,user_id uuid not null references auth.users,plan_id uuid references workout_plans,started_at timestamptz not null,finished_at timestamptz,status text,notes text);
    create table workout_sets(id uuid primary key,user_id uuid not null references auth.users,session_id uuid references workout_sessions on delete cascade,exercise_id uuid references exercises,set_number integer,reps integer,weight_kg numeric);
    create table exercise_load_defaults(user_id uuid references auth.users,exercise_id uuid references exercises,set_number integer,reps integer,weight_kg numeric,primary key(user_id,exercise_id,set_number));
    insert into workout_plans values('${p1}','${u1}','Original'),('${p2}','${u1}','Novo');
    insert into exercises values('${e1}','${u1}','${p1}','Supino',3,'8-12'),('${e2}','${u1}','${p2}','Novo supino',3,'8-12'),('${omitido}','${u1}','${p1}','Não realizado',3,'8'),('${alheio}','${u2}','${p1}','Outra conta',3,'8');
    insert into exercise_load_defaults values('${u1}','${e1}',1,10,70),('${u1}','${e1}',2,10,80),('${u1}','${e1}',3,10,90),('${u1}','${omitido}',1,8,123);
  `);
  // Histórico anterior e defaults manuais permanecem intactos ao instalar/reaplicar.
  await sessao(10, "2026-10-26"); await serie(100, 10, e1, 1, 80); await concluir(10, "2026-10-26");
  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/202610290001_ultimas_cargas_treino.sql"), "utf8");
  await db.exec(migration); await db.exec(migration);
  assert.deepEqual((await cargas()).map((s) => s.weight_kg), [70, 80, 90]);
  assert.equal((await db.query("select count(*)::int as n from exercise_load_default_sources")).rows[0].n, 0);
  for (const table of ["workout_plans", "exercises", "workout_sessions", "workout_sets", "exercise_load_defaults"]) {
    await db.exec(`alter table ${table} enable row level security; create policy own on ${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); grant select,insert,update,delete on ${table} to authenticated;`);
  }
  await conta(u1);
  await sessao(11, "2026-10-29"); await serie(101, 11, e1, 1, 20.5, 10); await serie(102, 11, e1, 3, 25, 8);
  await concluir(11, "2026-10-29");
  assert.deepEqual(await cargas(), [{ set_number: 1, reps: 10, weight_kg: 20.5 }, { set_number: 2, reps: 8, weight_kg: 25 }]);
  assert.deepEqual((await db.query("select sets_goal,reps_goal from exercises where id=$1", [e1])).rows[0], { sets_goal: 2, reps_goal: "8-10" });
  assert.equal((await cargas(omitido))[0].weight_kg, 123);
  assert.deepEqual((await db.query("select set_number from workout_sets where session_id=$1 order by set_number", [id(11)])).rows.map((s) => s.set_number), [1, 3]);
  // Editar referências e repetir a confirmação não as restaura pelo histórico.
  await db.query("update exercise_load_defaults set weight_kg=999 where exercise_id=$1 and set_number=1", [e1]);
  await concluir(11, "2026-10-29"); assert.equal((await cargas())[0].weight_kg, 999);
  await db.query("update workout_sessions set status='em_andamento' where id=$1", [id(11)]); await concluir(11, "2026-10-29");
  assert.equal((await cargas())[0].weight_kg, 999);
  // Sessão seguinte vale mesmo com menos séries e peso menor.
  await sessao(12, "2026-10-30"); await serie(103, 12, e1, 2, 15, 12); await concluir(12, "2026-10-30");
  assert.deepEqual(await cargas(), [{ set_number: 1, reps: 12, weight_kg: 15 }]);
  await sessao(13, "2026-10-28"); await serie(104, 13, e1, 1, 199); await concluir(13, "2026-10-31");
  assert.equal((await cargas())[0].weight_kg, 15);
  await db.query("delete from workout_sessions where id=$1", [id(12)]);
  await sessao(14, "2026-10-29"); await serie(105, 14, e1, 1, 188); await concluir(14, "2026-11-01");
  assert.equal((await cargas())[0].weight_kg, 15, "watermark conserva ordem mesmo após exclusão do último histórico");
  // Registrar frequência não muda automaticamente os padrões do modo ativo.
  await sessao(15, "2026-11-05", p1, "Treino registrado pela Frequência;horario=referencia_calendario"); await serie(106, 15, e1, 1, 300); await concluir(15, "2026-11-05");
  assert.equal((await cargas())[0].weight_kg, 15);
  // O destino novo só altera seus próprios exercícios e preserva o original.
  await sessao(16, "2026-11-06"); await serie(107, 16, e2, 1, 12.5, 9); await concluir(16, "2026-11-06", p2);
  assert.deepEqual(await cargas(e2), [{ set_number: 1, reps: 9, weight_kg: 12.5 }]); assert.equal((await cargas())[0].weight_kg, 15);
  // Mesmo plano com um exercício recém-adicionado atualiza os dois realizados.
  const novo = id(9);
  await db.query("insert into exercises values($1,$2,$3,'Adicionado',3,'8')", [novo, u1, p1]);
  await sessao(17, "2026-11-07"); await serie(108, 17, e1, 1, 8, 8); await serie(109, 17, novo, 1, 4, 11); await concluir(17, "2026-11-07");
  assert.equal((await cargas())[0].weight_kg, 8); assert.equal((await cargas(novo))[0].weight_kg, 4);
  // Falha na escrita dos padrões reverte a conclusão e todas as alterações juntas.
  await conta(null, "postgres");
  await db.exec("create function fail_default_insert() returns trigger language plpgsql as $$ begin if new.weight_kg=17 then raise exception 'falha simulada'; end if; return new; end $$; create trigger fail_insert before insert on exercise_load_defaults for each row execute function fail_default_insert();");
  await conta(u1); await sessao(18, "2026-11-08"); await serie(110, 18, e1, 1, 17);
  await assert.rejects(() => concluir(18, "2026-11-08"), /falha simulada/);
  assert.equal((await cargas())[0].weight_kg, 8);
  assert.equal((await db.query("select status from workout_sessions where id=$1", [id(18)])).rows[0].status, "em_andamento");
  // Conta alheia/anon não consulta nem forja a tabela de origem.
  await conta(u2);
  assert.deepEqual(await cargas(), []);
  await assert.rejects(() => db.query("select * from exercise_load_default_sources"), (erro) => erro.code === "42501");
  await assert.rejects(() => db.query("insert into exercise_load_default_sources values($1,$2,$3,now(),now(),now())", [e1, u2, id(99)]), (erro) => erro.code === "42501");
  await conta(null, "anon");
  await assert.rejects(() => db.query("select * from exercise_load_default_sources"), (erro) => erro.code === "42501");
  console.log("OK — padrões PostgreSQL: conclusão atômica, cargas menores, séries concluídas, idempotência, atraso offline, destino novo/adicionar, manual preservado e isolamento.");
  await db.close();
})().catch(async (erro) => { console.error(erro); await db.close(); process.exitCode = 1; });
