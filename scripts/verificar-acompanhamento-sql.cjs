// PostgreSQL isolado. Nunca usa credenciais nem dados do Supabase remoto.
// node scripts/verificar-acompanhamento-sql.cjs <caminho-para-@electric-sql/pglite>
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const coach = id(1), student = id(2), stranger = id(3);
async function account(uid, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
  await db.exec(`set role ${role}`);
}
async function rpc(action, data = {}) {
  return (await db.query("select tf_coaching($1,$2::jsonb) as result", [action, JSON.stringify(data)])).rows[0].result;
}
const document = { name: "Ficha A", instructions: "Execute com controle.", exercises: [
  { name: "Supino", sets: 3, reps: "8-12", weight: 12.5, rest: 90, instructions: "Ajuste o banco." },
  { name: "Remada", sets: 2, reps: "10", weight: 20, rest: 60, instructions: "" },
] };
async function snapshot() {
  const result = {};
  for (const table of ["workout_plans", "exercises", "exercise_load_defaults", "workout_sessions", "workout_sets", "coaching_feedback", "coaching_deliveries"])
    result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) as result from ${table} t`)).rows[0].result;
  return result;
}
(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    insert into auth.users values('${coach}','{"nome":"Treinador"}'),('${student}','{"nome":"Aluno"}'),('${stranger}','{"nome":"Terceiro"}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create table workout_plans(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,name text not null,unique(user_id,name));
    create table exercises(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,plan_id uuid references workout_plans on delete cascade,name text,sets_goal integer,reps_goal text,position integer);
    create table workout_sessions(id uuid primary key,user_id uuid not null references auth.users,plan_id uuid references workout_plans on delete set null,started_at timestamptz not null,finished_at timestamptz,status text,notes text,duration_minutes numeric,intensity text);
    create table workout_sets(id uuid primary key,user_id uuid not null references auth.users,session_id uuid references workout_sessions on delete cascade,exercise_id uuid references exercises on delete set null,exercise_name text,set_number integer,reps integer,weight_kg numeric);
    create table exercise_load_defaults(user_id uuid references auth.users,exercise_id uuid references exercises on delete cascade,set_number integer,reps integer,weight_kg numeric,primary key(user_id,exercise_id,set_number));
  `);
  for (const table of ["workout_plans", "exercises", "workout_sessions", "workout_sets", "exercise_load_defaults"])
    await db.exec(`alter table ${table} enable row level security; create policy own on ${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); grant select,insert,update,delete on ${table} to authenticated;`);
  const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/202611050001_acompanhamento.sql"), "utf8");
  await db.exec(migration); await db.exec(migration);
  await account(null, "anon"); await assert.rejects(rpc("home"), /permission denied/);
  await account(null); await assert.rejects(rpc("home"), /Entre novamente/);
  await account(coach);
  const invite = await rpc("invite_create", { id: id(10) });
  assert.notEqual(invite.code, invite.id, "código secreto gerado pelo servidor, separado da chave de reenvio do cliente");
  assert.deepEqual(await rpc("invite_create", { id: id(10) }), invite, "criação pode ser repetida após perder resposta");
  await assert.rejects(rpc("invite_accept", { code: invite.code, consent: true }), /inválido/);
  await account(student);
  await assert.rejects(rpc("invite_preview", { code: invite.id }), /inválido/);
  assert.equal((await rpc("invite_preview", { code: invite.code })).coach_name, "Treinador");
  await assert.rejects(rpc("invite_accept", { code: invite.code }), /Confirme/);
  const link = await rpc("invite_accept", { code: invite.code, consent: true });
  assert.equal(link.student_id, student); assert.equal(link.coach_id, coach);
  assert.deepEqual(await rpc("invite_accept", { code: invite.code, consent: true }), link, "aceite idempotente");
  await assert.rejects(rpc("draft_save", { link_id: link.id, id: id(20), revision: 0, document }), /Somente o treinador/);
  await account(stranger);
  await assert.rejects(rpc("invite_accept", { code: invite.code, consent: true }), /já foi utilizado/);
  await assert.rejects(rpc("history", { link_id: link.id }), /Vínculo não disponível/);
  await assert.rejects(rpc("end", { link_id: link.id }), /Vínculo não disponível/);
  await account(coach);
  for (const table of ["coaching_links", "coaching_invites", "coaching_drafts", "coaching_deliveries", "coaching_feedback"])
    await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
  let draft = await rpc("draft_save", { link_id: link.id, id: id(20), revision: 0, document });
  assert.deepEqual(await rpc("draft_save", { link_id: link.id, id: id(20), revision: 0, document }), draft, "salvamento idempotente");
  await assert.rejects(rpc("draft_save", { link_id: link.id, id: id(20), revision: 0, document: { ...document, name: "Outro" } }), /mudou/);
  for (const bad of [{ ...document, name: "" }, { ...document, exercises: [] }, { ...document, exercises: [{ ...document.exercises[0], rest: -1 }] },
    { ...document, exercises: [{ ...document.exercises[0], sets: 2.5 }] }, { ...document, exercises: [{ ...document.exercises[0], weight: "12" }] },
    { ...document, exercises: [{ ...document.exercises[0], reps: "12-8" }] }])
    await assert.rejects(rpc("draft_save", { link_id: link.id, id: id(21), revision: 0, document: bad }));
  const delivery = await rpc("publish", { link_id: link.id, id: draft.id, revision: 1 });
  assert.deepEqual(await rpc("publish", { link_id: link.id, id: draft.id, revision: 1 }), delivery, "reenvio não duplica planos nem exercícios");
  assert.equal((await db.query("select * from workout_plans")).rows.length, 0, "treinador não lê tabelas privadas diretamente");
  await account(student);
  const plans = (await db.query("select * from workout_plans")).rows;
  assert.equal(plans.length, 1); assert.equal(plans[0].user_id, student);
  assert.equal((await db.query("select * from exercises")).rows.length, 2);
  assert.equal((await db.query("select * from exercise_load_defaults")).rows.length, 5);
  assert.equal((await rpc("delivery", { plan_id: delivery.plan_id })).coach_name, "Treinador");
  await db.query("insert into workout_sessions(id,user_id,plan_id,started_at,status,duration_minutes,notes) values($1,$2,$3,now(),'em_andamento',45,'anotação')", [id(30), student, delivery.plan_id]);
  const exercise = delivery.document.exercises[0].exercise_id;
  await db.query("insert into workout_sets(id,user_id,session_id,exercise_id,exercise_name,set_number,reps,weight_kg) values($1,$2,$3,$4,'Supino',1,10,15)", [id(31), student, id(30), exercise]);
  await account(coach);
  draft = await rpc("draft_save", { link_id: link.id, id: draft.id, revision: 1, document: { ...document, name: "Ficha revisada" } });
  const delivery2 = await rpc("publish", { link_id: link.id, id: draft.id, revision: 2 });
  assert.notEqual(delivery.plan_id, delivery2.plan_id);
  await assert.rejects(rpc("publish", { link_id: link.id, id: draft.id, revision: 1 }), /mudou/);
  assert.equal((await db.query("update workout_sessions set status='concluido' where id=$1 returning id", [id(30)])).rows.length, 0, "treinador não conclui treino do aluno");
  await account(student);
  assert.equal((await db.query("select plan_id from workout_sessions where id=$1", [id(30)])).rows[0].plan_id, delivery.plan_id, "sessão ativa permanece na versão original");
  await db.query("update workout_sessions set status='concluido',finished_at=now() where id=$1", [id(30)]);
  await rpc("feedback", { session_id: id(30), comment: "Última série difícil" });
  await db.query("update workout_plans set name='Meu treino renomeado' where id=$1", [delivery.plan_id]);
  await account(coach);
  const history = await rpc("history", { link_id: link.id });
  const currentPlans = await rpc("plans", { link_id: link.id });
  assert.equal(currentPlans.total, 2);
  assert.equal(currentPlans.plans.find(p => p.id === delivery.plan_id).exercises[0].loads[0].weight_kg, 12.5);
  assert.equal(history.total, 1); assert.equal(history.last30, 1);
  assert.equal(history.sessions[0].comment, "Última série difícil");
  assert.equal(history.sessions[0].sets[0].weight_kg, 15);
  assert.equal(Object.hasOwn(history.sessions[0], "email"), false);
  assert.equal(Object.hasOwn(currentPlans.plans[0].exercises[0], "photo_path"), false);
  await assert.rejects(rpc("feedback", { session_id: id(30), comment: "Não sou o dono" }), /sua conta/);
  // Falha no meio da publicação deve reverter plano, exercícios e recibo.
  await account(null, "postgres");
  await db.exec("create function fail_exercise() returns trigger language plpgsql as $$begin if new.name='Falhar' then raise exception 'falha simulada'; end if; return new; end$$; create trigger fail_exercise before insert on exercises for each row execute function fail_exercise();");
  const beforeFailure = await snapshot();
  await account(coach);
  const badDraft = await rpc("draft_save", { link_id: link.id, id: id(22), revision: 0, document: { ...document, exercises: [...document.exercises, { ...document.exercises[0], name: "Falhar" }] } });
  await assert.rejects(rpc("publish", { link_id: link.id, id: badDraft.id, revision: 1 }), /falha simulada/);
  await account(null, "postgres"); assert.deepEqual(await snapshot(), beforeFailure, "publicação atômica");
  for (let i = 0; i < 25; i++) await db.query("insert into workout_sessions(id,user_id,started_at,status) values($1,$2,now()-interval '2 days','concluido')", [id(100 + i), student]);
  await account(coach);
  assert.equal((await rpc("history", { link_id: link.id, offset: 0 })).sessions.length, 20);
  assert.equal((await rpc("history", { link_id: link.id, offset: 20 })).sessions.length, 6);
  await account(null, "postgres");
  const preserved = await snapshot();
  await account(student); await rpc("end", { link_id: link.id }); await rpc("end", { link_id: link.id });
  await account(null, "postgres"); assert.deepEqual(await snapshot(), preserved, "separação não altera nenhum dado de treino ou observação");
  await account(coach);
  for (const action of ["history", "plans", "drafts", "draft_save", "publish"])
    await assert.rejects(rpc(action, { link_id: link.id, id: draft.id, revision: 2, document }), /encerrado/);
  await account(student);
  assert.equal((await rpc("delivery", { plan_id: delivery.plan_id })).document.exercises.length, 2);
  assert.equal((await rpc("my_history")).sessions[0].comment, "Última série difícil");
  await rpc("feedback", { session_id: id(30), comment: "Observação mantida e editável após separação" });
  await assert.rejects(rpc("invite_accept", { code: invite.code, consent: true }), /já foi utilizado/);
  // Novo aceite não reabre os rascunhos do vínculo encerrado.
  await account(coach); const invite2 = await rpc("invite_create", { id: id(11) });
  await account(student); const link2 = await rpc("invite_accept", { code: invite2.code, consent: true });
  assert.notEqual(link2.id, link.id);
  await account(coach);
  assert.deepEqual(await rpc("drafts", { link_id: link2.id }), []);
  await assert.rejects(rpc("publish", { link_id: link2.id, id: draft.id, revision: 2 }), /não encontrada/);
  await rpc("end", { link_id: link2.id });
  const canceled = await rpc("invite_create", { id: id(12) }); await rpc("invite_revoke", { id: id(12) });
  await account(student); await assert.rejects(rpc("invite_accept", { code: canceled.code, consent: true }), /inválido/);
  await account(coach); const expired = await rpc("invite_create", { id: id(13) });
  await account(null, "postgres"); await db.query("update coaching_invites set expires_at=now()-interval '1 day' where id=$1", [id(13)]);
  await account(student); await assert.rejects(rpc("invite_preview", { code: expired.code }), /expirado/);
  await account(stranger); assert.equal(await rpc("delivery", { plan_id: delivery.plan_id }), null);
  console.log("Acompanhamento SQL aprovado: consentimento, RLS, propriedade, validação, revisões, reenvio, rollback, histórico e preservação após separação por ambas as partes.");
  await db.close();
})().catch(async error => { console.error(error); await db.close(); process.exitCode = 1; });
