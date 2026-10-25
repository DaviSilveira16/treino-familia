import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

export type Familia = { id: string; name: string; invite_code: string; owner_user_id?: string };
const chavePreferencia = (usuarioId: string) => `@treino-familia:familia-ativa:v1:${usuarioId}`;
let gravacoes: Promise<unknown> = Promise.resolve();
export async function lerFamiliaPreferida(usuarioId: string): Promise<string | null> {
  await gravacoes.catch(() => {});
  try { const id = await AsyncStorage.getItem(chavePreferencia(usuarioId)); return id && id.length <= 128 ? id : null; }
  catch { return null; }
}
export function guardarFamiliaPreferida(usuarioId: string, id: string | null): Promise<void> {
  const tarefa = gravacoes.catch(() => {}).then(() => id ? AsyncStorage.setItem(chavePreferencia(usuarioId), id) : AsyncStorage.removeItem(chavePreferencia(usuarioId)));
  gravacoes = tarefa.catch(() => {}); return tarefa;
}
export function selecionarFamiliaPermitida(familias: Familia[], preferida?: string | null): Familia | null {
  return familias.find(f => f.id === preferida) ?? familias[0] ?? null;
}
export function somenteDaFamilia<T extends { family_id: string }>(itens: T[], familiaId: string): T[] {
  return itens.filter(item => item.family_id === familiaId);
}
export function fotoPertenceAFamilia(caminho: string | null | undefined, familiaId: string): boolean {
  if (!caminho || !caminho.startsWith(`${familiaId}/`) || /[\\?#%]/.test(caminho)) return false;
  return caminho.split("/").every(parte => parte && parte !== "." && parte !== "..");
}
export async function criarFamiliaComId(usuarioId: string, nome: string, id: string): Promise<Familia> {
  nome = nome.trim();
  if (!usuarioId || !id || !nome || nome.length > 70) throw new Error("Informe um nome de família com até 70 caracteres.");
  const buscar = () => supabase.from("families").select("id, name, invite_code, owner_user_id").eq("id", id).eq("owner_user_id", usuarioId).maybeSingle();
  const { data: existente, error: erroBusca } = await buscar();
  if (erroBusca) throw erroBusca;
  if (existente) return existente as Familia;
  const { data, error } = await supabase.from("families").insert({ id, name: nome, owner_user_id: usuarioId }).select("id, name, invite_code, owner_user_id").single();
  if (!error && data) return data as Familia;
  // A failed response may follow a successful INSERT. Recover the same ID instead of duplicating a group.
  const { data: recuperada } = await buscar();
  if (recuperada) return recuperada as Familia;
  if (error?.code === "23505" && /owner_user_id|families_owner|family_members_user_id_key/.test(`${error.message} ${error.details}`)) {
    throw new Error("O banco ainda possui uma restrição de uma família por pessoa. É necessário revisar essa restrição no Supabase; suas famílias atuais foram preservadas.");
  }
  throw error ?? new Error("Não foi possível confirmar a criação. Atualize a lista antes de tentar outra família.");
}
