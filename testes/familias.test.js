const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento(), rows = [];
let inserts = 0, loseResponse = false, rejectOwner = false;
const query = () => {
  const filters = []; let value;
  const q = { select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, maybeSingle() { return q; }, single() { return q; }, insert(data) { value = data; return q; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (value) {
        if (rejectOwner) return { data: null, error: { code: "23505", message: "families_owner_user_id_key" } };
        rows.push({ ...value, invite_code: "CONVITE" }); inserts++;
        if (loseResponse) { loseResponse = false; return { data: null, error: new Error("Resposta perdida") }; }
        return { data: rows.at(-1), error: null };
      }
      return { data: rows.find(r => filters.every(f => f(r))) ?? null, error: null };
    }).then(resolve, reject); },
  }; return q;
};
const familias = carregar("servicos/familias.ts", { "@react-native-async-storage/async-storage": storage, "../supabase": { supabase: { from: query } } });
(async () => {
  const lista = [{ id: "a", name: "A", invite_code: "A" }, { id: "b", name: "B", invite_code: "B" }];
  assert.equal(familias.selecionarFamiliaPermitida(lista, "b").id, "b");
  assert.equal(familias.selecionarFamiliaPermitida(lista, "outra").id, "a");
  assert.equal(familias.selecionarFamiliaPermitida([], "b"), null);
  await familias.guardarFamiliaPreferida("u1", "a"); await familias.guardarFamiliaPreferida("u2", "b");
  assert.equal(await familias.lerFamiliaPreferida("u1"), "a"); assert.equal(await familias.lerFamiliaPreferida("u2"), "b");
  await Promise.all([familias.guardarFamiliaPreferida("u1", "a"), familias.guardarFamiliaPreferida("u1", "b")]);
  assert.equal(await familias.lerFamiliaPreferida("u1"), "b"); await familias.guardarFamiliaPreferida("u1", null); assert.equal(await familias.lerFamiliaPreferida("u1"), null);
  assert.equal(familias.somenteDaFamilia([{ family_id: "a" }, { family_id: "b" }], "b").length, 1);
  assert.equal(familias.fotoPertenceAFamilia("a/u1/foto.png", "a"), true);
  for (const path of ["b/u1/foto.png", "a/../b/foto.png", "a/%2e%2e/b/foto.png", "a\\u1\\foto.png", "https://example.com/a/foto.png", null]) assert.equal(familias.fotoPertenceAFamilia(path, "a"), false);
  loseResponse = true;
  const primeira = await familias.criarFamiliaComId("u1", " Família A ", "id-a"); assert.equal(primeira.name, "Família A"); assert.equal(inserts, 1);
  await familias.criarFamiliaComId("u1", "Família A", "id-a"); assert.equal(inserts, 1, "Não duplica a criação com resposta perdida");
  await familias.criarFamiliaComId("u1", "Família B", "id-b"); assert.equal(inserts, 2, "Mesmo criador mantém duas famílias");
  assert.equal(rows.filter(r => r.owner_user_id === "u1").length, 2);
  rejectOwner = true; await assert.rejects(() => familias.criarFamiliaComId("u1", "Família C", "id-c"), /restrição/); assert.equal(rows.length, 2, "Limites do servidor não removem famílias existentes");
  await assert.rejects(() => familias.criarFamiliaComId("u1", " ", "id-d"));
  console.log("OK — seleção e preferência por usuário, fotos por família e criação idempotente sem remover grupos");
})().catch(error => { console.error(error); process.exitCode = 1; });
