import {
  novoIdSerie,
  type ModeloTreinoPendente,
  type PlanoExercicio,
  type SerieRascunho,
} from "./treinoLocal";

export function repetirCargaNasSeries(
  series: SerieRascunho[],
  exercicioId: string,
  carga: string,
) {
  return series.map((serie) =>
    serie.exercise_id === exercicioId &&
    !serie.concluida &&
    !serie.excluida &&
    !serie.pendente
      ? { ...serie, weight_kg: carga }
      : serie,
  );
}

export function criarExercicioSessao(
  nome: string,
  quantidade: number,
  repeticoes: number,
  peso: number | null,
) {
  nome = nome.trim();
  if (
    !nome ||
    nome.length > 100 ||
    !Number.isInteger(quantidade) ||
    quantidade < 1 ||
    quantidade > 20 ||
    !Number.isInteger(repeticoes) ||
    repeticoes < 1 ||
    repeticoes > 1000 ||
    (peso !== null && (!Number.isFinite(peso) || peso < 0 || peso > 2000))
  ) {
    throw new Error(
      "Informe um nome de até 100 caracteres, 1 a 20 séries, repetições de 1 a 1.000 e carga de 0 a 2.000 kg.",
    );
  }
  const id = novoIdSerie();
  const exercicio: PlanoExercicio = {
    id,
    name: nome,
    sets_goal: quantidade,
    reps_goal: String(repeticoes),
    avulso: true,
  };
  const series: SerieRascunho[] = Array.from(
    { length: quantidade },
    (_, i) => ({
      chave: `${id}:${i + 1}`,
      exercise_id: id,
      exercise_name: nome,
      set_number: i + 1,
      reps: String(repeticoes),
      weight_kg: peso === null ? "" : String(peso),
      concluida: false,
      avulsa: true,
    }),
  );
  return { exercicio, series };
}

export function retirarSerie(serie: SerieRascunho): SerieRascunho {
  return {
    ...serie,
    excluida: true,
    concluida: false,
    pendente: serie.registroId ? "remover" : undefined,
    baseRemota:
      serie.baseRemota ??
      (serie.registroId
        ? {
            id: serie.registroId,
            reps: Number(serie.reps),
            weight_kg: Number(serie.weight_kg.replace(",", ".")),
          }
        : undefined),
  };
}
export function acrescentarSerie(
  exercicio: PlanoExercicio,
  series: SerieRascunho[],
): SerieRascunho {
  const doExercicio = series.filter((s) => s.exercise_id === exercicio.id);
  const visiveis = doExercicio.filter((s) => !s.excluida);
  if (visiveis.length >= 20)
    throw new Error("Use no máximo 20 séries por exercício.");
  // Never reuse a number whose deletion may still be in flight.
  const numero = Math.max(0, ...doExercicio.map((s) => s.set_number)) + 1;
  const ultima = visiveis[visiveis.length - 1];
  return {
    chave: `${exercicio.id}:${numero}`,
    exercise_id: exercicio.id,
    exercise_name: exercicio.name,
    set_number: numero,
    reps: ultima?.reps ?? String(exercicio.reps_goal.match(/\d+/)?.[0] ?? 8),
    weight_kg: ultima?.weight_kg ?? "",
    concluida: false,
    avulsa: exercicio.avulso,
  };
}

export function prepararModeloTreino(
  modo: "novo" | "adicionar",
  nome: string,
  planId: string,
  exercicios: PlanoExercicio[],
  series: SerieRascunho[],
): ModeloTreinoPendente {
  nome = nome.trim();
  if (modo === "novo" && (!nome || nome.length > 100))
    throw new Error("Dê ao novo treino um nome de até 100 caracteres.");
  const lista = exercicios.filter(
    (e) => !e.removido && (modo === "novo" || e.avulso),
  );
  if (!lista.length)
    throw new Error(
      modo === "novo"
        ? "Mantenha ao menos um exercício para criar o treino."
        : "Não há exercícios novos para adicionar ao treino original.",
    );
  return {
    modo,
    nome,
    planId: modo === "novo" ? novoIdSerie() : planId,
    exercicios: lista.map((exercicio) => {
      const referencias = series.filter(
        (s) => s.exercise_id === exercicio.id && !s.excluida,
      );
      if (!referencias.length)
        throw new Error(`Adicione ao menos uma série em ${exercicio.name}.`);
      return {
        id: novoIdSerie(),
        origemId: exercicio.id,
        name: exercicio.name,
        sets_goal: referencias.length,
        reps_goal: exercicio.reps_goal,
        series: referencias.map((s, i) => {
          const reps = Number(s.reps),
            peso = Number(s.weight_kg.replace(",", "."));
          if (
            !s.reps.trim() ||
            !Number.isInteger(reps) ||
            reps < 1 ||
            reps > 1000 ||
            !Number.isFinite(peso) ||
            peso < 0 ||
            peso > 2000
          )
            throw new Error(
              `Confira repetições e carga de ${exercicio.name}, série ${s.set_number}.`,
            );
          return { set_number: i + 1, reps, weight_kg: peso };
        }),
      };
    }),
  };
}
