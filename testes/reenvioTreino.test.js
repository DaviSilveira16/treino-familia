const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const inicio = "2026-10-26T12:00:00.000Z", fim = "2026-10-26T12:02:58.000Z";
const serie = { chave: "e1:1", exercise_id: "e1", exercise_name: "Leg press 45", set_number: 1, reps: "8", weight_kg: "300", concluida: true, registroId: "r1" };
const draft = { versao: 1, usuarioId: "u1", planId: "p1", planName: "Perna top up", sessao: { id: "s1", plan_id: "p1", started_at: inicio }, exercicios: [{ id: "e1", name: "Leg press 45", sets_goal: 18, reps_goal: "8" }], series: [serie, ...Array.from({ length: 17 }, (_, i) => ({ ...serie, chave: `e1:${i + 2}`, set_number: i + 2, concluida: false, registroId: undefined }))], intensidade: "moderada", esforco: "adequado", salvoEm: fim, finalizacao: { finishedAt: fim, notes: "Horário original", metricas: { duration_minutes: 2.97, volume_kg: 2400, sets_completed: 1 } }, conflitoSincronizacao: true, conflitoSessao: true };
function ambiente(sessao = null) {
  const storage = armazenamento();
  const local = carregar("servicos/treinoLocal.ts", { "@react-native-async-storage/async-storage": storage });
  const db = { workout_sessions: sessao ? [{ id: "s1", user_id: "u1", plan_id: "p1", started_at: inicio, ...sessao }] : [], workout_sets: [], workout_plans: [{ id: "p1", user_id: "u1" }] };
  const state = { user: "u1", mutations: [], lose: null, before: null, denied: false };
  function from(table) {
    const filters = []; let action = "select", value, single = false, max = Infinity;
    const q = { select() { return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; }, is(k, v) { filters.push(row => row[k] === v); return q; }, gte(k, v) { filters.push(row => row[k] >= v); return q; }, lt(k, v) { filters.push(row => row[k] < v); return q; }, limit(n) { max = n; return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      insert(v) { action = "insert"; value = v; return q; }, update(v) { action = "update"; value = v; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (state.denied) return { data: null, error: { message: "Permissão de gravação negada", code: "42501" } };
        state.before?.(table, action, value);
        let rows = db[table].filter(row => filters.every(filter => filter(row))).slice(0, max);
        if (action === "insert") {
          if (db[table].some(row => row.id === value.id)) return { data: null, error: { message: "ID duplicado", code: "23505" } };
          rows = [{ ...(table === "workout_sessions" ? { finished_at: null } : {}), ...value }]; db[table].push(...rows);
        }
        if (action === "update") rows.forEach(row => Object.assign(row, value));
        if (action !== "select") state.mutations.push({ table, action, value: { ...value }, count: rows.length });
        const fault = `${table}:${action}${action === "update" && !value.status ? ":detalhes" : ""}`;
        if (state.lose === fault) { state.lose = null; return { data: null, error: { message: "Resposta perdida após gravação", code: "NETWORK" } }; }
        return { data: single ? rows[0] ?? null : rows, error: null };
      }).then(resolve, reject); },
    }; return q;
  }
  const backend = { supabase: { auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) }, from } };
  const sync = carregar("servicos/treinoSincronizacao.ts", { "../supabase": backend, "./treinoLocal": local, "./revisaoDados": { registrarMudancaDeDados() {} }, "./salvarModeloTreino": { salvarModeloDoTreino: async () => {}, ConflitoModeloTreino: class extends Error {} } });
  return { storage, local, db, state, sync };
}
(async () => {
  let a = ambiente();
  await a.local.gravarRascunho(draft);
  assert.match((await a.sync.recuperarConclusaoRemota("u1", "p1")).erro, /não foi encontrada/);
  assert.match((await a.sync.sincronizarRascunho("u1", "p1")).erro, /Enviar treino salvo/);
  assert.equal(a.state.mutations.length, 0, "Conflito não cria sessão sem escolha explícita");
  const antes = await a.local.lerRascunho("u1", "p1");
  assert.equal((await a.sync.reenviarConclusaoLocal("u1", "p1")).concluido, true);
  assert.equal(a.db.workout_sessions.length, 1);
  assert.equal(a.db.workout_sessions[0].id, "s1"); assert.equal(a.db.workout_sessions[0].started_at, inicio); assert.equal(a.db.workout_sessions[0].finished_at, fim);
  assert.equal(a.db.workout_sessions[0].status, "concluido"); assert.equal(a.db.workout_sessions[0].volume_kg, 2400);
  assert.equal(a.db.workout_sets.length, 1, "Somente 1 das 18 séries foi concluída e deve ser enviada");
  assert.equal(a.db.workout_sets[0].weight_kg, 300); assert.equal(a.db.workout_sets[0].reps, 8);
  assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  assert.equal(JSON.stringify((await a.local.listarCopiasTreino("u1", "p1"))[0].rascunho), JSON.stringify(antes));
  await a.sync.reenviarConclusaoLocal("u1", "p1"); assert.equal(a.db.workout_sessions.length, 1);
  for (const fault of ["workout_sessions:insert", "workout_sets:insert", "workout_sessions:update", "workout_sessions:update:detalhes"]) {
    a = ambiente(); await a.local.gravarRascunho(draft); a.state.lose = fault;
    const primeira = await a.sync.reenviarConclusaoLocal("u1", "p1"); assert.ok(primeira.erro, fault);
    assert.ok(await a.local.lerRascunho("u1", "p1"), "Falha mantém a fila");
    assert.equal((await a.sync.reenviarConclusaoLocal("u1", "p1")).concluido, true, fault);
    assert.equal(a.db.workout_sessions.length, 1); assert.equal(a.db.workout_sets.length, 1);
    assert.equal(a.db.workout_sessions[0].finished_at, fim);
  }
  for (const status of ["em_andamento", null, "concluido"]) {
    a = ambiente({ status, finished_at: null }); await a.local.gravarRascunho(draft);
    assert.equal((await a.sync.reenviarConclusaoLocal("u1", "p1")).concluido, true, `Reparar ${status}`);
    assert.equal(a.db.workout_sessions.length, 1); assert.equal(a.db.workout_sets.length, 1); assert.equal(a.db.workout_sessions[0].finished_at, fim);
    assert.equal(a.state.mutations.some(m => m.action === "update" && m.value.status === "em_andamento"), false, "Não reabre sessão concluída");
  }
  a = ambiente({ status: "em_andamento", finished_at: null }); await a.local.gravarRascunho(draft);
  a.db.workout_sets.push({ id: "r1", user_id: "u1", session_id: "s1", exercise_id: "e1", set_number: 1, reps: 8, weight_kg: 250 });
  assert.equal((await a.sync.reenviarConclusaoLocal("u1", "p1")).conflito, true);
  assert.equal(a.db.workout_sets[0].weight_kg, 250, "Reenvio não força sobrescrita de séries divergentes");
  assert.equal(a.db.workout_sessions[0].status, "em_andamento");
  for (const sessao of [{ status: "concluido", finished_at: "2026-10-26T12:04:00.000Z" }, { status: "cancelado", finished_at: null }, { status: "em_andamento", plan_id: "outro-plano", finished_at: null }]) {
    a = ambiente(sessao); await a.local.gravarRascunho(draft);
    assert.ok((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro);
    assert.equal(a.state.mutations.length, 0); assert.ok(await a.local.lerRascunho("u1", "p1"));
  }
  a = ambiente({ status: null, finished_at: null }); await a.local.gravarRascunho(draft);
  a.state.before = (table, action, value) => { if (table === "workout_sessions" && action === "update" && value.status) { a.db.workout_sessions[0].finished_at = "2026-10-26T12:05:00.000Z"; a.db.workout_sessions[0].status = "concluido"; } };
  assert.ok((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro);
  assert.equal(a.db.workout_sessions[0].finished_at, "2026-10-26T12:05:00.000Z", "Mudança concorrente não é sobrescrita");
  assert.ok(await a.local.lerRascunho("u1", "p1"));
  a = ambiente(); await a.local.gravarRascunho(draft);
  const originalSet = a.storage.default.setItem;
  a.storage.default.setItem = async (key, value) => { if (key.includes(":recuperacao:")) throw new Error("Disco cheio"); return originalSet(key, value); };
  assert.match((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro, /Disco cheio/);
  assert.equal(a.state.mutations.length, 0); assert.ok(await a.local.lerRascunho("u1", "p1"));
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.user = "u2";
  assert.match((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro, /Entre novamente/); assert.equal(a.state.mutations.length, 0);
  a = ambiente(); await a.local.gravarRascunho(draft); a.db.workout_sessions.push({ id: "outra", user_id: "u1", plan_id: "p1", started_at: inicio, status: "concluido" });
  assert.ok((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro); assert.equal(a.db.workout_sessions.length, 1, "Não cria duplicata na mesma data");
  a = ambiente(); await a.local.gravarRascunho(draft); a.state.denied = true;
  assert.match((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro, /Permissão de gravação negada/, "Erro real do PostgREST deve aparecer");
  a = ambiente(); await a.local.gravarRascunho(draft); a.db.workout_plans = [];
  assert.match((await a.sync.reenviarConclusaoLocal("u1", "p1")).erro, /plano.*não foi encontrado/); assert.equal(a.state.mutations.length, 0);
  console.log("OK — reenvio real da sessão ausente/incompleta, 1/18 séries, horário original, resposta perdida, CAS, duplicatas, backup e RLS");
})().catch(error => { console.error(error); process.exitCode = 1; });
