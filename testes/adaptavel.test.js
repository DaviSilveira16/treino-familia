const assert = require("node:assert/strict");
const { carregar, armazenamento } = require("./suporte.cjs");
const storage = armazenamento();
const local = carregar("servicos/treinoLocal.ts", {
  "@react-native-async-storage/async-storage": storage,
});
const adaptar = carregar("servicos/treinoAdaptavel.ts", {
  "./treinoLocal": local,
});
const metabolismo = carregar("servicos/metabolismo.ts");
const calorias = carregar("servicos/caloriasTreino.ts", {
  "./metabolismo": metabolismo,
});
const perfil = { pesoKg: 80, alturaCm: 175, idade: 30, sexo: "masculino" };
const db = {
  workout_plans: [{ id: "p1", user_id: "u1", name: "Original" }],
  exercises: [
    {
      id: "e1",
      user_id: "u1",
      plan_id: "p1",
      name: "Original",
      sets_goal: 1,
      reps_goal: "10",
      position: 0,
    },
  ],
  exercise_load_defaults: [
    {
      user_id: "u1",
      exercise_id: "e1",
      set_number: 1,
      reps: 10,
      weight_kg: 99,
    },
  ],
  workout_sessions: [],
  workout_sets: [],
};
const faults = new Map();
function query(table) {
  const filters = [];
  let action = "select",
    value,
    single = false,
    ordering,
    max = Infinity;
  const q = {
    select() {
      return q;
    },
    eq(k, v) {
      filters.push((r) => r[k] === v);
      return q;
    },
    is(k, v) {
      filters.push((r) => r[k] === v);
      return q;
    },
    gte(k, v) {
      filters.push((r) => r[k] >= v);
      return q;
    },
    lt(k, v) {
      filters.push((r) => r[k] < v);
      return q;
    },
    limit(n) {
      max = n;
      return q;
    },
    order(k, opts) {
      ordering = [k, opts.ascending];
      return q;
    },
    maybeSingle() {
      single = true;
      return q;
    },
    single() {
      single = true;
      return q;
    },
    insert(v) {
      action = "insert";
      value = v;
      return q;
    },
    update(v) {
      action = "update";
      value = v;
      return q;
    },
    delete() {
      action = "delete";
      return q;
    },
    then(resolve, reject) {
      return Promise.resolve()
        .then(() => {
          let rows = db[table].filter((r) => filters.every((f) => f(r)));
          if (ordering)
            rows.sort(
              (a, b) =>
                (a[ordering[0]] > b[ordering[0]] ? 1 : -1) *
                (ordering[1] ? 1 : -1),
            );
          rows = rows.slice(0, max);
          if (action === "insert") {
            const added = Array.isArray(value) ? value : [value];
            for (const row of added) {
              if (row.id && db[table].some((r) => r.id === row.id))
                throw Error("ID duplicado");
              db[table].push({ ...row });
            }
            rows = db[table].slice(-added.length);
          }
          if (action === "update") rows.forEach((r) => Object.assign(r, value));
          if (action === "delete")
            db[table] = db[table].filter((r) => !rows.includes(r));
          const key = `${table}:${action}`;
          if (faults.get(key)) {
            faults.delete(key);
            return {
              data: null,
              error: new Error("Resposta perdida depois de aplicar " + key),
            };
          }
          return { data: single ? (rows[0] ?? null) : rows, error: null };
        })
        .then(resolve, reject);
    },
  };
  return q;
}
const supabase = {
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
    },
    from: query,
  },
};
const modelos = carregar("servicos/salvarModeloTreino.ts", {
  "../supabase": supabase,
});
const sync = carregar("servicos/treinoSincronizacao.ts", {
  "./performance": { medir: (_operacao, executar) => executar() },
  "./tempoFinalizacao": { registrarTempoFinalizacao: async () => {} },
  "../supabase": supabase,
  "./treinoLocal": local,
  "./salvarModeloTreino": modelos,
  "./revisaoDados": { registrarMudancaDeDados() {} },
});
const manual = carregar("servicos/registroTreinoManual.ts", {
  "./treinoLocal": local,
  "./caloriasTreino": calorias,
  "./treinoSincronizacao": sync,
});
const original = { id: "e1", name: "Original", sets_goal: 1, reps_goal: "10" };
const base = {
  versao: 1,
  usuarioId: "u1",
  planId: "p1",
  planName: "Original",
  sessao: { id: "s1", plan_id: "p1", started_at: "2026-10-10T12:00:00Z" },
  exercicios: [original],
  series: [],
  intensidade: "moderada",
  esforco: "adequado",
  salvoEm: "2026-10-10T12:30:00Z",
};
const fim = "2026-10-10T12:30:00.000Z";
async function concluir() {
  let result;
  for (let i = 0; i < 5; i++) {
    result = await sync.sincronizarRascunho("u1", "p1");
    if (result.concluido || result.conflito) return result;
  }
  return result;
}
(async () => {
  const avulso = adaptar.criarExercicioSessao("Remada viagem", 2, 12, 18.5);
  const vazio = adaptar.criarExercicioSessao("Sem carga", 2, 12, null);
  assert.ok(vazio.series.every((s) => s.weight_kg === ""));
  const protegidas = [
    vazio.series[0],
    { ...vazio.series[1], concluida: true },
    { ...vazio.series[1], pendente: "salvar" },
    { ...vazio.series[1], excluida: true },
  ];
  const repetidas = adaptar.repetirCargaNasSeries(
    protegidas,
    vazio.exercicio.id,
    "25",
  );
  assert.equal(repetidas[0].weight_kg, "25");
  assert.ok(
    repetidas.slice(1).every((s, i) => s === protegidas[i + 1]),
    "Não altera séries concluídas, pendentes ou removidas",
  );
  assert.throws(() => adaptar.criarExercicioSessao("", 2, 12, 10));
  assert.throws(() => adaptar.criarExercicioSessao("Teste", 21, 12, 10));
  const serie = {
    ...avulso.series[0],
    concluida: true,
    pendente: "salvar",
    registroId: "set-a",
  };
  const retirada = adaptar.retirarSerie(serie);
  assert.equal(retirada.excluida, true);
  assert.equal(retirada.concluida, false);
  assert.equal(retirada.pendente, "remover");
  const removidaSegunda = { ...avulso.series[1], excluida: true };
  assert.equal(
    adaptar.acrescentarSerie(avulso.exercicio, [serie, removidaSegunda])
      .set_number,
    3,
    "Não reutiliza um número removido",
  );
  const doOriginal = {
    chave: "e1:1",
    exercise_id: "e1",
    exercise_name: "Original",
    set_number: 1,
    reps: "10",
    weight_kg: "20",
    concluida: true,
    registroId: "set-orig",
    pendente: "salvar",
  };
  const exercises = [original, avulso.exercicio],
    sets = [doOriginal, serie, avulso.series[1]];
  const novo = adaptar.prepararModeloTreino(
    "novo",
    "Academia viagem",
    "p1",
    exercises,
    sets,
  );
  const adicionar = adaptar.prepararModeloTreino(
    "adicionar",
    "Original",
    "p1",
    exercises,
    sets,
  );
  assert.equal(adicionar.exercicios.length, 1);
  assert.equal(adicionar.exercicios[0].origemId, avulso.exercicio.id);
  assert.equal(novo.exercicios.length, 2);
  assert.notEqual(novo.planId, "p1");
  assert.equal(
    adaptar.prepararModeloTreino(
      "novo",
      "Sem original",
      "p1",
      [{ ...original, removido: true }, avulso.exercicio],
      sets,
    ).exercicios.length,
    1,
  );
  assert.throws(() =>
    adaptar.prepararModeloTreino("novo", " ", "p1", exercises, sets),
  );
  const metricas = calorias.metricasRegistroTreino(perfil, 30, "moderada", [
    {
      exercise_id: "e1",
      exercise_name: "Original",
      set_number: 1,
      reps: 10,
      weight_kg: 20,
    },
  ]);
  assert.equal(metricas.volume_kg, 200);
  assert.ok(metricas.active_calories > 0);
  assert.equal(metricas.duration_minutes, 30);
  const duracaoDecimal = calorias.metricasRegistroTreino(perfil, 0.6, "moderada", [
    { exercise_name: "A", set_number: 1, reps: 10, weight_kg: 0 },
  ]);
  assert.equal(duracaoDecimal.duration_minutes, 1);
  assert.equal(
    duracaoDecimal.active_calories,
    calorias.metricasRegistroTreino(perfil, 1, "moderada", [
      { exercise_name: "A", set_number: 1, reps: 10, weight_kg: 0 },
    ]).active_calories,
  );
  assert.ok(
    calorias.metricasRegistroTreino(perfil, 30, "intensa", [
      { exercise_name: "A", set_number: 1, reps: 10, weight_kg: 0 },
    ]).active_calories > metricas.active_calories,
  );
  assert.equal(
    calorias.metricasRegistroTreino(null, 30, "leve", [
      { exercise_name: "A", set_number: 1, reps: 10, weight_kg: 0 },
    ]).active_calories,
    null,
  );
  assert.throws(() => calorias.metricasRegistroTreino(perfil, 0, "leve", []));
  db.workout_sessions = [
    {
      ...base.sessao,
      user_id: "u1",
      status: "em_andamento",
      finished_at: null,
    },
  ];
  await local.gravarRascunho({ ...base, exercicios: exercises, series: sets });
  faults.set("workout_sets:insert", true);
  await sync.sincronizarRascunho("u1", "p1");
  await sync.sincronizarRascunho("u1", "p1");
  assert.equal(db.workout_sets.length, 2);
  assert.equal(
    db.workout_sets.find((s) => s.id === "set-a").exercise_id,
    null,
    "Avulso grava snapshot sem alterar o plano",
  );
  await local.atualizarRascunho("u1", "p1", (d) => ({
    ...d,
    finalizacao: { finishedAt: fim, notes: "Teste", metricas, modelo: novo },
  }));
  faults.set("workout_plans:insert", true);
  assert.ok((await sync.sincronizarRascunho("u1", "p1")).erro);
  assert.equal(
    db.workout_sessions[0].status,
    "em_andamento",
    "Não anuncia conclusão antes de guardar o modelo",
  );
  assert.ok(
    await local.lerRascunho("u1", "p1"),
    "Fila permanece durante criação parcial do modelo",
  );
  assert.equal((await concluir()).concluido, true);
  assert.equal(db.workout_plans.length, 2);
  assert.equal(db.exercises.filter((e) => e.plan_id === novo.planId).length, 2);
  assert.equal(db.workout_sessions[0].plan_id, novo.planId);
  assert.equal(db.workout_sessions[0].finished_at, fim);
  assert.equal(db.workout_sessions[0].active_calories, metricas.active_calories);
  assert.equal(db.workout_sessions[0].duration_minutes, metricas.duration_minutes);
  assert.equal(
    db.exercise_load_defaults.find((e) => e.exercise_id === "e1").weight_kg,
    99,
    "Referência original preservada",
  );
  // Uma tela antiga não ressuscita a sessão já confirmada.
  const finishedDraft = {
    ...base,
    exercicios: exercises,
    series: sets.map((s) => ({ ...s, pendente: undefined })),
    finalizacao: { finishedAt: fim, notes: "Teste", metricas, modelo: novo },
  };
  await local.gravarRascunho(finishedDraft);
  assert.equal(await local.lerRascunho("u1", "p1"), null);
  // Snapshot legado (antes da proteção local) ainda reconhece o novo plano e não duplica.
  await storage.default.setItem(
    "@treino-familia:rascunho:v1:u1:p1",
    JSON.stringify(finishedDraft),
  );
  assert.equal((await concluir()).concluido, true);
  assert.equal(db.workout_plans.length, 2);
  // Append-only choice keeps every existing exercise and its reference values.
  db.workout_sessions.push({
    id: "s2",
    user_id: "u1",
    plan_id: "p1",
    started_at: "2026-10-11T12:00:00Z",
    status: "em_andamento",
    finished_at: null,
  });
  const second = {
    ...base,
    sessao: { ...base.sessao, id: "s2" },
    exercicios: exercises,
    series: [{ ...serie, registroId: "set-b" }],
    finalizacao: {
      finishedAt: "2026-10-11T12:30:00Z",
      notes: "Teste",
      metricas,
      modelo: adicionar,
    },
  };
  await local.gravarRascunho(second);
  assert.equal((await concluir()).concluido, true);
  assert.equal(db.exercises.filter((e) => e.plan_id === "p1").length, 2);
  assert.equal(
    db.exercise_load_defaults.find((e) => e.exercise_id === "e1").weight_kg,
    99,
  );
  // Removed custom sets use their stable IDs, not a nullable exercise/name tuple.
  const third = {
    ...base,
    sessao: { ...base.sessao, id: "s3" },
    series: [{ ...serie, registroId: "set-c" }],
  };
  db.workout_sessions.push({
    ...third.sessao,
    user_id: "u1",
    status: "em_andamento",
  });
  await local.gravarRascunho(third);
  await sync.sincronizarRascunho("u1", "p1");
  await local.atualizarRascunho("u1", "p1", (d) => ({
    ...d,
    series: d.series.map((s) => adaptar.retirarSerie(s)),
  }));
  await sync.sincronizarRascunho("u1", "p1");
  assert.equal(
    db.workout_sets.some((s) => s.id === "set-c"),
    false,
  );
  await local.apagarRascunho("u1", "p1");
  db.workout_sessions = db.workout_sessions.filter((s) => s.id !== "s3");
  const registro = manual.montarRegistroManual({
    usuarioId: "u1",
    planId: "p1",
    planName: "Original",
    dia: "2026-10-12",
    duracao: 45,
    intensidade: "moderada",
    esforco: "adequado",
    perfil,
    exercicios: [original],
    series: [doOriginal],
  });
  assert.equal(
    Date.parse(registro.finalizacao.finishedAt) -
      Date.parse(registro.sessao.started_at),
    45 * 60000,
  );
  assert.equal(registro.finalizacao.metricas.sets_completed, 1);
  faults.set("workout_sessions:insert", true);
  await manual.guardarRegistroManual(registro);
  assert.equal((await concluir()).concluido, true);
  assert.equal(
    db.workout_sessions.filter((s) => s.id === registro.sessao.id).length,
    1,
  );
  assert.equal(
    db.workout_sessions.find((s) => s.id === registro.sessao.id)
      .duration_minutes,
    45,
  );
  assert.throws(() =>
    manual.montarRegistroManual({
      usuarioId: "u1",
      planId: "p1",
      planName: "X",
      dia: "2026-02-30",
      duracao: 45,
      intensidade: "leve",
      perfil,
      exercicios: [],
      series: [],
    }),
  );
  console.log(
    "OK — adaptação, remoção, modelos sem duplicar, original preservado, métricas e registro manual recuperável",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
