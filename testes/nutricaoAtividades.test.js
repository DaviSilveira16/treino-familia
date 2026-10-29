const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
process.env.TZ = "America/Sao_Paulo";
const calculos = carregar("servicos/nutricaoCalculos.ts");
const inicio = "2026-10-26", fim = "2026-11-01";
const comeco = "2026-10-26T12:00:00Z", termino = "2026-10-26T12:40:00Z";
const sessao = (id, extras = {}) => ({ id, user_id: "u1", started_at: comeco, finished_at: termino, status: "concluido", active_calories: 200, duration_minutes: 40, ...extras });
const rascunho = (id, extras = {}) => ({ usuarioId: "u1", planName: "Meu treino", sessao: { id, started_at: comeco }, finalizacao: { metricas: { active_calories: 150, duration_minutes: 30 } }, ...extras });

function ambiente() {
  const storage = armazenamento();
  const estado = {
    user: "u1", sessionUser: "u1", authError: null, sessionError: null,
    queryError: null, localError: null, beforeQuery: null, beforeLocal: null,
    db: { workout_sessions: [], cardio_sessions: [] }, rascunhos: [], exclusoes: [],
    queries: [], ranges: [], reads: [], writes: [], localReads: [], failWrite: false,
  };
  const get = storage.default.getItem, set = storage.default.setItem;
  storage.default.getItem = async (key) => { estado.reads.push(key); return get(key); };
  storage.default.setItem = async (key, value) => { estado.writes.push(key); if (estado.failWrite) throw new Error("Disco cheio"); return set(key, value); };
  function from(table) {
    const filters = [], orders = [];
    let start = 0, end = Infinity, fields = "";
    const query = {
      select(value) { fields = value; return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); estado.queries.push({ table, op: "gte", key, value }); return query; },
      lt(key, value) { filters.push((row) => row[key] < value); estado.queries.push({ table, op: "lt", key, value }); return query; },
      order(key) { orders.push(key); return query; },
      range(de, ate) { start = de; end = ate; estado.ranges.push({ table, de, ate }); return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          estado.queries.push({ table, fields });
          estado.beforeQuery?.(table);
          if (estado.queryError === true || estado.queryError === table)
            return { data: null, error: { message: "Sem conexão com o servidor" } };
          const rows = estado.db[table].filter((row) => filters.every((filter) => filter(row)))
            .sort((a, b) => { for (const key of orders) { const delta = String(a[key]).localeCompare(String(b[key])); if (delta) return delta; } return 0; })
            .slice(start, end + 1);
          return { data: rows, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  const backend = {
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: estado.user ? { id: estado.user } : null }, error: estado.authError }),
        getSession: async () => ({ data: { session: estado.sessionUser ? { user: { id: estado.sessionUser } } : null }, error: estado.sessionError }),
      }, from,
    },
  };
  const local = {
    listarRascunhos: async (usuarioId) => { estado.localReads.push(usuarioId); estado.beforeLocal?.(); if (estado.localError) throw estado.localError; return estado.rascunhos; },
    lerExclusaoTreino: async (usuarioId, sessaoId) => { estado.localReads.push(usuarioId); if (estado.localError) throw estado.localError; return estado.exclusoes.find((exclusao) => exclusao.sessaoId === sessaoId) ?? null; },
  };
  const atividades = carregar("servicos/nutricaoAtividades.ts", {
    "@react-native-async-storage/async-storage": storage,
    "../supabase": backend,
    "./treinoLocal": local,
    "./nutricaoCalculos": calculos,
  });
  return { estado, storage, carregar: (de = inicio, ate = fim, usuarioId = "u1") => atividades.carregarAtividadesNutricao(usuarioId, de, ate) };
}

