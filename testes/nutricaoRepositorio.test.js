const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const clone = (v) => JSON.parse(JSON.stringify(v));
const inicio = "2026-10-28";
const item = {
  id: "i1", alimentoId: "f1", nome: "Alimento da embalagem", marca: "", preparo: "",
  fonte: "Rótulo", gramas: 100, baseGramas: 100,
  nutrientesBase: { kcal: 200, proteinas: 10, carboidratos: 30, gorduras: 5 }, consumido: true,
};
const dia = (id = "d1", itens = [item]) => ({
  id, usuarioId: "u1", data: inicio, refeicoes: [{ id: "m1", nome: "Almoço", horario: "12:00", itens }],
  concluido: false, modeloOrigemId: null, modeloVersao: null, configuracao: null, alteradoEm: new Date().toISOString(),
});
const food = {
  id: "f1", usuarioId: "u1", nome: "Alimento da embalagem", marca: "", preparo: "", fonte: "Rótulo",
  baseGramas: 100, porcaoNome: "100 g", nutrientes: item.nutrientesBase,
};
function ambiente(storage = armazenamento()) {
  const online = { onLine: false };
  const db = Object.fromEntries(["days", "templates", "goals", "preferences", "foods"].map((name) => [`nutrition_${name}`, []]));
  const state = { user: "u1", writes: 0, missing: false, lose: false, after: null };
  const receipts = new Map();
  const table = { day: "nutrition_days", template: "nutrition_templates", goal: "nutrition_goals", preferences: "nutrition_preferences", food: "nutrition_foods" };
  const backend = {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: state.user } }, error: null }) },
      from(name) {
        const filters = []; let start = 0, end = Infinity;
        const q = {
          select() { return q; },
          eq(key, value) { filters.push((row) => row[key] === value); return q; },
          gte(key, value) { filters.push((row) => row[key] >= value); return q; },
          lte(key, value) { filters.push((row) => row[key] <= value); return q; },
          in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
          order() { return q; },
          ilike(key, value) { const term = value.replace(/^%|%$/g, "").toLowerCase(); filters.push((row) => row[key].toLowerCase().includes(term)); return q; },
          range(a, b) { start = a; end = b; return q; },
          then(resolve, reject) {
            return Promise.resolve().then(() => state.missing
              ? { data: null, error: { code: "42P01", message: `${name} does not exist` } }
              : { data: clone(db[name].filter((row) => (!row.user_id || row.user_id === state.user) && filters.every((f) => f(row))).slice(start, end + 1)), error: null }).then(resolve, reject);
          },
        };
        return q;
      },
      async rpc(name, args) {
        assert.equal(name, "nutrition_save_document");
        if (state.missing) return { data: null, error: { code: "PGRST202", message: "Could not find nutrition_save_document" } };
        const { p_type: type, p_document: doc, p_id: id, p_expected_revision: expected, p_operation_id: op } = args;
        if (doc.usuarioId && doc.usuarioId !== state.user) return { data: null, error: { code: "42501", message: "Outra conta" } };
        if (receipts.has(op)) return { data: clone(receipts.get(op)), error: null };
        const rows = db[table[type]];
        let row = rows.find((row) => row.user_id === state.user && (type === "day" ? row.local_date === doc.data : row.id === id));
        if ((row && (row.id !== id || row.revision !== expected)) || (!row && expected !== 0))
          return { data: { status: "conflict", id: row?.id ?? id, revision: row?.revision ?? 0, document: clone(row?.document ?? null) }, error: null };
        if (!row) {
          row = { id, user_id: state.user, revision: 0, local_date: doc.data, name: doc.nome };
          rows.push(row);
        }
        Object.assign(row, { document: clone(doc), revision: row.revision + 1, operation_id: op });
        state.writes += 1;
        const result = { status: "ok", id: row.id, revision: row.revision };
        receipts.set(op, result);
        if (state.after) { const after = state.after; state.after = null; await after(); }
        if (state.lose) { state.lose = false; return { data: null, error: { code: "NETWORK", message: "Resposta perdida" } }; }
        return { data: result, error: null };
      },
    },
  };
  const repo = carregar("servicos/nutricaoRepositorio.ts", {
    "@react-native-async-storage/async-storage": storage,
    "../supabase": backend,
    "./revisaoDados": { registrarMudancaDeDados() {} },
  }, { navigator: online });
  return { repo, storage, db, state, online, receipts };
}

