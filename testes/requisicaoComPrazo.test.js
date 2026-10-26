const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
let sinalRecebido, abortou = 0, chamadas = 0;
const { requisicaoComPrazo } = carregar("servicos/requisicaoComPrazo.ts", {}, { Request, fetch: async (input, init) => {
  chamadas++;
  sinalRecebido = init.signal;
  if (input === "ok") return { ok: true };
  return new Promise((resolve, reject) => {
    const cancelar = () => { abortou++; reject(new Error("Abortada")); };
    if (init.signal.aborted) cancelar();
    else init.signal.addEventListener("abort", cancelar, { once: true });
  });
} });
(async () => {
  assert.equal((await requisicaoComPrazo("ok", undefined, 10)).ok, true);
  const sinalSucesso = sinalRecebido;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sinalSucesso.aborted, false, "Timer é removido após sucesso");
  await assert.rejects(requisicaoComPrazo("travada", undefined, 10), /Abortada/);
  assert.equal(sinalRecebido.aborted, true, "Timeout cancela a requisição real");
  const externo = new AbortController();
  const tarefa = requisicaoComPrazo("travada", { signal: externo.signal }, 1000);
  externo.abort(); await assert.rejects(tarefa, /Abortada/);
  const antes = chamadas;
  await assert.rejects(requisicaoComPrazo("travada", { signal: externo.signal }, 1000), { name: "AbortError" });
  assert.equal(chamadas, antes, "Sinal já cancelado não inicia fetch no Safari");
  assert.equal(abortou, 2);
  console.log("OK — prazo de rede, limpeza de timer e cancelamento externo preservado");
})().catch(error => { console.error(error); process.exitCode = 1; });
