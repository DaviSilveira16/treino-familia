import { supabase } from "../supabase";
import { registrarMudancaDeDados } from "./revisaoDados";
import { excluirSessaoTreino } from "./treinoSincronizacao";

/** Remove somente a sessão selecionada; modelos e outros registros do dia permanecem. */
export async function excluirRegistroFrequencia(usuarioId: string, registro: { tipo: "treino" | "cardio"; id: string }): Promise<void> {
  if (registro.tipo === "treino") return excluirSessaoTreino(usuarioId, registro.id);
  const { data: auth, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || auth.user?.id !== usuarioId) throw new Error("Entre novamente na sua conta para excluir este cardio.");
  const resultado = await supabase.from("cardio_sessions").delete().eq("id", registro.id).eq("user_id", usuarioId).select("id");
  const { data: restante, error } = await supabase.from("cardio_sessions").select("id").eq("id", registro.id).eq("user_id", usuarioId).maybeSingle();
  if (error) throw new Error("Não foi possível confirmar a exclusão do cardio no servidor. Tente novamente.");
  if (restante) throw new Error(resultado.error?.message ?? "O servidor não confirmou a exclusão do cardio. Ele continua registrado; confira as permissões da conta no Supabase.");
  registrarMudancaDeDados();
}
