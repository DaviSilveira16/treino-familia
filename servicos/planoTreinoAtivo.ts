import { supabase } from "../supabase";
import type { PlanoExercicio, SerieRascunho, TreinoRascunho } from "./treinoLocal";

export type PlanoBase = NonNullable<TreinoRascunho["planoBase"]>;

export async function lerPlanoAtivo(usuarioId: string, planId: string): Promise<PlanoBase> {
  const [{ data, error }, plano] = await Promise.all([
    supabase.from("exercises").select("id, name, sets_goal, reps_goal, photo_path")
      .eq("user_id", usuarioId).eq("plan_id", planId).order("position"),
    supabase.from("workout_plans").select("name").eq("user_id", usuarioId).eq("id", planId).maybeSingle(),
  ]);
  if (error) throw error;
  if (plano.error) throw plano.error;
  const nome: string | undefined = plano.data?.name;
  const exercicios = (data ?? []) as PlanoExercicio[];
  if (!exercicios.length) return { nome, exercicios, series: [] };

  const { data: cargas, error: erroCargas } = await supabase.from("exercise_load_defaults")
    .select("exercise_id, set_number, reps, weight_kg")
    .eq("user_id", usuarioId).in("exercise_id", exercicios.map((e) => e.id))
    .order("set_number");
  if (erroCargas) throw erroCargas;
  const series = exercicios.flatMap((exercicio) => {
    const referencias = (cargas ?? []).filter((item) => item.exercise_id === exercicio.id);
    const previstas = Number(exercicio.sets_goal);
    const quantidade = Math.min(20, Number.isInteger(previstas) && previstas > 0 ? previstas : Math.max(1, referencias.length));
    return Array.from({ length: quantidade }, (_, indice): SerieRascunho => {
      const numero = indice + 1;
      const carga = referencias.find((item) => Number(item.set_number) === numero);
      return {
        chave: `${exercicio.id}:${numero}`,
        exercise_id: exercicio.id,
        exercise_name: exercicio.name,
        set_number: numero,
        reps: carga ? String(carga.reps) : String(exercicio.reps_goal || "8").match(/\d+/)?.[0] ?? "8",
        weight_kg: carga ? String(carga.weight_kg) : "",
        concluida: false,
      };
    });
  });
  return { nome, exercicios, series };
}

/** Aplica só diferenças do plano. Séries protegidas conservam seus valores e nomes. */
export function aplicarMudancasDoPlano(atual: PlanoBase, anterior: PlanoBase, novo: PlanoBase): PlanoBase {
  const protegida = (serie: SerieRascunho) => serie.concluida || serie.pendente || serie.registroId;
  const exerciciosAtuais = new Map(atual.exercicios.map((e) => [e.id, e]));
  const exerciciosAnteriores = new Map(anterior.exercicios.map((e) => [e.id, e]));
  const seriesAnteriores = new Map(anterior.series.map((s) => [s.chave, s]));
  const seriesNovas = new Map(novo.series.map((s) => [s.chave, s]));
  const exerciciosNovos = new Set(novo.exercicios.map((e) => e.id));
  const exercicios = novo.exercicios.map((e) => {
    const local = exerciciosAtuais.get(e.id);
    const base = exerciciosAnteriores.get(e.id);
    if (!local || !base) return e;
    return {
      ...local,
      name: e.name !== base.name ? e.name : local.name,
      sets_goal: e.sets_goal !== base.sets_goal ? e.sets_goal : local.sets_goal,
      reps_goal: e.reps_goal !== base.reps_goal ? e.reps_goal : local.reps_goal,
      photo_path: e.photo_path,
    };
  });
  const mantidos = new Map(exercicios.map((e) => [e.id, e]));
  const chavesLocais = new Set(atual.series.map((s) => s.chave));
  const series = atual.series.flatMap((s) => {
    if (!exerciciosNovos.has(s.exercise_id)) {
      const local = exerciciosAtuais.get(s.exercise_id);
      if (local?.avulso) return [s];
      return protegida(s) ? [{ ...s, avulsa: true }] : [];
    }
    const base = seriesAnteriores.get(s.chave);
    const nova = seriesNovas.get(s.chave);
    if (protegida(s) || s.excluida) return [s];
    if (base && !nova) return [];
    return [{
      ...s,
      exercise_name: mantidos.get(s.exercise_id)?.name ?? s.exercise_name,
      reps: nova && (!base || nova.reps !== base.reps) ? nova.reps : s.reps,
      weight_kg: nova && (!base || nova.weight_kg !== base.weight_kg) ? nova.weight_kg : s.weight_kg,
    }];
  });
  for (const s of novo.series) {
    if (!chavesLocais.has(s.chave) && !seriesAnteriores.has(s.chave) && !mantidos.get(s.exercise_id)?.removido)
      series.push({ ...s, exercise_name: mantidos.get(s.exercise_id)?.name ?? s.exercise_name });
  }
  const idsComSeries = new Set(series.map((s) => s.exercise_id));
  for (const e of atual.exercicios) {
    if (!exerciciosNovos.has(e.id) && (e.avulso || idsComSeries.has(e.id))) {
      exercicios.push(e.avulso ? e : { ...e, avulso: true, photo_path: null });
    }
  }
  const ordem = new Map(exercicios.map((e, indice) => [e.id, indice]));
  series.sort((a, b) => (ordem.get(a.exercise_id) ?? 0) - (ordem.get(b.exercise_id) ?? 0) || a.set_number - b.set_number);
  return { exercicios, series };
}
