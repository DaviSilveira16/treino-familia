const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const { aplicarMudancasDoPlano } = carregar("servicos/planoTreinoAtivo.ts", { "../supabase": {} });

const exercicio = (id, name = id) => ({ id, name, sets_goal: 2, reps_goal: "10" });
const serie = (exercise_id, set_number, weight_kg = "20", demais = {}) => ({
  chave: `${exercise_id}:${set_number}`, exercise_id, exercise_name: exercise_id,
  set_number, weight_kg, reps: "10", concluida: false, ...demais,
});
const anterior = {
  exercicios: [exercicio("A"), exercicio("B"), exercicio("C")],
  series: [serie("A", 1), serie("A", 2), serie("B", 1), serie("B", 2), serie("C", 1)],
};
const concluida = serie("A", 1, "25", { concluida: true, registroId: "gravada" });
const removidaPendente = serie("B", 1, "40", { concluida: true, pendente: "salvar", registroId: "pendente" });
const avulsa = serie("D", 1, "8", { avulsa: true });
const atual = {
  exercicios: [...anterior.exercicios, { ...exercicio("D"), avulso: true }],
  series: [concluida, serie("A", 2, "30", { reps: "7" }), removidaPendente, serie("B", 2), serie("C", 1), avulsa],
};
const novo = {
  exercicios: [exercicio("E"), { ...exercicio("A", "A atualizado"), photo_path: "foto.jpg" }],
  series: [serie("E", 1), serie("A", 1, "50"), serie("A", 2, "55")],
};
const resultado = aplicarMudancasDoPlano(atual, anterior, novo);
const porChave = new Map(resultado.series.map((item) => [item.chave, item]));
assert.equal(porChave.get("A:1"), concluida);
assert.equal(porChave.get("A:2").weight_kg, "55");
assert.equal(porChave.get("A:2").reps, "7");
assert.equal(porChave.get("A:2").exercise_name, "A atualizado");
assert.equal(porChave.get("B:1").avulsa, true);
assert.equal(porChave.get("B:1").pendente, "salvar");
assert.equal(porChave.get("B:1").registroId, "pendente");
assert.equal(porChave.has("B:2"), false);
assert.equal(porChave.has("C:1"), false);
assert.equal(porChave.get("D:1"), avulsa);
assert.equal(resultado.series[0].exercise_id, "E");
assert.equal(resultado.exercicios[1].photo_path, "foto.jpg");
console.log("OK — plano ativo aplica as mudanças de referência, preserva séries protegidas, ajustes e exercícios avulsos.");
