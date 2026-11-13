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
  // A conclusão transacional pode reduzir as referências às séries realmente
  // realizadas. Depois dela não se reinsere o planejamento antigo nem se trata
  // a atualização automática (ou uma edição posterior) como conflito do modelo.
  const validarReferenciasPlanejadas = !local.encerradaNoServidor;
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

  const ids = modelo.exercicios.map((exercicio) => exercicio.id);
  if (ids.length) {
    const { data: existentes, error: erroExercicios } = await supabase
      .from("exercises")
      .select("id, plan_id, name, sets_goal, reps_goal")
      .eq("user_id", usuarioId)
      .in("id", ids);
    if (erroExercicios) throw erroExercicios;
    const porId = new Map((existentes ?? []).map((item) => [item.id, item]));
    const novos = [];
    for (const [indice, exercicio] of modelo.exercicios.entries()) {
      const existente = porId.get(exercicio.id);
      if (!existente) {
        novos.push({
          id: exercicio.id, user_id: usuarioId, plan_id: modelo.planId,
          name: exercicio.name, sets_goal: exercicio.sets_goal,
          reps_goal: exercicio.reps_goal, position: indice,
        });
        continue;
      }
      if (existente.plan_id !== modelo.planId || existente.name !== exercicio.name ||
          (validarReferenciasPlanejadas &&
            (Number(existente.sets_goal) !== exercicio.sets_goal ||
              String(existente.reps_goal) !== exercicio.reps_goal)))
        throw new ConflitoModeloTreino(
          "Um exercício do novo modelo foi alterado. Seus dados locais foram preservados.",
        );
    }
    if (novos.length) {
      if (modelo.modo === "adicionar") {
        const { data: ultimos, error } = await supabase
          .from("exercises").select("position").eq("user_id", usuarioId)
          .eq("plan_id", modelo.planId).order("position", { ascending: false }).limit(1);
        if (error) throw error;
        const primeiraPosicao = Number(ultimos?.[0]?.position ?? -1) + 1;
        novos.forEach((exercicio, indice) => { exercicio.position = primeiraPosicao + indice; });
      }
      const { error } = await supabase.from("exercises").insert(novos);
      if (error) throw error;
    }

    if (validarReferenciasPlanejadas) {
      // Pagina porque um modelo pode ter mais séries que o limite do PostgREST.
      const referencias = new Map<string, { reps: number; weight_kg: number }>();
      const tamanhoPagina = 500;
      for (let inicio = 0; ; inicio += tamanhoPagina) {
        const { data, error } = await supabase.from("exercise_load_defaults")
          .select("exercise_id, set_number, reps, weight_kg").eq("user_id", usuarioId)
          .in("exercise_id", ids).order("exercise_id").order("set_number")
          .range(inicio, inicio + tamanhoPagina - 1);
        if (error) throw error;
        for (const serie of data ?? [])
          referencias.set(`${serie.exercise_id}:${serie.set_number}`, serie);
        if ((data?.length ?? 0) < tamanhoPagina) break;
      }
      const ausentes = [];
      for (const exercicio of modelo.exercicios) {
        for (const serie of exercicio.series) {
          const existente = referencias.get(`${exercicio.id}:${serie.set_number}`);
          if (!existente) {
            ausentes.push({ user_id: usuarioId, exercise_id: exercicio.id, ...serie });
          } else if (Number(existente.reps) !== serie.reps || Number(existente.weight_kg) !== serie.weight_kg) {
            throw new ConflitoModeloTreino(
              "As cargas do novo modelo foram alteradas. Confira antes de reenviar.",
            );
          }
        }
      }
      if (ausentes.length) {
        const { error } = await supabase.from("exercise_load_defaults").insert(ausentes);
        if (error) throw error;
      }
    }
  }

  const destinoPorOrigem = new Map(modelo.exercicios.map((item) => [item.origemId, item.id]));
  const series = local.series.filter((s) => s.concluida && !s.excluida && s.registroId &&
    destinoPorOrigem.has(s.exercise_id));
  // Agrupa o vínculo por exercício e mantém a verificação do valor anterior.
  for (let inicio = 0; inicio < series.length; inicio += 150) {
    const lote = series.slice(inicio, inicio + 150);
    const { data, error } = await supabase.from("workout_sets").select("id, exercise_id")
      .eq("user_id", usuarioId).eq("session_id", sessaoId).in("id", lote.map((s) => s.registroId!));
    if (error) throw error;
    const porId = new Map((data ?? []).map((s) => [s.id, s]));
    const grupos = new Map<string, { origem: string | null; ids: string[] }>();
    for (const serie of lote) {
      const registro = porId.get(serie.registroId!);
      const destino = destinoPorOrigem.get(serie.exercise_id)!;
      const origem = serie.avulsa ? null : serie.exercise_id;
      if (registro?.exercise_id === destino) continue;
      if (!registro || registro.exercise_id !== origem)
        throw new ConflitoModeloTreino(
          "Uma série da sessão mudou durante o salvamento. O rascunho continua preservado.",
        );
      const grupo = grupos.get(destino) ?? { origem, ids: [] };
      grupo.ids.push(registro.id);
      grupos.set(destino, grupo);
    }
    for (const [destino, grupo] of grupos) {
      const consulta = supabase.from("workout_sets").update({ exercise_id: destino })
        .eq("user_id", usuarioId).eq("session_id", sessaoId).in("id", grupo.ids);
      const { data: atualizadas, error: erro } = await (grupo.origem === null
        ? consulta.is("exercise_id", null)
        : consulta.eq("exercise_id", grupo.origem)).select("id");
      if (erro) throw erro;
      if (atualizadas?.length !== grupo.ids.length)
        throw new ConflitoModeloTreino(
          "Uma série mudou durante o salvamento. Seus dados foram preservados.",
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
    if (sessao?.plan_id !== modelo.planId) {
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
}
