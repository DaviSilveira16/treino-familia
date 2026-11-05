import { supabase } from "../supabase";
import { registrarMudancaDeDados } from "./revisaoDados";

export type Vinculo = {
  id: string; coach_id: string | null; student_id: string;
  coach_name: string; student_name: string; created_at: string; ended_at: string | null;
};
export type ConviteTreinador = { id: string; code: string; coach_name: string; expires_at: string };
export type ExercicioPrescrito = {
  name: string; sets: number; reps: string; weight: number; rest: number;
  instructions: string; exercise_id?: string;
};
export type DocumentoFicha = { name: string; instructions: string; exercises: ExercicioPrescrito[] };
export type Ficha = {
  id: string; link_id: string; document: DocumentoFicha; revision: number; published_revision: number;
};
export type Entrega = {
  id: string; plan_id: string | null; link_id: string; coach_name: string;
  document: DocumentoFicha; revision: number; created_at: string;
};
export type SessaoAcompanhada = {
  id: string; plan_name: string; started_at: string; duration_minutes: number | null;
  intensity: string | null; notes: string | null; comment: string;
  sets: { exercise_name: string; set_number: number; reps: number; weight_kg: number }[];
};
export type HistoricoAcompanhado = { sessions: SessaoAcompanhada[]; total: number; last30: number };
export type PlanosAcompanhados = { plans: { id: string; name: string; exercises: (ExercicioPrescrito & {
  loads: { set_number: number; reps: number; weight_kg: number }[];
})[] }[]; total: number };
export type InicioAcompanhamento = { links: Vinculo[]; invites: ConviteTreinador[] };

export function validarFicha(doc: DocumentoFicha): DocumentoFicha {
  if (!doc.name.trim() || doc.name.trim().length > 80) throw new Error("Informe um nome com até 80 caracteres.");
  if (doc.instructions.length > 2000 || doc.exercises.length < 1 || doc.exercises.length > 50)
    throw new Error("Inclua de 1 a 50 exercícios e até 2000 caracteres de orientações.");
  const exercises = doc.exercises.map((ex, indice) => {
    const reps = ex.reps.trim().replace(/\s/g, "");
    const faixa = reps.split("-").map(Number);
    if (!ex.name.trim() || ex.name.trim().length > 100 || !Number.isInteger(ex.sets) || ex.sets < 1 || ex.sets > 30
      || !/^\d{1,3}(-\d{1,3})?$/.test(reps) || faixa[0] < 1 || (faixa.length === 2 && faixa[1] < faixa[0])
      || !Number.isFinite(ex.weight) || ex.weight < 0 || ex.weight > 2000
      || !Number.isInteger(ex.rest) || ex.rest < 0 || ex.rest > 3600 || ex.instructions.length > 1000)
      throw new Error(`Confira o exercício ${indice + 1}: nome, 1–30 séries, repetições (ex.: 8-12), carga de 0–2000 kg e descanso de 0–3600 s.`);
    return { name: ex.name.trim(), sets: ex.sets, reps, weight: ex.weight, rest: ex.rest, instructions: ex.instructions.trim() };
  });
  return { name: doc.name.trim(), instructions: doc.instructions.trim(), exercises };
}

export function normalizarCodigoConvite(codigo: string) {
  const valor = codigo.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(valor))
    throw new Error("Cole o código completo recebido do treinador.");
  return valor;
}

export async function chamarAcompanhamento<T>(usuarioId: string, action: string, data: Record<string, unknown> = {}): Promise<T> {
  const antes = await supabase.auth.getSession();
  if (antes.error || !usuarioId || antes.data.session?.user.id !== usuarioId)
    throw new Error("Sua conta mudou. Reabra o acompanhamento.");
  const resposta = await supabase.rpc("tf_coaching", { p_action: action, p_data: data });
  const depois = await supabase.auth.getSession();
  if (depois.error || depois.data.session?.user.id !== usuarioId) throw new Error("Sua conta mudou. Reabra o acompanhamento.");
  if (resposta.error) {
    if (["PGRST202", "42883"].includes(resposta.error.code))
      throw new Error("O acompanhamento ainda não foi habilitado no servidor. Tente novamente após a atualização do aplicativo.");
    if (resposta.error.code === "23505") throw new Error("Já existe um registro com esses dados. Atualize antes de tentar novamente.");
    throw new Error(resposta.error.message || "Não foi possível confirmar a operação. Confira sua conexão e tente novamente.");
  }
  return resposta.data as T;
}

export async function salvarFicha(usuarioId: string, ficha: Ficha): Promise<Ficha> {
  const document = validarFicha(ficha.document);
  return chamarAcompanhamento(usuarioId, "draft_save", { link_id: ficha.link_id, id: ficha.id, revision: ficha.revision, document });
}

export async function publicarFicha(usuarioId: string, ficha: Ficha): Promise<Entrega> {
  const entrega = await chamarAcompanhamento<Entrega>(usuarioId, "publish", { link_id: ficha.link_id, id: ficha.id, revision: ficha.revision });
  if (!entrega?.id) throw new Error("Não foi possível confirmar a entrega. Atualize a lista de fichas.");
  registrarMudancaDeDados();
  return entrega;
}

export async function renomearTreino(usuarioId: string, treinoId: string, nome: string) {
  const name = nome.trim();
  if (!name || name.length > 100) throw new Error("Informe um nome com até 100 caracteres.");
  const sessao = await supabase.auth.getSession();
  if (!usuarioId || sessao.error || sessao.data.session?.user.id !== usuarioId) throw new Error("Entre novamente na sua conta.");
  const { data, error } = await supabase.from("workout_plans").update({ name })
    .eq("id", treinoId).eq("user_id", usuarioId).select("id, name").single();
  if (error) throw new Error(error.code === "23505" ? "Você já tem um treino com esse nome. Escolha outro." : error.message);
  if (data?.id !== treinoId || data.name !== name) throw new Error("O servidor não confirmou o novo nome. Atualize a lista.");
  registrarMudancaDeDados();
  return data as { id: string; name: string };
}

export async function copiarModeloProprio(usuarioId: string, planId: string): Promise<DocumentoFicha> {
  const { data: plano, error } = await supabase.from("workout_plans").select("name").eq("id", planId).eq("user_id", usuarioId).single();
  if (error || !plano) throw new Error("Não foi possível abrir o modelo.");
  const lista = await supabase.from("exercises").select("id, name, sets_goal, reps_goal, position")
    .eq("plan_id", planId).eq("user_id", usuarioId).order("position").limit(51);
  if (lista.error) throw new Error(lista.error.message);
  if (!lista.data?.length || lista.data.length > 50) throw new Error("Escolha um modelo com 1 a 50 exercícios.");
  const cargas = await supabase.from("exercise_load_defaults").select("exercise_id, weight_kg")
    .eq("user_id", usuarioId).in("exercise_id", lista.data.map(e => e.id)).eq("set_number", 1);
  if (cargas.error) throw new Error(cargas.error.message);
  return { name: plano.name, instructions: "", exercises: lista.data.map(e => ({ name: e.name, sets: e.sets_goal,
    reps: e.reps_goal, weight: Number(cargas.data?.find(c => c.exercise_id === e.id)?.weight_kg ?? 0), rest: 60, instructions: "" })) };
}
