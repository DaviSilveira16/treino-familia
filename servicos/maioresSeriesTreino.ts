import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { lerExclusaoTreino, type SerieAnterior } from "./treinoLocal";

export type SerieRecorde = SerieAnterior & { data: string; sessaoId: string };
export type RecordeExercicio = { series: SerieRecorde[]; desatualizado: boolean };
type SessaoHistorica = {
  id: string; user_id: string; started_at: string; finished_at: string | null;
  status: string | null; workout_sets: SerieAnterior[];
};
const tamanhoPagina = 200;
const chave = (usuarioId: string, exercicioId: string) =>
  `@treino-familia:recordes-series:v1:${usuarioId}:${exercicioId}`;

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}
function sessoesValidas(valor: unknown, usuarioId: string): SessaoHistorica[] {
  if (!Array.isArray(valor)) throw new Error("O histórico de cargas não pôde ser conferido.");
  return valor.filter((sessao): sessao is SessaoHistorica => Boolean(
    sessao && typeof sessao === "object" && typeof sessao.id === "string" &&
    sessao.user_id === usuarioId && sessao.status === "concluido" &&
    typeof sessao.started_at === "string" && Number.isFinite(Date.parse(sessao.started_at)) &&
    typeof sessao.finished_at === "string" && Number.isFinite(Date.parse(sessao.finished_at)) &&
    Array.isArray(sessao.workout_sets),
  ));
}

/** Cada número de série concorre só com o mesmo exercício e número de série.
 * Empates de peso usam a sessão mais recente, preservando suas repetições reais. */
export function selecionarMaioresSeries(
  sessoes: SessaoHistorica[], usuarioId: string, exercicioId: string,
): SerieRecorde[] {
  const maiores = new Map<number, SerieRecorde>();
  for (const sessao of sessoesValidas(sessoes, usuarioId)) {
    for (const item of sessao.workout_sets) {
      const peso = numero(item.weight_kg), reps = numero(item.reps), ordem = numero(item.set_number);
      if (item.exercise_id !== exercicioId || peso === null || peso < 0 || peso > 2000 ||
        reps === null || !Number.isInteger(reps) || reps < 1 || reps > 1000 ||
        ordem === null || !Number.isInteger(ordem) || ordem < 1 || ordem > 20) continue;
      const candidata: SerieRecorde = { exercise_id: exercicioId, set_number: ordem, weight_kg: peso, reps, data: sessao.started_at, sessaoId: sessao.id };
      const anterior = maiores.get(ordem);
      if (!anterior || peso > anterior.weight_kg || peso === anterior.weight_kg && (
        Date.parse(candidata.data) > Date.parse(anterior.data) ||
        candidata.data === anterior.data && candidata.sessaoId.localeCompare(anterior.sessaoId) > 0
      )) maiores.set(ordem, candidata);
    }
  }
  return [...maiores.values()].sort((a, b) => a.set_number - b.set_number);
}

async function garantirConta(usuarioId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== usuarioId)
    throw new Error("A conta ativa mudou. Reabra o treino para consultar suas maiores cargas.");
}
async function lerCache(usuarioId: string, exercicioId: string): Promise<SessaoHistorica[] | null> {
  try {
    const texto = await AsyncStorage.getItem(chave(usuarioId, exercicioId));
    if (texto === null) return null;
    const valor = JSON.parse(texto);
    if (valor.usuarioId !== usuarioId || valor.exercicioId !== exercicioId) return null;
    return sessoesValidas(valor.sessoes, usuarioId);
  } catch { return null; }
}

/** Busca todas as sessões por páginas; o cache conserva as candidatas para poder
 * recalcular o máximo após uma exclusão offline, em vez de ressuscitar o recorde. */
export async function carregarMaioresSeries(
  usuarioId: string, exercicioIds: string[],
): Promise<Record<string, RecordeExercicio>> {
  if (!usuarioId) throw new Error("Entre na sua conta para consultar as maiores cargas.");
  await garantirConta(usuarioId);
  let consultarServidor = typeof navigator === "undefined" || navigator.onLine !== false;
  if (consultarServidor) {
    const autenticado = await supabase.auth.getUser().catch(() => null);
    if (autenticado && !autenticado.error && autenticado.data.user?.id !== usuarioId)
      throw new Error("A conta ativa mudou. Reabra o treino para consultar suas maiores cargas.");
    consultarServidor = Boolean(autenticado && !autenticado.error);
  }
  await garantirConta(usuarioId);
  const exclusoes = new Map<string, Promise<boolean>>();
  const removida = (id: string) => {
    if (!exclusoes.has(id)) exclusoes.set(id, lerExclusaoTreino(usuarioId, id).then(Boolean));
    return exclusoes.get(id)!;
  };
  const entradas = await Promise.all([...new Set(exercicioIds.filter(Boolean))].map(async (id) => {
    let sessoes: SessaoHistorica[] = [], desatualizado = !consultarServidor;
    if (consultarServidor) {
      try {
        for (let pagina = 0; ; pagina++) {
          const { data, error } = await supabase.from("workout_sessions")
            .select("id, user_id, started_at, finished_at, status, workout_sets!inner(exercise_id, set_number, reps, weight_kg)")
            .eq("user_id", usuarioId).eq("status", "concluido").eq("workout_sets.exercise_id", id)
            .order("started_at", { ascending: false }).order("id", { ascending: false })
            .range(pagina * tamanhoPagina, pagina * tamanhoPagina + tamanhoPagina - 1);
          if (error) throw error;
          sessoes.push(...sessoesValidas(data ?? [], usuarioId));
          if ((data?.length ?? 0) < tamanhoPagina) break;
          if (pagina >= 499) throw new Error("O histórico de cargas é muito grande para conferir neste aparelho.");
        }
      } catch { desatualizado = true; }
    }
    if (desatualizado) {
      const cache = await lerCache(usuarioId, id);
      if (cache === null) throw new Error("Não foi possível consultar as maiores cargas. Conecte-se para carregar seu histórico pela primeira vez.");
      sessoes = cache;
    }
    await garantirConta(usuarioId);
    const permitidas = await Promise.all(sessoes.map(async (sessao) => await removida(sessao.id) ? null : sessao));
    sessoes = permitidas.filter((sessao): sessao is SessaoHistorica => sessao !== null);
    await garantirConta(usuarioId);
    if (!desatualizado) {
      // Não inclui exercícios de outras buscas no cache deste exercício.
      const cache = sessoes.map((sessao) => ({ ...sessao, workout_sets: sessao.workout_sets.filter((serie) => serie.exercise_id === id) }));
      await AsyncStorage.setItem(chave(usuarioId, id), JSON.stringify({ usuarioId, exercicioId: id, sessoes: cache })).catch(() => {});
    }
    await garantirConta(usuarioId);
    return [id, { series: selecionarMaioresSeries(sessoes, usuarioId, id), desatualizado }] as const;
  }));
  await garantirConta(usuarioId);
  return Object.fromEntries(entradas.filter(([, item]) => item.series.length));
}
