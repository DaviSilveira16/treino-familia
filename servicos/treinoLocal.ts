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
  baseRemota?: { id: string; reps: number; weight_kg: number };
  /** Exercício criado nesta sessão; no histórico usa snapshot sem FK de plano. */
  avulsa?: boolean;
  excluida?: boolean;
};
export type PlanoExercicio = {
  id: string;
  name: string;
  sets_goal: number;
  reps_goal: string;
  avulso?: boolean;
  removido?: boolean;
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
  descanso?: DescansoTreino;
  finalizacao?: FinalizacaoTreino;
  erroSincronizacao?: string;
  conflitoSincronizacao?: boolean;
  conflitoSessao?: boolean;
  criacaoPendente?: boolean;
};

export type DescansoTreino = {
  fimEm: number | null;
  pausado: boolean;
  segundosPausados: number;
  duracao: number;
};
export type FinalizacaoTreino = {
  /** Momento real do toque em finalizar, jamais o momento da sincronização. */
  finishedAt: string;
  notes: string;
  metricas: Record<string, string | number | null>;
  modelo?: ModeloTreinoPendente;
};
export type ModeloTreinoPendente = {
  modo: "novo" | "adicionar";
  planId: string;
  nome: string;
  exercicios: {
    id: string; origemId: string; name: string; sets_goal: number; reps_goal: string;
    series: { set_number: number; reps: number; weight_kg: number }[];
  }[];
};
export type ResumoTreinoAtivo = {
  planId: string;
  planName: string;
  sessaoId: string;
  startedAt: string;
  seriesConcluidas: number;
  totalSeries: number;
  descanso?: DescansoTreino;
  finalizacaoPendente: boolean;
  pendencias: number;
  conflito: boolean;
};

const ouvintes = new Set<() => void>();
export function assinarRascunhos(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}
function notificar() {
  ouvintes.forEach((ouvinte) => { try { ouvinte(); } catch { /* UI isolada */ } });
}

function chave(usuarioId: string, planId: string) {
  return `@treino-familia:rascunho:v1:${usuarioId}:${planId}`;
}

// Escritas serializadas: uma gravação antiga nunca deve passar à frente da nova.
let fila: Promise<unknown> = Promise.resolve();
export function gravarRascunho(rascunho: TreinoRascunho): Promise<void> {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      // Uma tela antiga não pode ressuscitar uma sessão já confirmada.
      if (await AsyncStorage.getItem(chaveEncerrada(rascunho.usuarioId, rascunho.sessao.id))) return;
      const texto = await AsyncStorage.getItem(chave(rascunho.usuarioId, rascunho.planId));
      const atual = texto ? JSON.parse(texto) as TreinoRascunho : null;
      // Depois da conclusão, só a fila atômica de sincronização altera os dados.
      if (atual?.sessao.id === rascunho.sessao.id && atual.finalizacao) return;
      await AsyncStorage.setItem(
        chave(rascunho.usuarioId, rascunho.planId),
        JSON.stringify(rascunho),
      );
      notificar();
    });
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
    .then(() => AsyncStorage.removeItem(chave(usuarioId, planId)).then(notificar));
  fila = tarefa.catch(() => {});
  await tarefa;
}

