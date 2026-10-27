const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const inicio = "2026-10-26T12:00:00Z",
  fim = "2026-10-26T12:02:58.000Z";
const draft = {
  versao: 1,
  usuarioId: "u1",
  planId: "p1",
  planName: "Perna",
  sessao: { id: "s1", plan_id: "p1", started_at: inicio },
  exercicios: [],
  series: [
    {
      chave: "e1:1",
      exercise_id: "e1",
      exercise_name: "Leg press",
      set_number: 1,
      reps: "8",
      weight_kg: "300",
      concluida: true,
    },
  ],
  intensidade: "moderada",
  esforco: "adequado",
  salvoEm: inicio,
};
function ambiente(sessao, falharDetalhes = false) {
  const storage = armazenamento();
  const local = carregar("servicos/treinoLocal.ts", {
    "@react-native-async-storage/async-storage": storage,
  });
  const state = { user: "u1", writes: 0, reads: 0, fail: falharDetalhes };
  const backend = {
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: { id: state.user } },
          error: null,
        }),
      },
      from(table) {
        assert.equal(
          table,
          "workout_sessions",
          "Reconhecer conclusão não precisa alterar séries",
        );
        const filters = [];
        let dados;
        const q = {
          select: () => q,
          eq(k, v) {
            filters.push([k, v]);
            return q;
          },
          update(v) {
            dados = v;
            return q;
          },
          maybeSingle: async () => {
            assert.ok(filters.some(([k, v]) => k === "user_id" && v === "u1"));
            state.reads++;
            if (dados) {
              state.writes++;
              if (state.fail) {
                state.fail = false;
                return {
                  data: null,
                  error: { message: "Detalhes indisponíveis" },
                };
              }
              Object.assign(sessao, dados);
            }
            return { data: sessao, error: null };
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
  return { local, sync, storage, state };
}
(async () => {
  // Cache antigo já não tem finalização nem operações: ainda precisa conferir o servidor.
  let a = ambiente({
    id: "s1",
    plan_id: "p1",
    status: "concluido",
    finished_at: fim,
  });
  await a.local.gravarRascunho(draft);
  assert.ok(await a.local.lerResumoTreinoAtivo("u1"));
  assert.equal(
    (await a.sync.sincronizarTreinosPendentes("u1"))[0].encerrado,
    true,
  );
  assert.equal(await a.local.lerResumoTreinoAtivo("u1"), null);
  assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  assert.equal(await a.local.sessaoFoiEncerrada("u1", "s1"), true);
  assert.equal(
    a.state.writes,
    0,
    "Conclusão remota reconhecida sem sobrescrever o servidor",
  );
  assert.equal(
    (await a.local.listarCopiasTreino("u1", "p1"))[0].rascunho.series[0]
      .weight_kg,
    "300",
  );
  await a.local.gravarRascunho(draft);
  assert.equal(
    await a.local.lerRascunho("u1", "p1"),
    null,
    "Tela antiga não recria o aviso",
  );
  // O status remoto encerra a UI antes das métricas; a fila de dados continua independente.
  a = ambiente(
    { id: "s1", plan_id: "p1", status: "concluido", finished_at: fim },
    true,
  );
  await a.local.gravarRascunho({
    ...draft,
    finalizacao: {
      finishedAt: fim,
      notes: "Original",
      metricas: { duration_minutes: 3 },
    },
  });
  const parcial = await a.sync.sincronizarRascunho("u1", "p1");
  assert.equal(parcial.encerrado, true);
  assert.ok(parcial.erro);
  assert.equal(await a.local.lerResumoTreinoAtivo("u1"), null);
  assert.ok(
    (await a.local.lerRascunho("u1", "p1")).finalizacao,
    "Detalhes continuam na fila",
  );
  assert.equal(
    (await a.local.listarCopiasTreino("u1", "p1")).length,
    1,
    "Dados pendentes continuam consultáveis",
  );
  assert.equal(
    (await a.sync.sincronizarTreinosPendentes("u1"))[0].concluido,
    true,
  );
  assert.equal(await a.local.lerRascunho("u1", "p1"), null);
  // Conclusão de outro fluxo: conserva também diferenças locais ainda não transmitidas.
  a = ambiente({
    id: "s1",
    plan_id: "outro-plano",
    status: "concluido",
    finished_at: fim,
  });
  await a.local.gravarRascunho({
    ...draft,
    series: [{ ...draft.series[0], pendente: "salvar", reps: "12" }],
    finalizacao: {
      finishedAt: "2026-10-26T12:03:00Z",
      metricas: {},
      notes: "Local",
    },
  });
  assert.equal((await a.sync.sincronizarRascunho("u1", "p1")).encerrado, true);
  const [copia] = await a.local.listarCopiasTreino("u1", "p1");
  assert.equal(copia.rascunho.series[0].reps, "12");
  assert.equal(copia.rascunho.series[0].pendente, "salvar");
  assert.equal(a.state.writes, 0);
  // Mesmo sem horário válido, concluído não vira um treino ativo. Dados não são apagados.
  a = ambiente({
    id: "s1",
    plan_id: "p1",
    status: "concluido",
    finished_at: null,
  });
  await a.local.gravarRascunho(draft);
  assert.equal((await a.sync.sincronizarRascunho("u1", "p1")).encerrado, true);
  assert.equal(await a.local.lerResumoTreinoAtivo("u1"), null);
  assert.ok(await a.local.lerRascunho("u1", "p1"));
  a = ambiente({
    id: "s1",
    plan_id: "p1",
    status: "em_andamento",
    finished_at: null,
  });
  await a.local.gravarRascunho(draft);
  assert.equal(
    (await a.sync.sincronizarRascunho("u1", "p1")).encerrado,
    undefined,
  );
  assert.ok(await a.local.lerResumoTreinoAtivo("u1"));
  assert.equal(a.state.writes, 0);
  a.state.user = "u2";
  assert.ok((await a.sync.sincronizarRascunho("u1", "p1")).erro);
  assert.ok(
    await a.local.lerResumoTreinoAtivo("u1"),
    "Conta diferente não encerra a sessão local",
  );
  console.log(
    "OK — remove aviso de conclusão remota, cache sem pendências, fila de detalhes independente, backup e isolamento",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
