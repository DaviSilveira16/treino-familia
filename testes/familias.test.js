const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento();
const familias = new Map();
const membros = new Set();
let usuarioAtual = "u1";
let rejeitarCriacao = false;
const cliente = {
  async rpc(nome, args) {
    if (nome === "criar_familia_completa") {
      if (rejeitarCriacao)
        return {
          data: null,
          error: {
            code: "42501",
            message: "new row violates row-level security policy",
          },
        };
      const anterior = familias.get(args.p_id);
      if (anterior) {
        if (anterior.owner_user_id !== usuarioAtual)
          return {
            data: null,
            error: { code: "42501", message: "Somente o proprietário" },
          };
        return { data: anterior, error: null };
      }
      const nova = {
        id: args.p_id,
        name: args.p_nome,
        invite_code: `COD-${args.p_id}`,
        owner_user_id: usuarioAtual,
      };
      familias.set(nova.id, nova);
      membros.add(`${nova.id}:${usuarioAtual}`);
      return { data: nova, error: null };
    }
    if (nome === "renomear_familia") {
      const atual = familias.get(args.p_family_id);
      if (!atual || atual.owner_user_id !== usuarioAtual)
        return {
          data: null,
          error: { code: "42501", message: "Sem permissão" },
        };
      const atualizada = { ...atual, name: args.p_nome };
      familias.set(atual.id, atualizada);
      return { data: atualizada, error: null };
    }
    if (nome === "sair_da_familia") {
      membros.delete(`${args.p_family_id}:${usuarioAtual}`);
      return { data: true, error: null };
    }
    if (nome === "excluir_familia") {
      const atual = familias.get(args.p_family_id);
      if (!atual || atual.owner_user_id !== usuarioAtual)
        return {
          data: null,
          error: { code: "42501", message: "Sem permissão" },
        };
      familias.delete(args.p_family_id);
      for (const membro of [...membros])
        if (membro.startsWith(`${args.p_family_id}:`)) membros.delete(membro);
      return { data: true, error: null };
    }
    return {
      data: null,
      error: { code: "PGRST202", message: `Function ${nome} not found` },
    };
  },
};
const modulo = carregar("servicos/familias.ts", {
  "@react-native-async-storage/async-storage": storage,
  "../supabase": { supabase: cliente },
});
(async () => {
  const lista = [
    { id: "a", name: "A", invite_code: "A" },
    { id: "b", name: "B", invite_code: "B" },
  ];
  assert.equal(modulo.selecionarFamiliaPermitida(lista, "b").id, "b");
  assert.equal(modulo.selecionarFamiliaPermitida(lista, "outra").id, "a");
  assert.equal(modulo.selecionarFamiliaPermitida([], "b"), null);
  await modulo.guardarFamiliaPreferida("u1", "a");
  await modulo.guardarFamiliaPreferida("u2", "b");
  assert.equal(await modulo.lerFamiliaPreferida("u1"), "a");
  assert.equal(await modulo.lerFamiliaPreferida("u2"), "b");
  await Promise.all([
    modulo.guardarFamiliaPreferida("u1", "a"),
    modulo.guardarFamiliaPreferida("u1", "b"),
  ]);
  assert.equal(await modulo.lerFamiliaPreferida("u1"), "b");
  await modulo.guardarFamiliaPreferida("u1", null);
  assert.equal(await modulo.lerFamiliaPreferida("u1"), null);
  assert.equal(
    modulo.somenteDaFamilia([{ family_id: "a" }, { family_id: "b" }], "b")
      .length,
    1,
  );
  assert.equal(modulo.fotoPertenceAFamilia("a/u1/foto.png", "a"), true);
  for (const path of [
    "b/u1/foto.png",
    "a/../b/foto.png",
    "a/%2e%2e/b/foto.png",
    "a\\u1\\foto.png",
    "https://example.com/a/foto.png",
    null,
  ])
    assert.equal(modulo.fotoPertenceAFamilia(path, "a"), false);

  const primeira = await modulo.criarFamiliaComId("u1", " Família A ", "id-a");
  assert.equal(primeira.name, "Família A");
  await modulo.criarFamiliaComId("u1", "Família A", "id-a");
  await modulo.criarFamiliaComId("u1", "Família B", "id-b");
  assert.equal(
    [...familias.values()].filter((familia) => familia.owner_user_id === "u1")
      .length,
    2,
    "O mesmo criador pode ter duas famílias",
  );
  assert.equal(
    membros.has("id-a:u1"),
    true,
    "O criador também passa a ser membro",
  );
  const renomeada = await modulo.renomearFamilia("id-a", "Família Renomeada");
  assert.equal(renomeada.name, "Família Renomeada");
  await assert.rejects(() => modulo.criarFamiliaComId("u1", " ", "id-c"));
  rejeitarCriacao = true;
  await assert.rejects(
    () => modulo.criarFamiliaComId("u1", "Família C", "id-c"),
    (erro) => erro && erro.code === "42501",
  );
  rejeitarCriacao = false;
  usuarioAtual = "u2";
  await assert.rejects(
    () => modulo.renomearFamilia("id-a", "Tentativa de invasão"),
    (erro) => erro && erro.code === "42501",
  );
  usuarioAtual = "u1";
  await modulo.excluirFamilia("id-a");
  assert.equal(familias.has("id-a"), false);
  assert.equal(membros.has("id-a:u1"), false);
  console.log(
    "OK — famílias: seleção, privacidade, criação idempotente, renomeação, saída e exclusão por proprietário",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
