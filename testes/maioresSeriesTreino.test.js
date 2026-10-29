const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");

const set = (numero, peso, reps = 8, exercise_id = "e1") => ({ exercise_id, set_number: numero, weight_kg: peso, reps });
const sessao = (id, data, series, extras = {}) => ({ id, user_id: "u1", started_at: data, finished_at: data, status: "concluido", workout_sets: series, ...extras });
function ambiente() {
  const storage = armazenamento();
  const estado = { usuario: "u1", autenticado: "u1", erroAuth: false, erroConsulta: false, antesConsulta: null, sessoes: [], exclusoes: [], consultas: [], cacheLido: [], falharCache: false };
  const get = storage.default.getItem, write = storage.default.setItem;
  storage.default.getItem = async (key) => { estado.cacheLido.push(key); return get(key); };
  storage.default.setItem = async (key, value) => { if (estado.falharCache) throw new Error("Disco cheio"); await write(key, value); };
  const navigator = { onLine: true };
  const backend = { supabase: {
    auth: {
      getSession: async () => ({ data: { session: estado.usuario ? { user: { id: estado.usuario } } : null }, error: null }),
      getUser: async () => ({ data: { user: estado.autenticado ? { id: estado.autenticado } : null }, error: estado.erroAuth ? new Error("Sem rede") : null }),
    },
    from(tabela) {
      assert.equal(tabela, "workout_sessions");
      const filtros = [], ordens = [];
      let de = 0, ate = Infinity;
      const consulta = {
        select(campos) { assert.ok(campos.includes("finished_at")); assert.ok(campos.includes("workout_sets!inner")); return consulta; },
        eq(campo, valor) { filtros.push((row) => campo === "workout_sets.exercise_id" ? row.workout_sets.some((s) => s.exercise_id === valor) : row[campo] === valor); return consulta; },
        order(campo) { ordens.push(campo); return consulta; },
        range(inicio, fim) { de = inicio; ate = fim; return consulta; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            estado.consultas.push({ de, ate });
            estado.antesConsulta?.();
            if (estado.erroConsulta) return { data: null, error: new Error("Sem rede") };
            const rows = estado.sessoes.filter((s) => filtros.every((f) => f(s))).sort((a, b) => {
              for (const campo of ordens) { const resultado = String(b[campo]).localeCompare(String(a[campo])); if (resultado) return resultado; }
              return 0;
            }).slice(de, ate + 1);
            return { data: rows, error: null };
          }).then(resolve, reject);
        },
      };
      return consulta;
    },
  } };
  const api = carregar("servicos/maioresSeriesTreino.ts", {
    "@react-native-async-storage/async-storage": storage,
    "../supabase": backend,
    "./treinoLocal": { lerExclusaoTreino: async (usuarioId, id) => { assert.equal(usuarioId, "u1"); return estado.exclusoes.includes(id) ? { sessaoId: id } : null; } },
  }, { navigator });
  return { estado, storage, navigator, api };
}

