const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento();
const tempos = carregar("servicos/tempoFinalizacao.ts", {
  "@react-native-async-storage/async-storage": storage,
});
(async () => {
  assert.equal(await tempos.estimarTempoFinalizacao("u1"), null);
  await tempos.registrarTempoFinalizacao("u1", "s1", 5200);
  assert.equal(await tempos.estimarTempoFinalizacao("u1"), 6);
  assert.equal(await tempos.estimarTempoFinalizacao("u2"), null);
  await tempos.registrarTempoFinalizacao("u1", "s1", 99000);
  assert.equal(
    await tempos.estimarTempoFinalizacao("u1"),
    6,
    "Não mede duas vezes uma conclusão",
  );
  await tempos.registrarTempoFinalizacao("u1", "s2", 2000);
  await tempos.registrarTempoFinalizacao("u1", "s3", 9000);
  assert.equal(
    await tempos.estimarTempoFinalizacao("u1"),
    6,
    "Mediana não confunde maior demora com prazo garantido",
  );
  for (const valor of [NaN, Infinity, 0, -10, 300001])
    await tempos.registrarTempoFinalizacao("u1", "invalida", valor);
  assert.equal(await tempos.estimarTempoFinalizacao("u1"), 6);
  storage.dados.set(
    "@treino-familia:tempo-finalizacao:v1:u1",
    "conteúdo corrompido",
  );
  assert.equal(await tempos.estimarTempoFinalizacao("u1"), null);
  console.log(
    "OK — previsão com tempos reais, deduplicação, isolamento e cache inválido",
  );
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
