const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
let usuario = "treinador", chamadas = [], falha = null, trocar = false, revisoes = 0, sequencia = 0;
const resposta = { plan_id: "plano", snapshot: { plan: { id: "plano", name: "A" }, exercises: [], version: "v1" } };
const { criarEditorTreinosAluno } = carregar("servicos/editorTreinosAluno.ts", {
  "../supabase": { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: usuario } } } }) },
    async rpc(nome, dados) {
      chamadas.push({ nome, dados });
      if (trocar) usuario = "outra";
      return { data: resposta, error: falha };
    },
  } },
  "./treinoLocal": { novoIdSerie: () => `operacao-${++sequencia}` },
  "./revisaoDados": { registrarMudancaDeDados: () => { revisoes++; } },
});
(async () => {
  const editor = criarEditorTreinosAluno({ usuarioId: "treinador", vinculoId: "vinculo", alunoId: "aluno", nomeAluno: "Aluno" });
  usuario = "outra";
  await assert.rejects(editor.listar(), /conta mudou/); assert.equal(chamadas.length, 0);
  usuario = "treinador";
  falha = { message: "resposta perdida" };
  await assert.rejects(editor.alterar("create_plan", { name: "A" }), /resposta perdida/);
  const operacao = chamadas[0].dados.p_data.operation_id;
  falha = null;
  await editor.alterar("create_plan", { name: "A" });
  assert.equal(chamadas[1].dados.p_data.operation_id, operacao, "reenvio mantém identificador para não duplicar");
  assert.equal(chamadas[1].dados.p_link_id, "vinculo");
  assert.equal(chamadas[1].dados.p_data.user_id, undefined, "proprietário é definido pelo servidor");
  assert.equal(revisoes, 1);
  await editor.alterar("create_plan", { name: "A" });
  assert.notEqual(chamadas[2].dados.p_data.operation_id, operacao);
  trocar = true;
  await assert.rejects(editor.ler("plano"), /conta mudou/);
  trocar = false; usuario = "treinador"; falha = { code: "PGRST202" };
  await assert.rejects(editor.listar(), /habilitada no servidor/);
  console.log("OK editor do aluno: isolamento de conta, resposta perdida, idempotência e migração ausente");
})().catch(erro => { console.error(erro); process.exitCode = 1; });