/** Leitura e alteração entram na mesma fila: confirmações não apagam edições novas. */
export function atualizarRascunho(
  usuarioId: string,
  planId: string,
  alterar: (atual: TreinoRascunho) => TreinoRascunho | null,
): Promise<TreinoRascunho | null> {
  const tarefa = fila.catch(() => {}).then(async () => {
    const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
    if (!texto) return null;
    const atual = JSON.parse(texto) as TreinoRascunho;
    if (atual.usuarioId !== usuarioId || atual.planId !== planId) return null;
    const proximo = alterar(atual);
    if (proximo) await AsyncStorage.setItem(chave(usuarioId, planId), JSON.stringify(proximo));
    else {
      await AsyncStorage.setItem(chaveEncerrada(usuarioId, atual.sessao.id), "1");
      await AsyncStorage.removeItem(chave(usuarioId, planId));
    }
    notificar();
    return proximo;
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

function chaveEncerrada(usuarioId: string, sessaoId: string) {
  return `@treino-familia:encerrada:v1:${usuarioId}:${sessaoId}`;
}

/** Acrescenta a conclusão à versão mais recente, incluindo confirmações em voo. */
export async function guardarConclusao(usuarioId: string, planId: string, sessaoId: string, finalizacao: FinalizacaoTreino) {
  const salvo = await atualizarRascunho(usuarioId, planId, atual => {
    if (atual.sessao.id !== sessaoId) throw new Error("A sessão mudou. Reabra o treino antes de concluir.");
    return atual.finalizacao ? atual : { ...atual, finalizacao };
  });
  if (!salvo) throw new Error("Não foi possível encontrar o rascunho local. Reabra o treino.");
  return salvo;
}

/** Backup primeiro. Se qualquer gravação falhar, a sessão continua recuperável. */
export function arquivarConclusaoRemota(usuarioId: string, planId: string, sessaoId: string, remota: { finished_at: string; plan_id: string }) {
  const tarefa = fila.catch(() => {}).then(async () => {
    const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
    if (!texto) return;
    const atual = JSON.parse(texto) as TreinoRascunho;
    if (atual.usuarioId !== usuarioId || atual.planId !== planId || atual.sessao.id !== sessaoId) throw new Error("O rascunho mudou. Reabra o treino para conferir.");
    await AsyncStorage.setItem(`@treino-familia:recuperacao:v1:${usuarioId}:${planId}:${sessaoId}`, JSON.stringify({ rascunho: atual, remota, arquivadoEm: new Date().toISOString() }));
    await AsyncStorage.setItem(chaveEncerrada(usuarioId, sessaoId), "1");
    await AsyncStorage.removeItem(chave(usuarioId, planId));
    notificar();
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

export async function listarCopiasTreino(usuarioId: string, planId: string): Promise<{ rascunho: TreinoRascunho; remota: { finished_at: string; plan_id: string }; arquivadoEm: string }[]> {
  await fila.catch(() => {});
  const prefixo = `@treino-familia:recuperacao:v1:${usuarioId}:${planId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter(item => item.startsWith(prefixo));
  const textos = await Promise.all(chaves.map(item => AsyncStorage.getItem(item)));
  return textos.filter((item): item is string => Boolean(item)).map(item => JSON.parse(item))
    .filter(item => item.rascunho?.usuarioId === usuarioId && item.rascunho?.planId === planId);
}

export async function listarRascunhos(usuarioId: string): Promise<TreinoRascunho[]> {
  await fila.catch(() => {});
  const prefixo = `@treino-familia:rascunho:v1:${usuarioId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((item) => item.startsWith(prefixo));
  const itens = await Promise.all(chaves.map((item) => lerRascunho(usuarioId, item.slice(prefixo.length))));
  return itens.filter((item): item is TreinoRascunho => item !== null)
    .sort((a, b) => Date.parse(b.sessao.started_at) - Date.parse(a.sessao.started_at));
}

export async function lerResumoTreinoAtivo(usuarioId: string): Promise<ResumoTreinoAtivo | null> {
  const [rascunho] = await listarRascunhos(usuarioId);
  return rascunho ? {
    planId: rascunho.planId, planName: rascunho.planName,
    sessaoId: rascunho.sessao.id, startedAt: rascunho.sessao.started_at,
    seriesConcluidas: rascunho.series.filter((serie) => serie.concluida).length,
    totalSeries: rascunho.series.filter((serie) => !serie.excluida).length, descanso: rascunho.descanso,
    finalizacaoPendente: Boolean(rascunho.finalizacao),
    pendencias: rascunho.series.filter((serie) => serie.pendente).length + Number(Boolean(rascunho.finalizacao)),
    conflito: Boolean(rascunho.conflitoSincronizacao),
  } : null;
}

export function segundosDeDescanso(descanso?: DescansoTreino, agora = Date.now()): number {
  if (!descanso) return 0;
  return descanso.pausado ? Math.max(0, descanso.segundosPausados)
    : descanso.fimEm === null ? 0 : Math.max(0, Math.ceil((descanso.fimEm - agora) / 1000));
}

export function mesmaOperacao(a: SerieRascunho, b: SerieRascunho): boolean {
  return a.chave === b.chave && a.pendente === b.pendente && a.registroId === b.registroId
    && a.reps === b.reps && a.weight_kg === b.weight_kg && a.concluida === b.concluida
    && a.avulsa === b.avulsa && a.excluida === b.excluida;
}

export type SerieAnterior = { exercise_id: string; set_number: number; reps: number; weight_kg: number };
/** Cópia explícita para o rascunho; séries concluídas ou com envio pendente são intocáveis. */
export function copiarSeriesAnteriores<T extends SerieRascunho>(series: T[], anteriores: SerieAnterior[], exercicioId: string): T[] {
  const porNumero = new Map(anteriores.filter((serie) => serie.exercise_id === exercicioId).map((serie) => [serie.set_number, serie]));
  return series.map((serie) => {
    const anterior = porNumero.get(serie.set_number);
    if (serie.exercise_id !== exercicioId || serie.excluida || serie.concluida || serie.pendente || !anterior
      || !Number.isInteger(anterior.reps) || anterior.reps < 1 || anterior.reps > 1000
      || !Number.isFinite(anterior.weight_kg) || anterior.weight_kg < 0 || anterior.weight_kg > 2000) return serie;
    return { ...serie, reps: String(anterior.reps), weight_kg: String(anterior.weight_kg) };
  });
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
  const porId = new Map(remotas.map((item) => [item.id, item]));
  return padrao.map((padraoItem) => {
    const localItem = doAparelho.get(padraoItem.chave);
    const remoto = localItem?.avulsa && localItem.registroId ? porId.get(localItem.registroId) : doServidor.get(padraoItem.chave);
    if (localItem?.excluida) return { ...padraoItem, ...localItem };
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
        baseRemota: { id: remoto.id, reps: remoto.reps, weight_kg: remoto.weight_kg },
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
