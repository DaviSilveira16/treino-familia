const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento();
const local = carregar("servicos/treinoLocal.ts", {
  "@react-native-async-storage/async-storage": storage,
});
let reads = 0,
  remoteStatus = "concluido";
const backend = {
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
    },
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          reads++;
          return {
            data: {
              id: "s1",
              plan_id: "p1",
              status: remoteStatus,
              finished_at: "2026-10-26T12:03:00Z",
            },
            error: null,
          };
        },
      };
      return q;
    },
  },
};
const sync = carregar("servicos/treinoSincronizacao.ts", {
  "./tempoFinalizacao": { registrarTempoFinalizacao: async () => {} },
  "../supabase": backend,
  "./treinoLocal": local,
  "./revisaoDados": { registrarMudancaDeDados() {} },
  "./salvarModeloTreino": {
    salvarModeloDoTreino: async () => {},
    ConflitoModeloTreino: class extends Error {},
  },
});
const draft = {
  versao: 1,
  usuarioId: "u1",
  planId: "p1",
  planName: "Perna",
  sessao: { id: "s1", plan_id: "p1", started_at: "2026-10-26T12:00:00Z" },
  exercicios: [{ id: "e1", name: "Leg press", sets_goal: 2, reps_goal: "8" }],
  series: [1, 2].map((set_number) => ({
    chave: `e1:${set_number}`,
    exercise_id: "e1",
    exercise_name: "Leg press",
    set_number,
    reps: "8",
    weight_kg: "300",
    concluida: true,
    pendente: "salvar",
    registroId: `r${set_number}`,
  })),
  intensidade: "moderada",
  esforco: "adequado",
  salvoEm: "2026-10-26T12:03:00Z",
  encerradaNoServidor: { finishedAt: "2026-10-26T12:03:00Z" },
  finalizacao: {
    finishedAt: "2026-10-26T12:03:00Z",
    metricas: {},
    notes: "Original",
  },
};
(async () => {
  await local.gravarRascunho(draft);
  let [copia] = await local.listarCopiasTreino("u1", "p1");
  assert.equal(copia.id, "pendente:s1");
  await sync.comFilaTreinoPausada("u1", async () => {
    assert.equal((await sync.sincronizarRascunho("u1", "p1")).adiado, true);
    assert.equal(reads, 0, "Fila pausada não inicia envios antigos");
    await sync.liberarTreinosEncerrados("u1");
  });
  assert.equal(await local.lerRascunho("u1", "p1"), null);
  [copia] = await local.listarCopiasTreino("u1", "p1");
  assert.ok(copia.id.startsWith("@treino-familia:recuperacao:"));
  const nova = local.novaSessaoDaCopia(
    copia,
    "u1",
    "p1",
    "Perna",
    draft.exercicios,
  );
  assert.notEqual(nova.sessao.id, "s1");
  assert.notEqual(nova.sessao.started_at, draft.sessao.started_at);
  assert.equal(nova.series.length, 2);
  assert.ok(
    nova.series.every(
      (s) => !s.concluida && !s.registroId && !s.pendente && !s.baseRemota,
    ),
  );
  assert.equal(nova.finalizacao, undefined);
  assert.equal(nova.encerradaNoServidor, undefined);
  assert.equal(nova.novaSessaoAtiva, true);
  assert.equal(nova.series[0].exercise_id, "e1");
  const avulsa = local.novaSessaoDaCopia(copia, "u1", "p1", "Perna");
  assert.notEqual(avulsa.exercicios[0].id, "e1");
  assert.equal(avulsa.series[0].avulsa, true);
  await local.gravarRascunho(nova);
  await sync.comFilaTreinoPausada("u1", () =>
    local.excluirCopiaTreino("u1", "p1", copia),
  );
  assert.equal(
    (await local.lerRascunho("u1", "p1")).sessao.id,
    nova.sessao.id,
    "Excluir cópia antiga preserva novo treino",
  );
  assert.equal((await local.listarCopiasTreino("u1", "p1")).length, 0);
  await assert.rejects(
    local.excluirCopiaTreino("u2", "p1", copia),
    /outra conta/,
  );
  await local.apagarRascunho("u1", "p1");
  await local.gravarRascunho({
    ...draft,
    sessao: { ...draft.sessao, id: "s2" },
  });
  [copia] = await local.listarCopiasTreino("u1", "p1");
  await sync.comFilaTreinoPausada("u1", () =>
    local.excluirCopiaTreino("u1", "p1", copia),
  );
  assert.equal(await local.lerRascunho("u1", "p1"), null);
  assert.equal(
    (await local.listarCopiasTreino("u1", "p1")).length,
    0,
    "Cópia virtual excluída não reaparece",
  );
  await local.gravarRascunho({
    ...draft,
    sessao: { ...draft.sessao, id: "s3" },
    encerradaNoServidor: undefined,
  });
  remoteStatus = "em_andamento";
  await assert.rejects(
    sync.comFilaTreinoPausada("u1", () => sync.liberarTreinosEncerrados("u1")),
    /realmente em andamento/,
  );
  assert.equal((await local.lerRascunho("u1", "p1")).sessao.id, "s3");
  process.stdout.write(
    "OK: usar/excluir cópia; sessão nova; fila pausada; isolamento; treino em andamento preservado.\n",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
