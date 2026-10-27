import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

export type Familia = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id?: string;
};

const chavePreferencia = (usuarioId: string) =>
  `@treino-familia:familia-ativa:v1:${usuarioId}`;
let gravacoes: Promise<unknown> = Promise.resolve();

export async function lerFamiliaPreferida(
  usuarioId: string,
): Promise<string | null> {
  await gravacoes.catch(() => {});
  try {
    const id = await AsyncStorage.getItem(chavePreferencia(usuarioId));
    return id && id.length <= 128 ? id : null;
  } catch {
    return null;
  }
}

export function guardarFamiliaPreferida(
  usuarioId: string,
  id: string | null,
): Promise<void> {
  const tarefa = gravacoes
    .catch(() => {})
    .then(() =>
      id
        ? AsyncStorage.setItem(chavePreferencia(usuarioId), id)
        : AsyncStorage.removeItem(chavePreferencia(usuarioId)),
    );
  gravacoes = tarefa.catch(() => {});
  return tarefa;
}

export function selecionarFamiliaPermitida(
  familias: Familia[],
  preferida?: string | null,
): Familia | null {
  return (
    familias.find((familia) => familia.id === preferida) ?? familias[0] ?? null
  );
}

export function somenteDaFamilia<T extends { family_id: string }>(
  itens: T[],
  familiaId: string,
): T[] {
  return itens.filter((item) => item.family_id === familiaId);
}

export function fotoPertenceAFamilia(
  caminho: string | null | undefined,
  familiaId: string,
): boolean {
  if (
    !caminho ||
    !caminho.startsWith(`${familiaId}/`) ||
    /[\\?#%]/.test(caminho)
  )
    return false;
  return caminho
    .split("/")
    .every((parte) => parte && parte !== "." && parte !== "..");
}

function verificarErroFamilias(problema: unknown): never {
  const detalhe =
    problema && typeof problema === "object"
      ? (problema as { code?: unknown; message?: unknown })
      : {};
  const codigo = typeof detalhe.code === "string" ? detalhe.code : "";
  const mensagem = typeof detalhe.message === "string" ? detalhe.message : "";
  if (
    codigo === "PGRST202" ||
    /could not find the function|function .* does not exist/i.test(mensagem)
  ) {
    throw new Error(
      "A atualização do banco de famílias ainda não foi aplicada. Execute o arquivo supabase/migrations/20261027153000_gestao_familias.sql no SQL Editor do Supabase.",
    );
  }
  throw problema;
}

export async function criarFamiliaComId(
  usuarioId: string,
  nome: string,
  id: string,
): Promise<Familia> {
  const nomeValidado = nome.trim();
  if (!usuarioId || !id || !nomeValidado || nomeValidado.length > 70) {
    throw new Error("Informe um nome de família com até 70 caracteres.");
  }
  const { data, error } = await supabase.rpc("criar_familia_completa", {
    p_id: id,
    p_nome: nomeValidado,
  });
  if (error) verificarErroFamilias(error);
  const familia = data as Familia | null;
  if (
    !familia?.id ||
    familia.id !== id ||
    familia.owner_user_id !== usuarioId
  ) {
    throw new Error(
      "O banco não confirmou a criação da família. Atualize a tela antes de tentar novamente.",
    );
  }
  return familia;
}

export async function renomearFamilia(
  id: string,
  nome: string,
): Promise<Familia> {
  const nomeValidado = nome.trim();
  if (!id || !nomeValidado || nomeValidado.length > 70) {
    throw new Error("Informe um nome com até 70 caracteres.");
  }
  const { data, error } = await supabase.rpc("renomear_familia", {
    p_family_id: id,
    p_nome: nomeValidado,
  });
  if (error) verificarErroFamilias(error);
  const familia = data as Familia | null;
  if (!familia?.id)
    throw new Error("Não foi possível confirmar a alteração do nome.");
  return familia;
}

export async function sairDaFamilia(id: string): Promise<void> {
  const { data, error } = await supabase.rpc("sair_da_familia", {
    p_family_id: id,
  });
  if (error) verificarErroFamilias(error);
  if (data !== true)
    throw new Error("O banco não confirmou sua saída da família.");
}

export async function excluirFamilia(id: string): Promise<void> {
  const { data, error } = await supabase.rpc("excluir_familia", {
    p_family_id: id,
  });
  if (error) verificarErroFamilias(error);
  if (data !== true)
    throw new Error("O banco não confirmou a exclusão da família.");
}
