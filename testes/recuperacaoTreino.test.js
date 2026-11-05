const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento();
const local = carregar("servicos/treinoLocal.ts", {
  "@react-native-async-storage/async-storage": storage,
});
const inicio = "2026-10-26T12:00:00.000Z",
  fim = "2026-10-26T12:03:00.000Z";
const serie = {
  chave: "e1:1",
  exercise_id: "e1",
  exercise_name: "Leg press",
  set_number: 1,
  reps: "8",
  weight_kg: "300",
  concluida: true,
  pendente: "salvar",
  registroId: "r1",
};
const draft = {
  versao: 1,
  usuarioId: "u1",
  planId: "p1",
  planName: "Perna",
  sessao: { id: "s1", plan_id: "p1", started_at: inicio },
  exercicios: [],
  series: [serie],
  intensidade: "moderada",
  esforco: "adequado",
  salvoEm: inicio,
};
let autenticado = "u1",
  leituras = 0;
let remota = {
  id: "s1",
  plan_id: "p1",
  status: "concluido",
  finished_at: "2026-10-26T12:02:58+00:00",
};
const backend = {
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { id: autenticado } },
        error: null,
      }),
    },
    from(table) {
      assert.equal(table, "workout_sessions"); // A recuperação não consulta/altera séries, planos ou métricas.
      const filtros = {};
      const q = {
        select: () => q,
        eq: (k, v) => {
          filtros[k] = v;
          return q;
        },
        maybeSingle: async () => {
          leituras++;
          assert.equal(filtros.id, "s1");
          assert.equal(filtros.user_id, "u1");
          return { data: remota, error: null };
        },
      };
      return q;
    },
  },
};
const sync = carregar("servicos/treinoSincronizacao.ts", {
  "./performance": { medir: (_operacao, executar) => executar() },
  "./tempoFinalizacao": { registrarTempoFinalizacao: async () => {} },
  "../supabase": backend,
  "./treinoLocal": local,
  "./revisaoDados": { registrarMudancaDeDados() {} },
  "./salvarModeloTreino": {
    salvarModeloDoTreino() {
      throw new Error("Não deve gravar modelo na recuperação");
    },
    ConflitoModeloTreino: class extends Error {},
  },
});
(async () => {
  await local.gravarRascunho(draft);
  // A resposta da última série chega enquanto a revisão está aberta.
  await local.atualizarRascunho("u1", "p1", (d) => ({
    ...d,
    series: [{ ...d.series[0], pendente: undefined }],
  }));
  const conclusao = {
    finishedAt: fim,
    notes: "Original",
    metricas: { duration_minutes: 3 },
  };
  await local.guardarConclusao("u1", "p1", "s1", conclusao);
  await local.gravarRascunho(draft); // Snapshot antigo sem finalização.
  await local.gravarRascunho({
    ...draft,
    finalizacao: { ...conclusao, finishedAt: inicio },
  });
  let atual = await local.lerRascunho("u1", "p1");
  assert.equal(atual.finalizacao.finishedAt, fim);
  assert.equal(
    atual.series[0].pendente,
    undefined,
    "Autosave antigo não restaura envio confirmado",
  );
  assert.equal(
    sync.situacaoConclusao(remota, atual),
    "conflito",
    "Horários diferentes não autorizam sobrescrita da conclusão remota",
  );
  autenticado = "u2";
  const antes = leituras;
  assert.ok((await sync.recuperarConclusaoRemota("u1", "p1")).erro);
  assert.equal(
    leituras,
    antes,
    "Outra conta não consulta nem arquiva os dados",
  );
  autenticado = "u1";
  const concluida = remota;
  for (const invalida of [
    null,
    { ...concluida, status: "em_andamento" },
    { ...concluida, finished_at: null },
  ]) {
    remota = invalida;
    assert.ok((await sync.recuperarConclusaoRemota("u1", "p1")).erro);
    assert.ok(await local.lerRascunho("u1", "p1"));
  }
  remota = concluida;
  const setOriginal = storage.default.setItem;
  storage.default.setItem = async (key, value) => {
    if (key.includes(":recuperacao:")) throw new Error("Disco cheio");
    return setOriginal(key, value);
  };
  assert.ok((await sync.recuperarConclusaoRemota("u1", "p1")).erro);
  assert.ok(
    await local.lerRascunho("u1", "p1"),
    "Falha de backup não remove o rascunho",
  );
  storage.default.setItem = setOriginal;
  atual = await local.lerRascunho("u1", "p1");
  assert.equal(
    (await sync.recuperarConclusaoRemota("u1", "p1")).concluido,
    true,
  );
  assert.equal(await local.lerRascunho("u1", "p1"), null);
  const [backup] = await local.listarCopiasTreino("u1", "p1");
  assert.equal(
    JSON.stringify(backup.rascunho),
    JSON.stringify(atual),
    "Backup preserva todos os dados, mesmo com horários diferentes",
  );
  assert.equal(backup.remota.finished_at, concluida.finished_at);
  assert.equal((await local.listarCopiasTreino("u2", "p1")).length, 0);
  await local.gravarRascunho({ ...draft, finalizacao: conclusao });
  assert.equal(
    await local.lerRascunho("u1", "p1"),
    null,
    "Tela antiga não ressuscita sessão confirmada",
  );
  await local.gravarRascunho({
    ...draft,
    sessao: { ...draft.sessao, id: "s2" },
  });
  assert.equal(
    (await local.lerRascunho("u1", "p1")).sessao.id,
    "s2",
    "Outro treino no mesmo plano continua permitido",
  );
  console.log(
    "OK — conflito do vídeo, conclusão atômica, backup íntegro, falha de disco, isolamento e autosave tardio",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