(async () => {
  let a = ambiente();
  a.estado.db.workout_sessions = [
    sessao("normal"), sessao("normal"),
    sessao("legado", { status: null, active_calories: null }),
    sessao("sem-fim", { finished_at: null }),
    sessao("cancelado", { status: "cancelado" }),
    sessao("em-andamento", { status: "em_andamento" }),
    sessao("outra-conta", { user_id: "u2" }),
    sessao("vira-dia", { started_at: "2026-10-27T02:30:00Z" }),
    sessao("antes-do-periodo", { started_at: "2026-10-26T02:59:00Z" }),
    sessao("depois-do-periodo", { started_at: "2026-11-02T03:00:00Z" }),
    sessao("mesmo-id"),
  ];
  a.estado.db.cardio_sessions = [
    sessao("bruto", { activity_name: "Cardio legado", active_calories: null, calories: 999 }),
    sessao("decimal", { activity_name: "Caminhada", active_calories: "40.6", duration_minutes: "12.5" }),
    sessao("invalido", { active_calories: -2, duration_minutes: -10 }),
    sessao("mesmo-id", { active_calories: 80 }),
  ];
  a.estado.rascunhos = [
    rascunho("normal", { finalizacao: { metricas: { active_calories: 9999, duration_minutes: 999 } } }),
    rascunho("pendente"), rascunho("pendente"),
    rascunho("sem-finalizacao", { finalizacao: undefined }),
    rascunho("excluida", { exclusaoSolicitada: true }),
    rascunho("conflito", { conflitoSessao: true }),
    rascunho("tombstone"),
    rascunho("de-outro-usuario", { usuarioId: "u2" }),
    rascunho("fora", { sessao: { id: "fora", started_at: "2026-11-03T12:00:00Z" } }),
  ];
  a.estado.exclusoes = [{ sessaoId: "tombstone", estado: "solicitada" }, { sessaoId: "mesmo-id", estado: "confirmada" }];
  let resultado = await a.carregar();
  assert.equal(resultado.erro, null);
  assert.equal(resultado.desatualizado, false);
  const porId = new Map(resultado.atividades.map((item) => [`${item.tipo}:${item.id}`, item]));
  assert.equal(porId.size, 8);
  assert.equal(porId.get("musculacao:normal").caloriasAtivas, 200, "Registro remoto confirma e substitui o rascunho duplicado");
  assert.equal(porId.get("musculacao:normal").pendente, false);
  assert.equal(porId.get("musculacao:legado").caloriasAtivas, null);
  assert.equal(porId.get("musculacao:vira-dia").data, "2026-10-26", "Data UTC perto da meia-noite usa o calendário local");
  assert.equal(porId.get("musculacao:pendente").pendente, true);
  assert.equal(porId.get("cardio:bruto").caloriasAtivas, null, "Gasto bruto legado nunca vira calorias ativas");
  assert.equal(porId.get("cardio:decimal").caloriasAtivas, 40.6);
  assert.equal(porId.get("cardio:decimal").minutos, 12.5);
  assert.equal(porId.get("cardio:invalido").caloriasAtivas, null);
  assert.equal(porId.get("cardio:invalido").minutos, 0);
  assert.equal(porId.has("musculacao:mesmo-id"), false);
  assert.equal(porId.has("cardio:mesmo-id"), true, "Tombstone de musculação não apaga um cardio com o mesmo UUID");
  const contadores = calculos.analisarDia(null, resultado.atividades, inicio, fim);
  assert.equal(contadores.musculacao, 4);
  assert.equal(contadores.cardio, 4);
  assert.equal(contadores.sessoes, 8, "Contadores representam sessões, não calorias ou modelos");
  for (const id of ["sem-fim", "cancelado", "em-andamento", "outra-conta", "antes-do-periodo", "depois-do-periodo", "excluida", "conflito", "tombstone", "de-outro-usuario", "fora"])
    assert.equal(porId.has(`musculacao:${id}`), false, id);
  assert.ok(a.estado.queries.some((query) => query.op === "gte" && query.value === "2026-10-26T03:00:00.000Z"));
  assert.ok(a.estado.queries.some((query) => query.op === "lt" && query.value === "2026-11-02T03:00:00.000Z"));
  assert.ok(a.estado.queries.filter((query) => query.fields).every((query) => !/(?:^|,\s*)calories(?:,|$)/.test(query.fields)), "Consulta não busca calories legado como fallback");

  a = ambiente();
  a.estado.db.workout_sessions = Array.from({ length: 501 }, (_, indice) => sessao(`p${String(indice).padStart(3, "0")}`, { active_calories: 1, duration_minutes: 1 }));
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 501, "Paginação não perde sessões além de 500");
  assert.ok(a.estado.ranges.some((range) => range.table === "workout_sessions" && range.de === 500 && range.ate === 999));
  assert.equal(resultado.atividades.reduce((total, item) => total + item.caloriasAtivas, 0), 501);

  a = ambiente();
  a.estado.db.workout_sessions = [sessao("cache")];
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 1);
  a.estado.queryError = true;
  resultado = await a.carregar();
  assert.equal(resultado.atividades[0].id, "cache");
  assert.equal(resultado.desatualizado, true);
  assert.match(resultado.erro, /Sem conexão/);
  a.estado.authError = { message: "Validação online indisponível" };
  const consultasAntes = a.estado.queries.length;
  resultado = await a.carregar("2026-10-26", "2026-10-26");
  assert.equal(resultado.atividades[0].id, "cache", "Cache semanal também atende ao dia individual offline");
  assert.equal(resultado.desatualizado, true);
  assert.equal(a.estado.queries.length, consultasAntes, "Identidade local válida permite cache, sem fingir validação remota");
  a.estado.authError = null;
  a.estado.queryError = null;
  a.estado.db.workout_sessions = [];
  await a.carregar("2026-10-26", "2026-10-26");
  a.estado.queryError = true;
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0, "Consulta diária nova corrige o cache semanal antigo inclusive por vazio");
  a.estado.queryError = null;
  resultado = await a.carregar();
  assert.equal(resultado.erro, null);
  assert.equal(resultado.atividades.length, 0, "Retry bem-sucedido substitui o cache antigo inclusive por vazio");
  a.estado.queryError = true;
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0);

  a = ambiente();
  a.estado.db.workout_sessions = [sessao("fresco")];
  a.estado.failWrite = true;
  resultado = await a.carregar();
  assert.equal(resultado.erro, null, "Falha de cache não descarta consulta remota confirmada");
  assert.equal(resultado.atividades[0].id, "fresco");
  a.estado.localError = new Error("Não foi possível ler exclusões locais");
  resultado = await a.carregar();
  assert.match(resultado.erro, /exclusões locais/);
  assert.equal(resultado.desatualizado, true, "Falha ao conferir tombstones força balanço incompleto na UI");

  a = ambiente();
  a.estado.db.workout_sessions = [sessao("apagado")];
  a.estado.db.cardio_sessions = [sessao("apagado", { active_calories: 60 })];
  await a.carregar();
  a.estado.queryError = true;
  a.estado.exclusoes = [{ sessaoId: "apagado", estado: "confirmada" }];
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 1, "Tombstone confirmado continua protegendo contra cache antigo offline");
  assert.equal(resultado.atividades[0].tipo, "cardio");

  a = ambiente();
  a.estado.db.workout_sessions = [sessao("privado")];
  await a.carregar();
  const leituras = a.estado.reads.length, locais = a.estado.localReads.length, queries = a.estado.queries.length;
  a.estado.user = "u2";
  a.estado.sessionUser = "u2";
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0);
  assert.equal(resultado.desatualizado, true);
  assert.equal(a.estado.reads.length, leituras, "Conta confirmada diferente não lê o cache do usuário anterior");
  assert.equal(a.estado.localReads.length, locais, "Conta confirmada diferente não lê rascunhos antigos");
  assert.equal(a.estado.queries.length, queries);
  a.estado.authError = { message: "Offline" };
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0, "Offline não autoriza cache de uma conta diferente da sessão local");
  assert.equal(a.estado.reads.length, leituras);
  a.estado.authError = null;
  a.estado.user = null;
  a.estado.sessionUser = "u1";
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0, "Logout confirmado prevalece sobre uma sessão local antiga");
  assert.equal(a.estado.reads.length, leituras);

  a = ambiente();
  a.estado.db.workout_sessions = [sessao("resposta-atrasada")];
  a.estado.beforeQuery = () => { a.estado.user = "u2"; a.estado.sessionUser = "u2"; };
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0, "Troca de conta durante a consulta descarta resposta atrasada");
  assert.equal(a.estado.writes.length, 0);
  assert.equal(a.estado.localReads.length, 0);
  a = ambiente();
  a.estado.rascunhos = [rascunho("privado-local")];
  a.estado.beforeLocal = () => { a.estado.user = "u2"; a.estado.sessionUser = "u2"; };
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0, "Troca de conta durante leitura local também descarta os dados");
  a = ambiente();
  a.estado.queryError = true;
  a.storage.dados.set(`@treino-familia:nutricao:atividades:v1:u1:${inicio}:${fim}`, "{invalid");
  resultado = await a.carregar();
  assert.equal(resultado.atividades.length, 0);
  assert.ok(resultado.erro);
  assert.equal((await a.carregar("2026-02-30", fim)).atividades.length, 0);
  assert.equal((await a.carregar(fim, inicio)).atividades.length, 0);

  console.log("OK — atividades nutricionais: conclusão real, calorias ativas, datas locais, paginação, fila, tombstones, cache e isolamento da conta");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
