const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const { chaveDiaPainel } = carregar("servicos/painelSemanal.ts");
const { montarCsv } = carregar("servicos/exportarCsv.ts");

const domingo = new Date(2026, 10, 15, 23, 55);
assert.equal(chaveDiaPainel(domingo), "2026-11-15");
assert.equal(chaveDiaPainel(new Date(2026, 0, 5)), "2026-01-05");
assert.equal(
  montarCsv(["Exercício", "Carga", "Ausente"], [['  =SOMA(1;2)', 0, null], ['Supino "A"', 22.5, undefined]]),
  '\uFEFF"Exercício";"Carga";"Ausente"\r\n"\'  =SOMA(1;2)";0;\r\n"Supino ""A""";22,5;',
);
console.log("OK — data local do painel e CSV com proteção de fórmulas e zeros preservados");