(async () => {
  // Exclusões são snapshots completos: uma confirmação antiga não ressuscita o item.
  let a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  await a.repo.salvarDiaNutricao(dia("d1", []));
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).pendencias, 2);
  a.online.onLine = true;
  a.state.lose = true;
  assert.match((await a.repo.sincronizarNutricao("u1")).erro, /Resposta perdida/);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).dias[0].refeicoes[0].itens.length, 0);
  assert.equal((await a.repo.sincronizarNutricao("u1")).pendencias, 0);
  assert.equal(a.db.nutrition_days.length, 1);
  assert.equal(a.db.nutrition_days[0].document.refeicoes[0].itens.length, 0);
  assert.equal(a.state.writes, 2, "Recibo não repete o primeiro INSERT após resposta perdida");

  // Recarregar o módulo/aparelho continua a mesma fila sem trocar IDs/operações.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  const recarregado = ambiente(a.storage);
  recarregado.online.onLine = true;
  assert.equal((await recarregado.repo.sincronizarNutricao("u1")).pendencias, 0);
  assert.equal(recarregado.db.nutrition_days[0].id, "d1");

  // Uma edição salva enquanto a resposta anterior está em voo é enviada depois dela.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  let soltar, comecou;
  const iniciou = new Promise((resolve) => { comecou = resolve; });
  const travada = new Promise((resolve) => { soltar = resolve; });
  a.state.after = async () => { comecou(); await travada; };
  a.online.onLine = true;
  const envio = a.repo.sincronizarNutricao("u1");
  await iniciou;
  await a.repo.salvarDiaNutricao(dia("d1", [{ ...item, gramas: 150 }]));
  soltar();
  assert.equal((await envio).pendencias, 0);
  assert.equal(a.db.nutrition_days[0].document.refeicoes[0].itens[0].gramas, 150);
  assert.equal(a.db.nutrition_days[0].revision, 2);

  // Leitura remota não sobrescreve uma edição offline e CAS não atropela outro aparelho.
  a = ambiente();
  a.db.nutrition_days.push({ id: "d1", user_id: "u1", local_date: inicio, document: dia(), revision: 1 });
  a.online.onLine = true;
  await a.repo.carregarEstadoNutricao("u1", inicio, inicio);
  a.online.onLine = false;
  await a.repo.salvarDiaNutricao(dia("d1", [{ ...item, gramas: 125 }]));
  a.db.nutrition_days[0].revision = 2;
  a.db.nutrition_days[0].document = dia("d1", [{ ...item, gramas: 175 }]);
  a.online.onLine = true;
  const antes = await a.repo.carregarEstadoNutricao("u1");
  assert.equal(antes.dias[0].refeicoes[0].itens[0].gramas, 125);
  assert.match((await a.repo.sincronizarNutricao("u1")).erro, /outro aparelho/);
  let estado = await a.repo.lerEstadoNutricaoLocal("u1");
  assert.equal(estado.conflitos.length, 1);
  assert.equal(estado.conflitos[0].remoto.refeicoes[0].itens[0].gramas, 175);
  await a.repo.resolverConflitoNutricao("u1", `day:${inicio}`, "local");
  assert.equal(a.db.nutrition_days[0].document.refeicoes[0].itens[0].gramas, 125);
  assert.equal((await a.repo.listarCopiasConflitosNutricao("u1")).length, 2);

  // Dois dispositivos criam a mesma data: usa a identidade canônica, nunca dois dias.
  a = ambiente();
  a.db.nutrition_days.push({ id: "remoto", user_id: "u1", local_date: inicio, document: dia("remoto"), revision: 1 });
  await a.repo.salvarDiaNutricao(dia("local", [{ ...item, gramas: 80 }]));
  a.online.onLine = true;
  await a.repo.sincronizarNutricao("u1");
  await a.repo.resolverConflitoNutricao("u1", `day:${inicio}`, "local");
  assert.equal(a.db.nutrition_days.length, 1);
  assert.equal(a.db.nutrition_days[0].document.id, "remoto");
  assert.equal(a.db.nutrition_days[0].document.refeicoes[0].itens[0].gramas, 80);

  // Escolher remoto arquiva a dieta local em vez de perdê-la.
  a = ambiente();
  a.db.nutrition_days.push({ id: "r", user_id: "u1", local_date: inicio, document: dia("r"), revision: 1 });
  await a.repo.salvarDiaNutricao(dia("l", []));
  a.online.onLine = true;
  await a.repo.sincronizarNutricao("u1");
  await a.repo.resolverConflitoNutricao("u1", `day:${inicio}`, "remoto");
  estado = await a.repo.lerEstadoNutricaoLocal("u1");
  assert.equal(estado.pendencias, 0);
  assert.equal(estado.dias[0].id, "r");
  assert.equal((await a.repo.listarCopiasConflitosNutricao("u1"))[0].documento.refeicoes[0].itens.length, 0);

  // Trocar de conta não envia dados privados da conta anterior.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  a.state.user = "u2";
  a.online.onLine = true;
  assert.match((await a.repo.sincronizarNutricao("u1")).erro, /mesma conta/);
  assert.equal(a.state.writes, 0);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u2")).dias.length, 0);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).pendencias, 1);

  // Instalação sem SQL mantém o cadastro manual e explica a ação necessária.
  a = ambiente();
  await a.repo.salvarAlimentoNutricao(food);
  a.online.onLine = true;
  a.state.missing = true;
  assert.match((await a.repo.sincronizarNutricao("u1")).erro, /202610280001_nutricao.sql/);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).alimentosLocais.length, 1);
  const busca = await a.repo.buscarAlimentosNutricao("u1", "embalagem");
  assert.equal(busca.alimentos[0].id, "f1");
  assert.match(busca.erro, /salva neste aparelho/);

  // Catálogo global é somente leitura, resultados pesquisados continuam disponíveis offline.
  a = ambiente();
  a.db.nutrition_foods.push({ id: "publico", user_id: null, name: "Arroz", document: { ...food, id: "publico", usuarioId: null, nome: "Arroz" }, revision: 1 });
  a.online.onLine = true;
  assert.equal((await a.repo.buscarAlimentosNutricao("u1", "Arroz")).alimentos.length, 1);
  a.online.onLine = false;
  assert.equal((await a.repo.buscarAlimentosNutricao("u1", "Arroz")).alimentos[0].id, "publico");
  await assert.rejects(a.repo.salvarAlimentoNutricao({ ...food, usuarioId: null }), /catálogo público/);

  // Uma operação antiga reconhecida não libera uma edição nova sobre revisão externa.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  await a.repo.salvarDiaNutricao(dia("d1", [{ ...item, gramas: 150 }]));
  a.online.onLine = true;
  a.state.lose = true;
  await a.repo.sincronizarNutricao("u1");
  a.db.nutrition_days[0].revision = 2;
  a.db.nutrition_days[0].document = dia("d1", [{ ...item, gramas: 300 }]);
  await a.repo.sincronizarNutricao("u1");
  assert.equal(a.db.nutrition_days[0].document.refeicoes[0].itens[0].gramas, 300);
  estado = await a.repo.lerEstadoNutricaoLocal("u1");
  assert.equal(estado.dias[0].refeicoes[0].itens[0].gramas, 150);
  assert.equal(estado.conflitos.length, 1);
  assert.equal(a.state.writes, 1);

  // Corrupção local deve interromper a operação, preservando literalmente o arquivo.
  a = ambiente();
  const storageKey = "@treino-familia:nutricao:v1:u1";
  a.storage.dados.set(storageKey, "{arquivo-corrompido");
  await assert.rejects(a.repo.salvarDiaNutricao(dia()), /JSON|position|property|Expected/i);
  assert.equal(a.storage.dados.get(storageKey), "{arquivo-corrompido");
  assert.equal(a.state.writes, 0);

  // Disco cheio não informa sucesso nem apaga a última versão persistida.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  const preservado = a.storage.dados.get(storageKey);
  let gravarOriginal = a.storage.default.setItem;
  a.storage.default.setItem = async () => { throw new Error("Disco cheio"); };
  await assert.rejects(a.repo.salvarDiaNutricao(dia("d1", [])), /Disco cheio/);
  assert.equal(a.storage.dados.get(storageKey), preservado);
  a.storage.default.setItem = gravarOriginal;
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).dias[0].refeicoes[0].itens.length, 1);

  // Se o disco falhar após o servidor gravar, a fila antiga retoma pelo recibo.
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia());
  gravarOriginal = a.storage.default.setItem;
  a.state.after = async () => { a.storage.default.setItem = async () => { throw new Error("Disco cheio após envio"); }; };
  a.online.onLine = true;
  await assert.rejects(a.repo.sincronizarNutricao("u1"), /Disco cheio após envio/);
  a.storage.default.setItem = gravarOriginal;
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).pendencias, 1);
  assert.equal((await a.repo.sincronizarNutricao("u1")).pendencias, 0);
  assert.equal(a.state.writes, 1);

  // JSON não pode converter NaN/Infinity para null e aceitar um alimento inválido.
  a = ambiente();
  await assert.rejects(a.repo.salvarAlimentoNutricao({ ...food, nutrientes: { ...food.nutrientes, kcal: Number.NaN } }), /valores nutricionais/);
  await assert.rejects(a.repo.salvarDiaNutricao(dia("d1", [{ ...item, gramas: Number.POSITIVE_INFINITY }])), /quantidades/);
  await assert.rejects(a.repo.salvarDiaNutricao({ ...dia(), data: "2026-02-30" }), /data/);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).pendencias, 0);
  a = ambiente();
  await a.repo.salvarDiaNutricao(dia("diario-real", [{ ...item, gramas: 160 }]));
  await assert.rejects(a.repo.salvarDiaNutricao(dia("preview-antigo", [])), /diário neste aparelho/);
  assert.equal((await a.repo.lerEstadoNutricaoLocal("u1")).dias[0].refeicoes[0].itens[0].gramas, 160);
  console.log("OK — nutrição local-first, reenvio idempotente, exclusão, edição durante envio, CAS, cópias, contas e migração ausente");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
