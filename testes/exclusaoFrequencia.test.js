const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const inicio = "2026-10-26T12:00:00Z", fim = "2026-10-26T12:03:00Z";
const draft = { versao: 1, usuarioId: "u1", planId: "p1", planName: "Plano", sessao: { id: "s1", plan_id: "p1", started_at: inicio }, exercicios: [], series: [{ chave: "e1:1", exercise_id: "e1", exercise_name: "Exercício", set_number: 1, reps: "8", weight_kg: "20", concluida: true, registroId: "r1", pendente: "salvar" }], intensidade: "moderada", esforco: "adequado", salvoEm: fim, criacaoPendente: true, finalizacao: { finishedAt: fim, metricas: { duration_minutes: 3 }, notes: "Original" } };
function ambiente(existe = true) {
  const storage = armazenamento();
  const local = carregar("servicos/treinoLocal.ts", { "@react-native-async-storage/async-storage": storage });
  const db = { workout_sessions: [{ id: "s2", user_id: "u1", plan_id: "p2", started_at: inicio, status: "concluido", finished_at: fim }, { id: "s3", user_id: "u2", plan_id: "p1", started_at: inicio, status: "concluido", finished_at: fim }], workout_sets: [], workout_plans: [{ id: "p1", user_id: "u1" }], cardio_sessions: [{ id: "c1", user_id: "u1" }, { id: "c2", user_id: "u2" }] };
  if (existe) db.workout_sessions.push({ id: "s1", user_id: "u1", plan_id: "p1", started_at: inicio, status: "concluido", finished_at: fim });
  const state = { user: "u1", deny: false, loseDelete: false, failRead: false, inserts: 0, deletes: 0, writes: [], holdInsert: false, startedInsert: null, releaseInsert: null };
  function from(table) {
    const filters = []; let action = "select", value, single = false, max = Infinity;
    const q = { select() { return q; }, eq(k, v) { filters.push([k, v]); return q; }, is(k, v) { filters.push([k, v]); return q; }, gte() { return q; }, lt() { return q; }, limit(n) { max = n; return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; }, insert(v) { action = "insert"; value = v; return q; }, update(v) { action = "update"; value = v; return q; }, delete() { action = "delete"; return q; },
      then(resolve, reject) { return Promise.resolve().then(async () => {
        if (action === "select" && table === "workout_sessions" && state.failRead) { state.failRead = false; return { data: null, error: { message: "Rede indisponível" } }; }
        if (action === "insert" && table === "workout_sessions" && state.holdInsert) { state.holdInsert = false; state.startedInsert?.(); await new Promise(r => { state.releaseInsert = r; }); }
        const matches = row => filters.every(([k, v]) => row[k] === v);
        let rows = db[table].filter(matches).slice(0, max);
        if (action === "delete") {
          assert.ok(filters.some(([k, v]) => k === "user_id" && v === "u1"));
          state.deletes++; state.writes.push("delete");
          if (state.deny) return { data: [], error: null };
          db[table] = db[table].filter(row => !rows.includes(row));
          if (state.loseDelete) { state.loseDelete = false; return { data: null, error: { message: "Resposta perdida" } }; }
        }
        if (action === "insert") { state.inserts++; state.writes.push("insert"); rows = [{ finished_at: null, ...value }]; db[table].push(...rows); }
        if (action === "update") rows.forEach(row => Object.assign(row, value));
        return { data: single ? rows[0] ?? null : rows, error: null };
      }).then(resolve, reject); },
    }; return q;
  }
  let revisoes = 0;
  const mudancas = { registrarMudancaDeDados() { revisoes++; } };
  const backend = { supabase: { auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) }, from } };
  const sync = carregar("servicos/treinoSincronizacao.ts", { "../supabase": backend, "./treinoLocal": local, "./revisaoDados": mudancas, "./salvarModeloTreino": { salvarModeloDoTreino: async () => {}, ConflitoModeloTreino: class extends Error {} } });
  const excluir = carregar("servicos/excluirRegistroFrequencia.ts", { "../supabase": backend, "./treinoSincronizacao": sync, "./revisaoDados": mudancas });
  return { storage, local, state, db, sync, excluir, revisoes: () => revisoes };
}
(async () => {
  let a = ambiente(); await a.local.gravarRascunho(draft);
  await a.excluir.excluirRegistroFrequencia("u1", { tipo: "treino", id: "s1" });
  assert.equal(a.db.workout_sessions.some(s => s.id === "s1"), false);
  assert.equal(a.db.workout_sessions.length, 2, "Mantém outro treino do mesmo dia e de outra conta");
  assert.equal(a.db.cardio_sessions.length, 2);
  assert.equal((await a.local.lerExclusaoTreino("u1", "s1")).estado, "confirmada");
  assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  assert.equal((await a.local.listarCopiasTreino("u1", "p1"))[0].rascunho.series[0].weight_kg, "20");
  await a.local.gravarRascunho(draft); assert.equal(await a.local.lerRascunho("u1", "p1"), null, "Autosave antigo não restaura exclusão");
  // Simula uma versão antiga em outra aba gravando diretamente no armazenamento.
  await a.storage.default.setItem("@treino-familia:rascunho:v1:u1:p1", JSON.stringify(draft));
  assert.equal(await a.local.lerResumoTreinoAtivo("u1"), null);
  await a.sync.sincronizarTreinosPendentes("u1");
  await a.sync.reenviarConclusaoLocal("u1", "p1");
  assert.equal(a.state.inserts, 0); assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  assert.ok(a.revisoes() > 0);
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.deny = true;
  await assert.rejects(a.sync.excluirSessaoTreino("u1", "s1"), /não confirmou a exclusão/);
  assert.ok(a.db.workout_sessions.some(s => s.id === "s1"));
  assert.equal((await a.local.lerExclusaoTreino("u1", "s1")).estado, "solicitada");
  await a.sync.sincronizarRascunho("u1", "p1"); assert.equal(a.state.inserts, 0);
  a.state.deny = false; await a.sync.sincronizarTreinosPendentes("u1");
  assert.equal(a.db.workout_sessions.some(s => s.id === "s1"), false);
  assert.equal((await a.local.lerExclusaoTreino("u1", "s1")).estado, "confirmada");
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.loseDelete = true;
  await a.sync.excluirSessaoTreino("u1", "s1"); assert.equal(a.state.deletes, 1, "Resposta perdida não é exclusão perdida");
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.failRead = true;
  await assert.rejects(a.sync.excluirSessaoTreino("u1", "s1"), /confirmar a exclusão/);
  assert.equal((await a.local.lerExclusaoTreino("u1", "s1")).estado, "solicitada");
  await a.sync.sincronizarTreinosPendentes("u1"); assert.equal(a.state.inserts, 0);
  assert.equal((await a.local.lerExclusaoTreino("u1", "s1")).estado, "confirmada");
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.user = "u2";
  await assert.rejects(a.sync.excluirSessaoTreino("u1", "s1"), /Entre novamente/);
  assert.equal(a.state.deletes, 0); assert.equal(await a.local.lerExclusaoTreino("u1", "s1"), null);
  a = ambiente(); await a.local.gravarRascunho(draft);
  const setItem = a.storage.default.setItem;
  a.storage.default.setItem = async (key, value) => { if (key.includes(":recuperacao:")) throw new Error("Disco cheio"); return setItem(key, value); };
  await assert.rejects(a.sync.excluirSessaoTreino("u1", "s1"), /Disco cheio/); assert.equal(a.state.deletes, 0);
  a = ambiente(); await a.local.gravarRascunho({ ...draft, sessao: { ...draft.sessao, id: "s2" } });
  await a.sync.excluirSessaoTreino("u1", "s1"); assert.equal((await a.local.lerRascunho("u1", "p1")).sessao.id, "s2", "Não remove rascunho de outra sessão no mesmo plano");
  a = ambiente(false); a.db.workout_sessions = [];
  await a.local.gravarRascunho(draft); a.state.holdInsert = true;
  const inicioInsert = new Promise(resolve => { a.state.startedInsert = resolve; });
  const envio = a.sync.sincronizarRascunho("u1", "p1"); await inicioInsert;
  const exclusao = a.sync.excluirSessaoTreino("u1", "s1");
  while (!await a.local.lerExclusaoTreino("u1", "s1")) await new Promise(resolve => setTimeout(resolve, 1));
  a.state.releaseInsert(); await Promise.all([envio, exclusao]);
  assert.deepEqual(a.state.writes, ["insert", "delete"], "DELETE espera o INSERT em voo e vence por último");
  assert.equal(a.db.workout_sessions.length, 0); assert.equal(a.db.workout_sets.length, 0);
  // Uma sessão já conhecida que desapareceu de outro dispositivo nunca é criação nova.
  a = ambiente(); a.db.workout_sessions = [{ id: "s1", user_id: "u1", plan_id: "p1", started_at: inicio, status: "em_andamento", finished_at: null }];
  const ativa = { ...draft, finalizacao: undefined, series: [] };
  await a.local.gravarRascunho(ativa); await a.sync.sincronizarRascunho("u1", "p1");
  assert.equal((await a.local.lerRascunho("u1", "p1")).criacaoPendente, false);
  await a.local.gravarRascunho(ativa);
  assert.equal((await a.local.lerRascunho("u1", "p1")).sessaoConfirmadaNoServidor, true);
  a.db.workout_sessions = []; await a.sync.sincronizarRascunho("u1", "p1");
  assert.equal(a.state.inserts, 0); assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  a = ambiente(); a.state.deny = true;
  await assert.rejects(a.excluir.excluirRegistroFrequencia("u1", { tipo: "cardio", id: "c1" }), /não confirmou/);
  a.state.deny = false; await a.excluir.excluirRegistroFrequencia("u1", { tipo: "cardio", id: "c1" });
  assert.equal(a.db.cardio_sessions.length, 1); assert.equal(a.db.cardio_sessions[0].id, "c2");
  console.log("OK — exclusão confirmada, RLS sem linhas, reenvio cancelado, resposta perdida, INSERT em voo, snapshots antigos e isolamento");
})().catch(error => { console.error(error); process.exitCode = 1; });
