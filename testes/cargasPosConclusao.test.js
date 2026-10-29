const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const db = {
  workout_plans: [{ id: "p2", user_id: "u1", name: "Novo treino" }],
  exercises: [{ id: "e2", user_id: "u1", plan_id: "p2", name: "Supino", sets_goal: 1, reps_goal: "12" }],
  workout_sets: [{ id: "r1", user_id: "u1", session_id: "s1", exercise_id: "e2" }],
  workout_sessions: [{ id: "s1", user_id: "u1", plan_id: "p2", status: "concluido", finished_at: "2026-10-29T13:00:00Z" }],
};
let acessosReferencias = 0;
function query(table) {
  if (table === "exercise_load_defaults") acessosReferencias++;
  const filtros = [];
  let single = false;
  const q = {
    select() { return q; },
    eq(k, v) { filtros.push((r) => r[k] === v); return q; },
    maybeSingle() { single = true; return q; },
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        const rows = (db[table] || []).filter((r) => filtros.every((f) => f(r)));
        return { data: single ? rows[0] || null : rows, error: null };
      }).then(resolve, reject);
    },
  };
  return q;
}
const api = carregar("servicos/salvarModeloTreino.ts", { "../supabase": { supabase: { from: query } } });
const modelo = { modo: "novo", planId: "p2", nome: "Novo treino", exercicios: [{ id: "e2", origemId: "e1", name: "Supino", sets_goal: 3, reps_goal: "8-12", series: [{ set_number: 1, reps: 8, weight_kg: 80 }, { set_number: 2, reps: 8, weight_kg: 85 }, { set_number: 3, reps: 8, weight_kg: 90 }] }] };
const local = { usuarioId: "u1", planId: "p1", sessao: { id: "s1" }, series: [{ exercise_id: "e1", registroId: "r1", concluida: true }], finalizacao: { finishedAt: "2026-10-29T13:00:00Z", modelo } };
(async () => {
  // Antes da confirmação, alterações divergentes do planejamento continuam sendo conflito.
  await assert.rejects(() => api.salvarModeloDoTreino(local, true), api.ConflitoModeloTreino);
  const encerrado = { ...local, encerradaNoServidor: { finishedAt: local.finalizacao.finishedAt } };
  await api.salvarModeloDoTreino(encerrado, true);
  await api.salvarModeloDoTreino(encerrado);
  assert.equal(acessosReferencias, 0, "não consulta/reinsere séries planejadas após trigger guardar somente realizadas");
  assert.equal(db.exercises[0].sets_goal, 1);
  assert.equal(db.exercises[0].reps_goal, "12");
  db.exercises[0].plan_id = "outro";
  await assert.rejects(() => api.salvarModeloDoTreino(encerrado), api.ConflitoModeloTreino);
  db.exercises[0].plan_id = "p2";
  db.exercises[0].name = "Alterado em outro aparelho";
  await assert.rejects(() => api.salvarModeloDoTreino(encerrado), api.ConflitoModeloTreino);
  console.log("OK — confirmação de modelo aceita referências da sessão concluída sem restaurar planejamento e preserva identidade/propriedade.");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
