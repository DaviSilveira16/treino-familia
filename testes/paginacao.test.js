const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const paginar = carregar("servicos/paginacaoHistorico.ts");
(async () => {
  const controle = paginar.criarControleConsultas();
  const familiaA = controle.iniciar(); const familiaB = controle.iniciar();
  assert.equal(familiaA.atual(), false); assert.equal(familiaA.signal.aborted, true); assert.equal(familiaB.atual(), true);
  const pagina = controle.iniciarPagina("feed"); assert.ok(pagina); assert.equal(controle.iniciarPagina("feed"), null);
  controle.iniciar(); pagina.concluir(); assert.equal(pagina.atual(), false);
  assert.equal(paginar.unirPorId([{ id: "1" }], [{ id: "1" }, { id: "2" }, { id: "2" }]).length, 2);
  const itens = ["01", "02", "03", "04", "05"].map(id => ({ id }));
  let chamadas = 0;
  const todos = await paginar.carregarTodasPorId(cursor => { chamadas++; return Promise.resolve({ data: itens.filter(item => !cursor || item.id > cursor).slice(0, 2), error: null }); }, new AbortController().signal);
  assert.equal(todos.length, 5); assert.equal(chamadas, 4, "Não parar quando o limite do servidor for menor que o solicitado");
  await assert.rejects(paginar.carregarTodasPorId(async () => ({ data: [{ id: "01" }], error: null }), new AbortController().signal), /avançou/);
  const aborto = new AbortController(); aborto.abort();
  await assert.rejects(paginar.carregarTodasPorId(async () => ({ data: [], error: null }), aborto.signal), /cancelada/);
  console.log("OK — páginas incrementais, deduplicação e descarte de respostas antigas");
})().catch(error => { console.error(error); process.exitCode = 1; });
