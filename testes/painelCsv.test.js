const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const { proximoTreino, chaveDiaPainel } = carregar("servicos/painelSemanal.ts");
const { montarCsv } = carregar("servicos/exportarCsv.ts");

const domingo = new Date(2026, 10, 15, 23, 55);
const planos = [{ id: "a", name: "Perna" }];
const programacao = [
  { day_of_week: 0, plan_id: null, is_rest_day: true },
  { day_of_week: 1, plan_id: "a", is_rest_day: false },
  { day_of_week: 2, plan_id: "excluido", is_rest_day: false },
];
assert.equal(chaveDiaPainel(domingo), "2026-11-15");
assert.equal(chaveDiaPainel(new Date(2026, 0, 5)), "2026-01-05");
assert.equal(proximoTreino(programacao, planos, domingo).dias, 1);
assert.equal(proximoTreino(programacao, planos, new Date(2026, 10, 16)).dias, 0);
assert.equal(proximoTreino(programacao, [], domingo), null);
assert.equal(
  montarCsv(["Exercício", "Carga", "Ausente"], [['  =SOMA(1;2)', 0, null], ['Supino "A"', 22.5, undefined]]),
  '\uFEFF"Exercício";"Carga";"Ausente"\r\n"\'  =SOMA(1;2)";0;\r\n"Supino ""A""";22,5;',
);
console.log("OK — programação por dia local e CSV com proteção de fórmulas e zeros preservados");
