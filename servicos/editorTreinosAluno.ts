import { supabase } from "../supabase";
import { novoIdSerie } from "./treinoLocal";
import { registrarMudancaDeDados } from "./revisaoDados";

export type ContextoTreinosAluno = { usuarioId: string; vinculoId: string; alunoId: string; nomeAluno: string };
export type ExercicioAluno = {
  id: string; plan_id: string; name: string; sets_goal: number; reps_goal: string; position: number;
  photo_path: string | null; loads: { set_number: number; reps: number; weight_kg: number }[];
};
export type SnapshotTreinoAluno = { plan: { id: string; name: string }; exercises: ExercicioAluno[]; version: string };
type ResultadoEdicao = { plan_id: string; snapshot: SnapshotTreinoAluno | null };

/** Instância em memória por painel/conta/vínculo. Não usa os caches do aluno. */
export function criarEditorTreinosAluno(contexto: ContextoTreinosAluno) {
  const pendentes = new Map<string, string>();
  async function rpc<T>(action: string, data: Record<string, unknown>): Promise<T> {
    const antes = await supabase.auth.getSession();
    if (antes.error || antes.data.session?.user.id !== contexto.usuarioId) throw new Error("Sua conta mudou. Reabra o acompanhamento.");
    const resposta = await supabase.rpc("tf_coaching_workouts", { p_link_id: contexto.vinculoId, p_action: action, p_data: data });
    const depois = await supabase.auth.getSession();
    if (depois.error || depois.data.session?.user.id !== contexto.usuarioId) throw new Error("Sua conta mudou. Reabra o acompanhamento.");
    if (resposta.error) {
      if (["PGRST202", "42883"].includes(resposta.error.code)) throw new Error("A edição dos treinos do aluno ainda precisa ser habilitada no servidor.");
      if (resposta.error.code === "23505") throw new Error("Este nome já está sendo usado. Escolha outro nome.");
      throw new Error(resposta.error.message || "Não foi possível confirmar a alteração. Tente novamente.");
    }
    return resposta.data as T;
  }
  return {
    listar: () => rpc<{ plans: { id: string; name: string }[] }>("list", {}),
    ler: (planId: string) => rpc<SnapshotTreinoAluno>("read", { plan_id: planId }),
    async alterar(action: string, data: Record<string, unknown>): Promise<ResultadoEdicao> {
      const chave = JSON.stringify([action, data]);
      const operation_id = pendentes.get(chave) ?? novoIdSerie();
      pendentes.set(chave, operation_id);
      const resultado = await rpc<ResultadoEdicao>(action, { ...data, operation_id });
      if (!resultado?.plan_id || (action !== "delete_plan" && !resultado.snapshot?.version))
        throw new Error("O servidor não confirmou a alteração. Atualize o treino.");
      pendentes.delete(chave);
      registrarMudancaDeDados();
      return resultado;
    },
  };
}
