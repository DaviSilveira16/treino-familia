const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
let chamadas = [], resposta, ativo = true;
const { gradeMes, chaveDiaLocal, carregarMesAcompanhado } = carregar("servicos/frequenciaAcompanhamento.ts", {
  "./acompanhamento": {
    async chamarAcompanhamento(usuario, acao, dados) {
      chamadas.push({ usuario, acao, ...dados });
      return resposta(dados);
    },
  },
});
const sessao = (id, mes, dia) => ({ id: String(id), started_at: new Date(2026, mes, dia, 12).toISOString() });
(async () => {
  assert.equal(gradeMes(2024, 1).filter(Boolean).length, 29);
  assert.equal(gradeMes(2026, 1).filter(Boolean).length, 28);
  assert.equal(gradeMes(2026, 10).length % 7, 0);
  assert.equal(chaveDiaLocal(new Date(2026, 10, 6, 23, 59)), "2026-11-06");
  const recentes = [sessao("futuro", 11, 1), ...Array.from({ length: 19 }, (_, i) => sessao(i, 10, 6))];
  resposta = ({ offset }) => offset === 0 ? { sessions: recentes, total: 23 } : { sessions: [sessao(19, 10, 1), sessao(20, 10, 1), sessao("antigo", 9, 31)], total: 23 };
  const mes = await carregarMesAcompanhado("treinador", "vinculo", 2026, 10, () => ativo);
  assert.equal(mes.length, 21, "calendário inclui sessões além da primeira página e exclui meses vizinhos");
  assert.equal(new Set(mes.map(s => chaveDiaLocal(s.started_at))).size, 2, "dias treinados não confundem sessões múltiplas com dias diferentes");
  assert.deepEqual(chamadas.map(c => c.offset), [0, 20]);
  assert.ok(chamadas.every(c => c.usuario === "treinador" && c.link_id === "vinculo" && c.acao === "history"));
  chamadas = [];
  resposta = () => ({ sessions: [sessao(1, 9, 1)], total: 100 });
  assert.equal((await carregarMesAcompanhado("treinador", "vinculo", 2026, 10, () => ativo)).length, 0);
  assert.equal(chamadas.length, 1, "para ao ultrapassar o mês em um histórico ordenado");
  resposta = () => { ativo = false; return { sessions: recentes, total: 100 }; };
  assert.equal((await carregarMesAcompanhado("treinador", "vinculo", 2026, 10, () => ativo)).length, 0, "resposta tardia de mês anterior é descartada");
  ativo = true; resposta = () => { throw new Error("Vínculo encerrado"); };
  await assert.rejects(carregarMesAcompanhado("treinador", "vinculo", 2026, 10, () => ativo), /encerrado/);
  console.log("OK frequência acompanhada: mês completo paginado, dias locais, limites, cancelamento e vínculo revogado");
})().catch(error => { console.error(error); process.exitCode = 1; });
