// Verificação opcional do PostgreSQL real em WASM, sem dependência no aplicativo.
// npm install --prefix <pasta-temporaria> @electric-sql/pglite
// node scripts/verificar-nutricao-sql.cjs <pasta-temporaria>/node_modules/@electric-sql/pglite
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const db = new PGlite();
const user1 = "11111111-1111-4111-8111-111111111111";
const user2 = "22222222-2222-4222-8222-222222222222";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const nutrientes = { kcal: 200, proteinas: 10, carboidratos: 30, gorduras: 5 };
const diario = (id = uuid(1)) => ({
  id, usuarioId: user1, data: "2026-10-28", concluido: false, configuracao: null,
  modeloOrigemId: null, modeloVersao: null, alteradoEm: "2026-10-28T12:00:00Z",
  refeicoes: [{ id: uuid(2), nome: "Almoço", horario: "12:00", itens: [{
    id: uuid(3), alimentoId: null, nome: "Rótulo", marca: "", preparo: "", fonte: "Embalagem",
    gramas: 125.5, baseGramas: 100, nutrientesBase: nutrientes, consumido: true,
  }] }],
});
async function conta(id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
async function gravar(doc, revision, operation, type = "day", id = doc.id) {
  const result = await db.query("select public.nutrition_save_document($1,$2::uuid,$3::jsonb,$4::bigint,$5::uuid) as result", [type, id, JSON.stringify(doc), revision, operation]);
  return result.rows[0].result;
}
async function falha(fn, code) {
  await assert.rejects(fn, (erro) => erro.code === code, `Deveria recusar com ${code}`);
}
(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${user1}'),('${user2}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  const migration = path.join(__dirname, "../supabase/migrations/202610280001_nutricao.sql");
  await db.exec(fs.readFileSync(migration, "utf8"));
  // A reaplicação remove políticas permissivas e grants públicos preexistentes
  // que poderiam combinar com as políticas de propriedade usando OR.
  await db.exec("create policy nutrition_accidental_public on nutrition_days for select to authenticated using(true); grant all on nutrition_days to public;");
  await db.exec(fs.readFileSync(migration, "utf8"));
  await conta(user1);
  let doc = diario();
  let result = await gravar(doc, 0, uuid(10));
  assert.equal(result.status, "ok"); assert.equal(result.revision, 1);
  assert.equal((await gravar(doc, 0, uuid(10))).revision, 1);
  let row = (await db.query("select * from nutrition_days")).rows[0];
  assert.equal(row.document.refeicoes[0].itens[0].gramas, 125.5);
  result = await gravar({ ...doc, concluido: true }, 0, uuid(11));
  assert.equal(result.status, "conflict"); assert.equal(result.revision, 1);
  doc = { ...doc, concluido: true };
  assert.equal((await gravar(doc, 1, uuid(12))).revision, 2);
  assert.equal((await gravar(diario(), 0, uuid(10))).revision, 1, "Recibo antigo sobrevive a revisão posterior");
  await falha(() => gravar(doc, 0, uuid(10)), "22023");
  result = await gravar(diario(uuid(4)), 0, uuid(13));
  assert.equal(result.status, "conflict"); assert.equal(result.id, uuid(1));
  assert.equal((await db.query("select count(*)::int as n from nutrition_days")).rows[0].n, 1);
  await falha(() => db.query("update nutrition_days set revision=99"), "42501");
  await falha(() => db.query("delete from nutrition_days"), "42501");
  await falha(() => db.query("select * from nutrition_operations"), "42501");
  await falha(() => gravar({ ...doc, usuarioId: user2 }, 2, uuid(14)), "42501");
  await falha(() => gravar({ ...doc, data: "2026-02-30" }, 2, uuid(15)), "22023");
  await falha(() => gravar({ ...doc, configuracao: { usuarioId: user2 } }, 2, uuid(16)), "42501");
  const quebrado = diario(uuid(5)); quebrado.data = "2026-10-27";
  quebrado.refeicoes[0].itens[0].gramas = -1;
  await falha(() => gravar(quebrado, 0, uuid(17)), "22023");
  quebrado.refeicoes[0].itens[0].gramas = 100;
  quebrado.refeicoes[0].itens[0].nutrientesBase = { ...nutrientes, kcal: "0.6" };
  await falha(() => gravar(quebrado, 0, uuid(18)), "22023");
  await falha(() => gravar(doc, 2, uuid(19), "day;drop table auth.users"), "22023");
  await falha(() => gravar({ repetirDiariamente: false, favoritos: [], recentes: [], repetirDesde: "" }, 0, uuid(20), "preferences", user2), "42501");
  const objetivo = {
    id: uuid(21), usuarioId: user1, vigenteDesde: "2026-10-28", objetivo: "manter", metodo: "repouso-rotina-v1",
    metaKcal: 2000.6, metaProteinas: null, metaCarboidratos: null, metaGorduras: null,
    perfil: null, repousoKcal: null, fatorRotina: 1.2, baseDiariaKcal: 2300, toleranciaKcal: 100,
    restricaoAutomatica: false, criadoEm: "2026-10-28T12:00:00Z",
  };
  assert.equal((await gravar(objetivo, 0, uuid(22), "goal")).status, "ok");
  await falha(() => gravar({ ...objetivo, id: uuid(23), objetivo: null }, 0, uuid(24), "goal"), "22023");
  await falha(() => gravar({ ...objetivo, id: uuid(25), fatorRotina: 9 }, 0, uuid(26), "goal"), "22023");
  await falha(() => gravar({ ...doc, configuracao: { ...objetivo, vigenteDesde: "2026-10-29" } }, 2, uuid(32)), "22023");
  await falha(() => gravar({ ...doc, configuracao: { ...objetivo, perfil: { pesoKg: 70, alturaCm: 175, idade: 30, sexo: "inferido" } } }, 2, uuid(33)), "22023");
  await falha(() => gravar({ ...doc, refeicoes: [doc.refeicoes[0], doc.refeicoes[0]] }, 2, uuid(34)), "22023");
  await falha(() => gravar({ repetirDiariamente: false, favoritos: [123], recentes: [], repetirDesde: "", modeloPadraoId: null }, 0, uuid(35), "preferences", user1), "22023");
  await conta(user2);
  assert.equal((await db.query("select * from nutrition_days")).rows.length, 0);
  assert.equal((await db.query("select * from nutrition_goals")).rows.length, 0);
  await falha(() => gravar(doc, 2, uuid(27)), "42501");
  await conta("", "anon");
  await falha(() => db.query("select * from nutrition_days"), "42501");
  await falha(() => gravar(doc, 2, uuid(28)), "42501");
  await db.exec("reset role");
  const seed = path.join(__dirname, "../supabase/migrations/202610280002_catalogo_taco.sql");
  if (fs.existsSync(seed)) {
    await db.exec(fs.readFileSync(seed, "utf8"));
    const catalog = (await db.query("select count(*)::int as n from nutrition_foods where user_id is null")).rows[0].n;
    assert.ok(catalog > 100, "Catálogo TACO carregado");
    console.log(`Catálogo SQL verificado: ${catalog} alimentos públicos.`);
  }
  await conta(user1);
  const alimento = {
    id: uuid(29), usuarioId: user1, nome: "Meu alimento", marca: "", preparo: "", fonte: "Rótulo",
    baseGramas: 30.5, porcaoNome: "Unidade 30,5 g", nutrientes,
  };
  assert.equal((await gravar(alimento, 0, uuid(30), "food")).status, "ok");
  await conta(user2);
  assert.equal((await db.query("select * from nutrition_foods where user_id=$1", [user1])).rows.length, 0);
  if (fs.existsSync(seed)) assert.ok((await db.query("select count(*)::int as n from nutrition_foods")).rows[0].n > 100, "Catálogo público visível, alimento privado continua isolado");
  await falha(() => db.query("update nutrition_foods set name='Outra coisa'"), "42501");
  await falha(() => gravar({ ...alimento, usuarioId: null }, 0, uuid(31), "food"), "42501");
  console.log("OK — migração PostgreSQL executada duas vezes; RLS, RPC CAS, recibos, tipos decimais, validação e isolamento entre contas verificados.");
  await db.close();
})().catch(async (erro) => { console.error(erro); await db.close(); process.exitCode = 1; });
