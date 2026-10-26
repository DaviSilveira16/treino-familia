const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const local = carregar("servicos/treinoLocal.ts", { "@react-native-async-storage/async-storage": armazenamento() });
const state = { session: { id: "s1", user_id: "u1", plan_id: "p1", status: "em_andamento", finished_at: null }, sets: [], inserts: 0, finishes: 0, loseInsert: true, failMetrics: true };
function query(table) {
  const filters = []; let action = "select", value, single = false;
  const q = {
    select() { return q; }, eq(key, val) { filters.push([key, val]); return q; }, limit() { return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    insert(data) { action = "insert"; value = data; return q; }, update(data) { action = "update"; value = data; return q; }, delete() { action = "delete"; return q; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      const matches = row => filters.every(([key, val]) => row[key] === val);
      let rows = table === "workout_sessions" ? [state.session].filter(matches) : state.sets.filter(matches);
      if (action === "insert") {
        state.inserts++; state.sets.push({ ...value }); rows = [value];
        if (state.loseInsert) { state.loseInsert = false; return { data: null, error: new Error("Resposta de INSERT perdida") }; }
      }
      if (action === "update") {
        if (table === "workout_sessions" && !value.status && state.failMetrics) { state.failMetrics = false; return { data: null, error: new Error("Resposta de detalhes perdida") }; }
        if (value.status === "concluido") state.finishes++;
        rows.forEach(row => Object.assign(row, value));
      }
      return { data: single ? rows[0] ?? null : rows, error: null };
    }).then(resolve, reject); },
  }; return q;
}
const mockSupabase = { supabase: { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) }, from: query } };
const modelos = carregar("servicos/salvarModeloTreino.ts", { "../supabase": mockSupabase });
const sync = carregar("servicos/treinoSincronizacao.ts", { "../supabase": mockSupabase, "./revisaoDados": { registrarMudancaDeDados() {} }, "./treinoLocal": local, "./salvarModeloTreino": modelos });
const serie = { chave: "e1:1", exercise_id: "e1", exercise_name: "Exercício", set_number: 1, reps: "10", weight_kg: "20", concluida: true, pendente: "salvar", registroId: "r1" };
const draft = { versao: 1, usuarioId: "u1", planId: "p1", planName: "Plano", sessao: { id: "s1", plan_id: "p1", started_at: "2026-10-24T12:00:00Z" }, exercicios: [], series: [serie], intensidade: "moderada", esforco: "adequado", salvoEm: "2026-10-24T12:10:00Z" };
(async () => {
  await local.gravarRascunho(draft);
  const primeira = await sync.sincronizarRascunho("u1", "p1");
  assert.ok(primeira.erro); assert.equal((await local.lerRascunho("u1", "p1")).series[0].pendente, "salvar");
  await sync.sincronizarRascunho("u1", "p1");
  assert.equal(state.inserts, 1, "Reenvio não duplica INSERT confirmado no servidor");
  assert.equal((await local.lerRascunho("u1", "p1")).series[0].pendente, undefined);
  const finishedAt = "2026-10-24T12:10:00.000Z";
  await local.atualizarRascunho("u1", "p1", atual => ({ ...atual, finalizacao: { finishedAt, notes: "Teste", metricas: { duration_minutes: 10 } } }));
  const parcial = await sync.sincronizarRascunho("u1", "p1");
  assert.ok(parcial.erro); assert.equal((await local.lerRascunho("u1", "p1")).finalizacao.finishedAt, finishedAt);
  assert.equal(state.session.finished_at, finishedAt);
  const final = await sync.sincronizarRascunho("u1", "p1");
  assert.equal(final.concluido, true); assert.equal(await local.lerRascunho("u1", "p1"), null); assert.equal(state.finishes, 1);
  // Uma nova sessão tem outro ID; sessões concluídas nunca são reabertas.
  state.session = { ...state.session, id: "s2", status: "em_andamento", finished_at: null };
  state.sets = state.sets.map(item => ({ ...item, session_id: "s2" }));
  const segunda = { ...draft, sessao: { ...draft.sessao, id: "s2" } };
  await local.gravarRascunho({ ...segunda, series: [{ ...serie, weight_kg: "25" }] });
  const conflito = await sync.sincronizarRascunho("u1", "p1");
  assert.equal(conflito.conflito, true); assert.equal(state.sets[0].weight_kg, 20); assert.equal((await local.lerRascunho("u1", "p1")).series[0].weight_kg, "25");
  await local.gravarRascunho({ ...segunda, series: [{ ...serie, weight_kg: "25", baseRemota: { id: "r1", reps: 10, weight_kg: 20 } }] });
  const correcao = await sync.sincronizarRascunho("u1", "p1"); assert.equal(correcao.conflito, undefined); assert.equal(state.sets[0].weight_kg, 25, "Correção explícita aplica somente sobre a base conhecida");
  state.sets[0].weight_kg = 30;
  await local.gravarRascunho({ ...segunda, series: [{ ...serie, weight_kg: "35", baseRemota: { id: "r1", reps: 10, weight_kg: 25 } }] });
  assert.equal((await sync.sincronizarRascunho("u1", "p1")).conflito, true); assert.equal(state.sets[0].weight_kg, 30, "Mudança concorrente não é sobrescrita");
  console.log("OK — resposta perdida, reenvio idempotente, conclusão offline e conflito preservado");
})().catch(error => { console.error(error); process.exitCode = 1; });
