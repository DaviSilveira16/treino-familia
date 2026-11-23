import type { PlanoExercicio, SerieRascunho } from "./treinoLocal";

/** Próximo exercício com séries abertas abaixo do atual; null indica a revisão. */
export function proximoExercicioAberto(
  exercicioId: string,
  exercicios: readonly Pick<PlanoExercicio, "id" | "removido">[],
  series: readonly Pick<SerieRascunho, "exercise_id" | "concluida" | "excluida">[],
): string | null {
  const indice = exercicios.findIndex((exercicio) => exercicio.id === exercicioId);
  if (indice < 0) return null;
  const abertos = new Set(
    series
      .filter((serie) => !serie.excluida && !serie.concluida)
      .map((serie) => serie.exercise_id),
  );
  return exercicios
    .slice(indice + 1)
    .find((exercicio) => !exercicio.removido && abertos.has(exercicio.id))?.id ?? null;
}
