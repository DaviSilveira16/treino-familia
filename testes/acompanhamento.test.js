const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
let usuario = "aluno", chamadas = [], revisoes = 0, falha = null, retorno = null;
const consulta = {
  update(dados) { chamadas.push(["update", dados]); return this; },
  eq(campo, valor) { chamadas.push(["eq", campo, valor]); return this; },
  select() { return this; },
  async single() { return { data: retorno, error: falha }; },
};
const api = carregar("servicos/acompanhamento.ts", {
  "../supabase": { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: usuario } } } }) },
    from(table) { chamadas.push(["table", table]); return consulta; },
    async rpc(name, params) { chamadas.push([name, params]); if (params.p_action === "troca") usuario = "outra"; return { data: retorno, error: falha }; },
  } },
  "./revisaoDados": { registrarMudancaDeDados() { revisoes++; } },
});
const doc = { name: " A ", instructions: " cuidado ", exercises: [{ name: " Supino ", sets: 3, reps: "8 - 12", weight: 12.5, rest: 60, instructions: "" }] };
(async () => {
  const validado = api.validarFicha(doc);
  assert.equal(validado.name, "A"); assert.equal(validado.exercises[0].reps, "8-12");
  assert.equal(validado.exercises[0].weight, 12.5); assert.equal(doc.name, " A ");
  for (const ex of [{ sets: 0 }, { sets: 2.5 }, { rest: -1 }, { weight: NaN }, { weight: Infinity }, { reps: "12-8" }, { reps: "0" }])
    assert.throws(() => api.validarFicha({ ...doc, exercises: [{ ...doc.exercises[0], ...ex }] }));
  assert.throws(() => api.validarFicha({ ...doc, exercises: [] }));
  assert.throws(() => api.normalizarCodigoConvite("abc"));
  assert.equal(api.normalizarCodigoConvite(" 00000000-0000-4000-8000-000000000001 "), "00000000-0000-4000-8000-000000000001");
  await assert.rejects(api.chamarAcompanhamento("outra", "home"), /conta mudou/); assert.equal(chamadas.length, 0);
  retorno = { links: [], invites: [] };
  await api.chamarAcompanhamento("aluno", "home");
  await assert.rejects(api.chamarAcompanhamento("aluno", "troca"), /conta mudou/);
  usuario = "aluno"; falha = { code: "PGRST202" };
  await assert.rejects(api.chamarAcompanhamento("aluno", "home"), /habilitado/);
  falha = null; chamadas = []; retorno = { id: "p1", name: "Novo nome" };
  await api.renomearTreino("aluno", "p1", " Novo nome ");
  assert.deepEqual(JSON.parse(JSON.stringify(chamadas)), [["table", "workout_plans"], ["update", { name: "Novo nome" }], ["eq", "id", "p1"], ["eq", "user_id", "aluno"]]);
  assert.equal(revisoes, 1, "renomear invalida as leituras de outras telas");
  falha = { code: "23505" }; await assert.rejects(api.renomearTreino("aluno", "p1", "Duplicado"), /já tem/);
  assert.equal(revisoes, 1); falha = null;
  await assert.rejects(api.renomearTreino("aluno", "p1", " "), /Informe/);
  await assert.rejects(api.renomearTreino("outra", "p1", "Nome"), /novamente/);
  retorno = { id: "p2", name: "Novo nome" }; await assert.rejects(api.renomearTreino("aluno", "p1", "Novo nome"), /não confirmou/);
  console.log("OK acompanhamento: validação, isolamento de conta, falhas e renomeação preservando identidade do plano");
})().catch(error => { console.error(error); process.exitCode = 1; });