(async () => {
  let a = ambiente();
  const antigo = "2026-10-20T12:00:00Z", recente = "2026-10-25T12:00:00Z";
  a.estado.sessoes = [
    sessao("antigo", antigo, [set(1, 50, 6), set(2, 30, 9), set(3, 55, 5)]),
    sessao("recente", recente, [set(1, 40, 12), set(2, 45, 7), set(3, 55, 8)]),
    sessao("outro-exercicio", recente, [set(1, 999, 10, "e2")]),
    sessao("outro-usuario", recente, [set(1, 1000)], { user_id: "u2" }),
    sessao("cancelado", recente, [set(1, 1500)], { status: "cancelado" }),
    sessao("incompleta", recente, [set(1, 1500)], { finished_at: null }),
    sessao("aberta", recente, [set(1, 1500)], { status: "em_andamento" }),
    sessao("invalida", recente, [set(1, NaN), set(2, -1), set(3, 10000), set(4, 10, 1.5), set(21, 20), set(5, 0, 0)]),
  ];
  const copia = JSON.stringify(a.estado.sessoes);
  const resultado = await a.api.carregarMaioresSeries("u1", ["e1", "e1"]);
  assert.equal(a.estado.consultas.length, 1, "IDs repetidos não repetem consultas");
  assert.equal(resultado.e1.series.length, 3);
  assert.deepEqual([...resultado.e1.series.map((s) => s.weight_kg)], [50, 45, 55]);
  assert.deepEqual([...resultado.e1.series.map((s) => s.reps)], [6, 7, 8], "Repetições vêm da série do peso vencedor, sem inventar máximos");
  assert.deepEqual([...resultado.e1.series.map((s) => s.sessaoId)], ["antigo", "recente", "recente"], "Cada série pode vir de uma sessão diferente; empate usa data mais recente");
  assert.equal(resultado.e1.desatualizado, false);
  assert.equal(JSON.stringify(a.estado.sessoes), copia, "Consulta não modifica o histórico");

  a.navigator.onLine = false;
  a.estado.erroAuth = true;
  a.estado.exclusoes = ["antigo"];
  const offline = await a.api.carregarMaioresSeries("u1", ["e1"]);
  assert.equal(offline.e1.desatualizado, true);
  assert.equal(offline.e1.series[0].weight_kg, 40, "Sessão excluída não retorna pelo cache; usa a próxima candidata válida");
  a.estado.exclusoes.push("recente");
  assert.deepEqual(Object.keys(await a.api.carregarMaioresSeries("u1", ["e1"])), [], "Todos os recordes excluídos desaparecem offline");

  const local = carregar("servicos/treinoLocal.ts", { "@react-native-async-storage/async-storage": armazenamento() });
  const abertas = [
    { chave: "a", exercise_id: "e1", set_number: 1, reps: "10", weight_kg: "20", concluida: false },
    { chave: "b", exercise_id: "e1", set_number: 2, reps: "10", weight_kg: "20", concluida: true },
    { chave: "c", exercise_id: "e1", set_number: 3, reps: "10", weight_kg: "20", concluida: false, pendente: "salvar" },
    { chave: "d", exercise_id: "e1", set_number: 4, reps: "10", weight_kg: "20", concluida: false },
    { chave: "e", exercise_id: "e2", set_number: 1, reps: "10", weight_kg: "20", concluida: false },
  ];
  const copiadas = local.copiarSeriesAnteriores(abertas, resultado.e1.series, "e1");
  assert.equal(copiadas[0].weight_kg, "50");
  assert.equal(copiadas[0].reps, "6");
  for (let i = 1; i < abertas.length; i++) assert.equal(copiadas[i], abertas[i], "Concluídas, pendentes, sem recorde e outro exercício são preservados");

  a = ambiente();
  a.estado.sessoes = Array.from({ length: 201 }, (_, i) => sessao(`s${i}`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), [set(1, i === 0 ? 150 : 20)]));
  assert.equal((await a.api.carregarMaioresSeries("u1", ["e1"])).e1.series[0].weight_kg, 150, "Recorde antigo após a primeira página entra no total histórico");
  assert.equal(a.estado.consultas.length, 2);
  assert.equal(a.estado.consultas[1].de, 200);
  a.estado.erroConsulta = true;
  assert.equal((await a.api.carregarMaioresSeries("u1", ["e1"])).e1.desatualizado, true, "Falha de rede usa cache da conta com indicação");
  a.estado.usuario = "u2";
  const leituras = a.estado.cacheLido.length;
  await assert.rejects(a.api.carregarMaioresSeries("u1", ["e1"]), /conta ativa mudou/);
  assert.equal(a.estado.cacheLido.length, leituras, "Conta diferente não lê cache anterior");

  a = ambiente();
  a.estado.sessoes = [sessao("privado", antigo, [set(1, 50)])];
  a.estado.antesConsulta = () => { a.estado.usuario = "u2"; };
  await assert.rejects(a.api.carregarMaioresSeries("u1", ["e1"]), /conta ativa mudou/);
  assert.equal(a.storage.dados.size, 0, "Resposta atrasada de outra conta não grava cache");
  a = ambiente();
  a.estado.autenticado = "u2";
  await assert.rejects(a.api.carregarMaioresSeries("u1", ["e1"]), /conta ativa mudou/);
  a = ambiente();
  a.navigator.onLine = false;
  await assert.rejects(a.api.carregarMaioresSeries("u1", ["e1"]), /primeira vez/);
  a = ambiente();
  a.estado.falharCache = true;
  a.estado.sessoes = [sessao("ok", antigo, [set(1, "42.5", 7)])];
  assert.equal((await a.api.carregarMaioresSeries("u1", ["e1"])).e1.series[0].weight_kg, 42.5, "Falha de cache não invalida resultado remoto e decimais são mantidos");

  console.log("OK — maiores cargas por número de série: datas/repetições reais, paginação, cópia segura, cache offline, exclusões e isolamento da conta");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
