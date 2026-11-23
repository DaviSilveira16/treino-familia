const assert = require("node:assert/strict");
const { falhaNativaEsperada } = require("../scripts/falhas-fetch-smoke.cjs");

const report = { url: "http://localhost/rest/v1/rpc/tf_resumo_semanal", at: 5000, offline: false };
const semCancelamentos = new Set();
const classificar = (failure) => falhaNativaEsperada(report, semCancelamentos, [failure]);
const online = { ...report, aborted: false, unloading: false, name: "TypeError" };

assert.equal(classificar(online), false, "Uma falha online da RPC continua bloqueando o teste");
assert.equal(classificar({ ...online, unloading: true, at: 5040 }), true,
  "Cancelamento durante reload confirmado pelo documento é esperado no WebKit");
assert.equal(classificar({ ...online, unloading: true, url: "http://localhost/rest/v1/outra" }), false,
  "O descarregamento precisa corresponder à URL que falhou");
assert.equal(classificar({ ...online, unloading: true, at: 7000 }), false,
  "Um reload anterior não justifica uma nova falha online");
assert.equal(classificar({ ...online, aborted: true }), true);
assert.equal(classificar({ ...online, offline: true }), true);
assert.equal(falhaNativaEsperada({ ...report, offline: true }, semCancelamentos, []), true);
assert.equal(falhaNativaEsperada(report, new Set([report.url]), []), true);
assert.equal(falhaNativaEsperada(report, semCancelamentos, []), false);
console.log("OK diagnóstico WebKit: reload comprovado, URL e tempo correspondentes; erro online continua bloqueado");
