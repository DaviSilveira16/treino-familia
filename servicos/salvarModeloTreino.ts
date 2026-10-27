import { supabase } from "../supabase";
import type { TreinoRascunho } from "./treinoLocal";

export class ConflitoModeloTreino extends Error {}
/** Stable client IDs + read-before-insert make a lost response safe to retry. */
export async function salvarModeloDoTreino(
  local: TreinoRascunho,
  prepararApenas = false,
): Promise<void> {
  const modelo = local.finalizacao?.modelo;
  if (!modelo || !local.finalizacao) return;
  const usuarioId = local.usuarioId,
    sessaoId = local.sessao.id;
  const { data: plano, error: erroPlano } = await supabase
    .from("workout_plans")
    .select("id, name")
    .eq("id", modelo.planId)
    .eq("user_id", usuarioId)
    .maybeSingle();
  if (erroPlano) throw erroPlano;
  if (!plano) {
    if (modelo.modo !== "novo")
      throw new ConflitoModeloTreino(
        "O treino original não está mais disponível. Sua sessão e a escolha de salvar continuam guardadas.",
      );
    const { error } = await supabase
      .from("workout_plans")
      .insert({ id: modelo.planId, user_id: usuarioId, name: modelo.nome });
    if (error) throw error;
  } else if (modelo.modo === "novo" && plano.name !== modelo.nome)
    throw new ConflitoModeloTreino(
      "O novo treino foi alterado em outro lugar. A sessão continua preservada para revisão.",
    );

  for (const [indice, exercicio] of modelo.exercicios.entries()) {
    const { data: existente, error: erroExercicio } = await supabase
      .from("exercises")
      .select("id, plan_id, name, sets_goal, reps_goal")
      .eq("id", exercicio.id)
      .eq("user_id", usuarioId)
      .maybeSingle();
    if (erroExercicio) throw erroExercicio;
    if (existente) {
      if (
        existente.plan_id !== modelo.planId ||
        existente.name !== exercicio.name ||
        Number(existente.sets_goal) !== exercicio.sets_goal ||
        String(existente.reps_goal) !== exercicio.reps_goal
      )
        throw new ConflitoModeloTreino(
          "Um exercício do novo modelo foi alterado. Seus dados locais foram preservados.",
        );
    } else {
      let position = indice;
      if (modelo.modo === "adicionar") {
        const { data: ultimos, error } = await supabase
          .from("exercises")
          .select("position")
          .eq("user_id", usuarioId)
          .eq("plan_id", modelo.planId)
          .order("position", { ascending: false })
          .limit(1);
        if (error) throw error;
        position = Number(ultimos?.[0]?.position ?? -1) + 1;
      }
      const { error } = await supabase
        .from("exercises")
        .insert({
          id: exercicio.id,
          user_id: usuarioId,
          plan_id: modelo.planId,
          name: exercicio.name,
          sets_goal: exercicio.sets_goal,
          reps_goal: exercicio.reps_goal,
          position,
        });
      if (error) throw error;
    }
    for (const serie of exercicio.series) {
      const { data: referencia, error: erroReferencia } = await supabase
        .from("exercise_load_defaults")
        .select("reps, weight_kg")
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id)
        .eq("set_number", serie.set_number)
        .maybeSingle();
      if (erroReferencia) throw erroReferencia;
      if (referencia) {
        if (
          Number(referencia.reps) !== serie.reps ||
          Number(referencia.weight_kg) !== serie.weight_kg
        )
          throw new ConflitoModeloTreino(
            "As cargas do novo modelo foram alteradas. Confira antes de reenviar.",
          );
      } else {
        const { error } = await supabase
          .from("exercise_load_defaults")
          .insert({ user_id: usuarioId, exercise_id: exercicio.id, ...serie });
        if (error) throw error;
      }
    }
  }
  // History snapshots keep their names/values; link them to the chosen template only after it is complete.
  for (const exercicio of modelo.exercicios) {
    const series = local.series.filter(
      (s) =>
        s.exercise_id === exercicio.origemId &&
        s.concluida &&
        !s.excluida &&
        s.registroId,
    );
    for (const serie of series) {
      const { data: registro, error } = await supabase
        .from("workout_sets")
        .select("id, exercise_id")
        .eq("id", serie.registroId!)
        .eq("user_id", usuarioId)
        .eq("session_id", sessaoId)
        .maybeSingle();
      if (error) throw error;
      if (!registro)
        throw new ConflitoModeloTreino(
          "Uma série da sessão foi removida durante o salvamento. O rascunho continua preservado.",
        );
      if (registro.exercise_id === exercicio.id) continue;
      const origem = serie.avulsa ? null : serie.exercise_id;
      if (registro.exercise_id !== origem)
        throw new ConflitoModeloTreino(
          "Uma série foi alterada em outro aparelho. Confira o histórico antes de reenviar.",
        );
      let consulta = supabase
        .from("workout_sets")
        .update({ exercise_id: exercicio.id })
        .eq("id", serie.registroId!)
        .eq("user_id", usuarioId)
        .eq("session_id", sessaoId);
      consulta =
        origem === null
          ? consulta.is("exercise_id", null)
          : consulta.eq("exercise_id", origem);
      const { data: atualizada, error: erroAtualizacao } = await consulta
        .select("id")
        .maybeSingle();
      if (erroAtualizacao) throw erroAtualizacao;
      if (!atualizada)
        throw new ConflitoModeloTreino(
          "A série mudou durante o salvamento. Seus dados foram preservados.",
        );
    }
  }
  if (modelo.modo === "novo" && !prepararApenas) {
    const { data: sessao, error } = await supabase
      .from("workout_sessions")
      .select("plan_id")
      .eq("id", sessaoId)
      .eq("user_id", usuarioId)
      .maybeSingle();
    if (error) throw error;
    if (sessao?.plan_id === modelo.planId) return;
    const { data, error: erroMover } = await supabase
      .from("workout_sessions")
      .update({ plan_id: modelo.planId })
      .eq("id", sessaoId)
      .eq("user_id", usuarioId)
      .eq("plan_id", local.planId)
      .eq("status", "concluido")
      .eq("finished_at", local.finalizacao.finishedAt)
      .select("id")
      .maybeSingle();
    if (erroMover) throw erroMover;
    if (!data)
      throw new ConflitoModeloTreino(
        "O vínculo do treino mudou durante o envio. A sessão foi preservada.",
      );
  }
}
