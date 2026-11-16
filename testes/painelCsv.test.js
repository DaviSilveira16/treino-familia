const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const { montarCsv } = carregar("servicos/exportarCsv.ts");

assert.equal(
  montarCsv(["Exercício", "Carga", "Ausente"], [['  =SOMA(1;2)', 0, null], ['Supino "A"', 22.5, undefined]]),
  '\uFEFF"Exercício";"Carga";"Ausente"\r\n"\'  =SOMA(1;2)";0;\r\n"Supino ""A""";22,5;',
);
console.log("OK — CSV com proteção de fórmulas e zeros preservados");
