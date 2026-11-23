const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const { proximoExercicioAberto } = carregar("servicos/avancoExercicio.ts");
const exercicios = ["a", "b", "c", "d", "e"].map(id => ({ id }));
const series = [
  { exercise_id: "a", concluida: false },
  { exercise_id: "b", concluida: true },
  { exercise_id: "b", concluida: false, excluida: true },
  { exercise_id: "c", concluida: false },
  { exercise_id: "d", concluida: false },
];
assert.equal(proximoExercicioAberto("a", exercicios, series), "c", "Pula exercícios já concluídos e séries excluídas");
assert.equal(proximoExercicioAberto("a", exercicios.map(e => ({ ...e, removido: e.id === "c" })), series), "d", "Pula exercícios retirados da sessão");
assert.equal(proximoExercicioAberto("c", exercicios, series), "d");
assert.equal(proximoExercicioAberto("d", exercicios, series), null, "Exercício sem séries abertas abaixo leva à revisão, sem voltar ao início");
assert.equal(proximoExercicioAberto("ausente", exercicios, series), null);
assert.equal(proximoExercicioAberto("a", exercicios, []), null);
console.log("OK avanço de exercícios: ordem, concluídos, exclusões e revisão final");
