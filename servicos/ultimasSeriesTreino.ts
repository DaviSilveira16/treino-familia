import { supabase } from "../supabase";
import type { SerieAnterior } from "./treinoLocal";
export type UltimoExercicio = { data: string; series: SerieAnterior[] };

export async function carregarUltimasSeries(usuarioId: string, exercicioIds: string[]): Promise<Record<string, UltimoExercicio>> {
  const entradas = await Promise.all(exercicioIds.map(async (id) => {
    // Filtra no relacionamento antes de LIMIT: a referência é a última sessão
    // que realmente contém este exercício, mesmo após mudanças no plano.
    const { data, error } = await supabase.from("workout_sessions")
      .select("id, started_at, workout_sets!inner(exercise_id, set_number, reps, weight_kg)")
      .eq("user_id", usuarioId).eq("status", "concluido").eq("workout_sets.exercise_id", id)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? [id, { data: data.started_at, series: data.workout_sets as SerieAnterior[] }] as const : null;
  }));
  return Object.fromEntries(entradas.filter((item) => item !== null));
}
