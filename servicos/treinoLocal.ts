/**
 * Cache isolado por usuário, plano e sessão. O Supabase continua sendo a fonte
 * permanente. Não use este cache para dados de outras contas.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AcaoPendente = "salvar" | "remover";
export type EsforcoPercebido =
  | "nao_informado"
  | "leve"
  | "adequado"
  | "intenso";
export type SerieRascunho = {
  chave: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  reps: string;
  weight_kg: string;
  concluida: boolean;
  registroId?: string;
  pendente?: AcaoPendente;
};
export type PlanoExercicio = {
  id: string;
  name: string;
  sets_goal: number;
  reps_goal: string;
};
export type SessaoRascunho = {
  id: string;
  plan_id: string;
  started_at: string;
};
export type TreinoRascunho = {
  versao: 1;
  usuarioId: string;
  planId: string;
  planName: string;
  sessao: SessaoRascunho;
  exercicios: PlanoExercicio[];
  series: SerieRascunho[];
  intensidade: "leve" | "moderada" | "intensa";
  esforco: EsforcoPercebido;
  salvoEm: string;
};

function chave(usuarioId: string, planId: string) {
  return `@treino-familia:rascunho:v1:${usuarioId}:${planId}`;
}

// Escritas serializadas: uma gravação antiga nunca deve passar à frente da nova.
let fila: Promise<unknown> = Promise.resolve();
export function gravarRascunho(rascunho: TreinoRascunho): Promise<void> {
  const tarefa = fila
    .catch(() => {})
    .then(() =>
      AsyncStorage.setItem(
        chave(rascunho.usuarioId, rascunho.planId),
        JSON.stringify(rascunho),
      ),
    );
  fila = tarefa.catch(() => {});
  return tarefa;
}
export async function lerRascunho(usuarioId: string, planId: string) {
  await fila.catch(() => {});
  const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
  if (!texto) return null;
  try {
    const data = JSON.parse(texto) as TreinoRascunho;
    if (
      data.versao !== 1 ||
      data.usuarioId !== usuarioId ||
      data.planId !== planId ||
      data.sessao?.plan_id !== planId ||
      !data.sessao?.id ||
      !Array.isArray(data.series) ||
      !Array.isArray(data.exercicios)
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export async function apagarRascunho(usuarioId: string, planId: string) {
  const tarefa = fila
    .catch(() => {})
    .then(() => AsyncStorage.removeItem(chave(usuarioId, planId)));
  fila = tarefa.catch(() => {});
  await tarefa;
}

/** UUID salvo ANTES de enviar. Repetir a requisição usa o mesmo ID no PK. */
export function novoIdSerie(): string {
  const bytes = new Uint8Array(16);
  const cryptoWeb =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoWeb?.getRandomValues) cryptoWeb.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Combina servidor + rascunho. Operações locais pendentes prevalecem até confirmação. */
export function mesclarSeries<T extends SerieRascunho>(
  padrao: T[],
  remotas: Array<{
    id: string;
    exercise_id: string | null;
    set_number: number;
    reps: number;
    weight_kg: number;
  }>,
  local?: TreinoRascunho | null,
): T[] {
  const doServidor = new Map(
    remotas.map((item) => [`${item.exercise_id}:${item.set_number}`, item]),
  );
  const doAparelho = new Map(
    (local?.series ?? []).map((item) => [item.chave, item]),
  );
  return padrao.map((padraoItem) => {
    const localItem = doAparelho.get(padraoItem.chave);
    const remoto = doServidor.get(padraoItem.chave);
    if (localItem?.pendente === "salvar")
      return { ...padraoItem, ...localItem };
    if (localItem?.pendente === "remover")
      return { ...padraoItem, ...localItem, concluida: false };
    if (remoto)
      return {
        ...padraoItem,
        reps: String(remoto.reps),
        weight_kg: String(remoto.weight_kg),
        concluida: true,
        registroId: remoto.id,
        pendente: undefined,
      };
    return {
      ...padraoItem,
      ...(localItem
        ? {
            reps: localItem.reps,
            weight_kg: localItem.weight_kg,
          }
        : {}),
      concluida: false,
      registroId: undefined,
      pendente: undefined,
    };
  });
}
