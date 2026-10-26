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
  /** Reenvio explícito permite reparar apenas uma conclusão incompleta. */
  reenvioSolicitado?: boolean;
  /** Estado da sessão, independente da fila de detalhes/modelo ainda não enviada. */
  encerradaNoServidor?: { finishedAt: string | null };
  sessaoConfirmadaNoServidor?: boolean;
  exclusaoSolicitada?: boolean;
  criacaoPendente?: boolean;
  novaSessaoAtiva?: boolean;
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
  /** Início da espera após confirmar; não altera o horário real do treino. */
  envioIniciadoEm?: string;
  notes: string;
  metricas: Record<string, string | number | null>;
  modelo?: ModeloTreinoPendente;
};
export type ModeloTreinoPendente = {
  modo: "novo" | "adicionar";
  planId: string;
  nome: string;
  exercicios: {
    id: string;
    origemId: string;
    name: string;
    sets_goal: number;
    reps_goal: string;
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
  return () => {
    ouvintes.delete(ouvinte);
  };
}
function notificar() {
  ouvintes.forEach((ouvinte) => {
    try {
      ouvinte();
    } catch {
      /* UI isolada */
    }
  });
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
      if (
        await AsyncStorage.getItem(
          chaveEncerrada(rascunho.usuarioId, rascunho.sessao.id),
        )
      )
        return;
      if (
        await AsyncStorage.getItem(
          chaveExclusao(rascunho.usuarioId, rascunho.sessao.id),
        )
      )
        return;
      const texto = await AsyncStorage.getItem(
        chave(rascunho.usuarioId, rascunho.planId),
      );
      const atual = texto ? (JSON.parse(texto) as TreinoRascunho) : null;
      // Depois da conclusão, só a fila atômica de sincronização altera os dados.
      if (
        atual?.sessao.id === rascunho.sessao.id &&
        (atual.finalizacao ||
          atual.encerradaNoServidor ||
          atual.exclusaoSolicitada)
      )
        return;
      await AsyncStorage.setItem(
        chave(rascunho.usuarioId, rascunho.planId),
        JSON.stringify(
          atual?.sessao.id === rascunho.sessao.id &&
            atual.sessaoConfirmadaNoServidor
            ? {
                ...rascunho,
                sessaoConfirmadaNoServidor: true,
                criacaoPendente: false,
              }
            : rascunho,
        ),
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
    .then(() =>
      AsyncStorage.removeItem(chave(usuarioId, planId)).then(notificar),
    );
  fila = tarefa.catch(() => {});
  await tarefa;
}

/** Leitura e alteração entram na mesma fila: confirmações não apagam edições novas. */
export function atualizarRascunho(
  usuarioId: string,
  planId: string,
  alterar: (atual: TreinoRascunho) => TreinoRascunho | null,
): Promise<TreinoRascunho | null> {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
      if (!texto) return null;
      const atual = JSON.parse(texto) as TreinoRascunho;
      if (atual.usuarioId !== usuarioId || atual.planId !== planId) return null;
      const proximo = alterar(atual);
      if (proximo) {
        await AsyncStorage.setItem(
          chave(usuarioId, planId),
          JSON.stringify(proximo),
        );
        if (proximo.encerradaNoServidor)
          await AsyncStorage.setItem(
            chaveEncerrada(usuarioId, proximo.sessao.id),
            "1",
          );
      } else {
        await AsyncStorage.setItem(
          chaveEncerrada(usuarioId, atual.sessao.id),
          "1",
        );
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

type ExclusaoTreino = {
  usuarioId: string;
  sessaoId: string;
  estado: "solicitada" | "confirmada";
  solicitadaEm: string;
};
function chaveExclusao(usuarioId: string, sessaoId: string) {
  return `@treino-familia:exclusao:v1:${usuarioId}:${sessaoId}`;
}
export async function lerExclusaoTreino(
  usuarioId: string,
  sessaoId: string,
): Promise<ExclusaoTreino | null> {
  await fila.catch(() => {});
  const texto = await AsyncStorage.getItem(chaveExclusao(usuarioId, sessaoId));
  if (!texto) return null;
  const registro = JSON.parse(texto) as ExclusaoTreino;
  return registro.usuarioId === usuarioId && registro.sessaoId === sessaoId
    ? registro
    : null;
}
export async function listarExclusoesPendentes(
  usuarioId: string,
): Promise<ExclusaoTreino[]> {
  await fila.catch(() => {});
  const prefixo = `@treino-familia:exclusao:v1:${usuarioId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((item) =>
    item.startsWith(prefixo),
  );
  const itens = await Promise.all(
    chaves.map(
      async (item) =>
        JSON.parse((await AsyncStorage.getItem(item))!) as ExclusaoTreino,
    ),
  );
  return itens.filter(
    (item) => item.usuarioId === usuarioId && item.estado === "solicitada",
  );
}
/** O pedido de exclusão tem prioridade sobre qualquer reenvio do mesmo ID. */
export function registrarExclusaoTreino(usuarioId: string, sessaoId: string) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const prefixo = `@treino-familia:rascunho:v1:${usuarioId}:`;
      const chaves = (await AsyncStorage.getAllKeys()).filter((item) =>
        item.startsWith(prefixo),
      );
      for (const item of chaves) {
        const texto = await AsyncStorage.getItem(item);
        if (!texto) continue;
        const atual = JSON.parse(texto) as TreinoRascunho;
        if (atual.usuarioId !== usuarioId || atual.sessao.id !== sessaoId)
          continue;
        const destino = `@treino-familia:recuperacao:v1:${usuarioId}:${atual.planId}:${sessaoId}:exclusao`;
        if (
          !(await AsyncStorage.getItem(destino)) &&
          !(await AsyncStorage.getItem(chaveCopiaExcluida(destino)))
        )
          await AsyncStorage.setItem(
            destino,
            JSON.stringify({
              rascunho: atual,
              remota: null,
              arquivadoEm: new Date().toISOString(),
            }),
          );
        await AsyncStorage.setItem(
          item,
          JSON.stringify({ ...atual, exclusaoSolicitada: true }),
        );
      }
      const destino = chaveExclusao(usuarioId, sessaoId);
      if (!(await AsyncStorage.getItem(destino)))
        await AsyncStorage.setItem(
          destino,
          JSON.stringify({
            usuarioId,
            sessaoId,
            estado: "solicitada",
            solicitadaEm: new Date().toISOString(),
          }),
        );
      await AsyncStorage.setItem(chaveEncerrada(usuarioId, sessaoId), "1");
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}
export function confirmarExclusaoTreino(usuarioId: string, sessaoId: string) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const destino = chaveExclusao(usuarioId, sessaoId);
      const texto = await AsyncStorage.getItem(destino);
      if (!texto)
        throw new Error(
          "Não foi possível encontrar o pedido local de exclusão.",
        );
      const registro = JSON.parse(texto) as ExclusaoTreino;
      if (registro.usuarioId !== usuarioId || registro.sessaoId !== sessaoId)
        throw new Error("Pedido de exclusão de outra conta.");
      await AsyncStorage.setItem(
        destino,
        JSON.stringify({ ...registro, estado: "confirmada" }),
      );
      const prefixo = `@treino-familia:rascunho:v1:${usuarioId}:`;
      for (const item of (await AsyncStorage.getAllKeys()).filter((chave) =>
        chave.startsWith(prefixo),
      )) {
        const atual = JSON.parse(
          (await AsyncStorage.getItem(item))!,
        ) as TreinoRascunho;
        if (atual?.usuarioId === usuarioId && atual.sessao?.id === sessaoId)
          await AsyncStorage.removeItem(item);
      }
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}

export async function sessaoFoiEncerrada(
  usuarioId: string,
  sessaoId: string,
): Promise<boolean> {
  await fila.catch(() => {});
  return Boolean(
    await AsyncStorage.getItem(chaveEncerrada(usuarioId, sessaoId)),
  );
}

export function marcarSessaoEncerrada(
  usuarioId: string,
  planId: string,
  sessaoId: string,
  finishedAt: string | null,
) {
  return atualizarRascunho(usuarioId, planId, (atual) =>
    atual.sessao.id !== sessaoId
      ? atual
      : { ...atual, encerradaNoServidor: { finishedAt } },
  );
}

/** Acrescenta a conclusão à versão mais recente, incluindo confirmações em voo. */
export async function guardarConclusao(
  usuarioId: string,
  planId: string,
  sessaoId: string,
  finalizacao: FinalizacaoTreino,
) {
  const salvo = await atualizarRascunho(usuarioId, planId, (atual) => {
    if (atual.sessao.id !== sessaoId)
      throw new Error("A sessão mudou. Reabra o treino antes de concluir.");
    return atual.finalizacao ? atual : { ...atual, finalizacao };
  });
  if (!salvo)
    throw new Error(
      "Não foi possível encontrar o rascunho local. Reabra o treino.",
    );
  return salvo;
}

type EstadoSessaoCopiada = {
  finished_at: string | null;
  plan_id: string | null;
  status?: string | null;
} | null;
export type CopiaTreino = {
  id: string;
  rascunho: TreinoRascunho;
  remota: EstadoSessaoCopiada;
  arquivadoEm: string;
};

function chaveCopiaExcluida(id: string) {
  return `@treino-familia:copia-excluida:v1:${id}`;
}

async function guardarCopia(
  atual: TreinoRascunho,
  remota: EstadoSessaoCopiada,
) {
  const destino = `@treino-familia:recuperacao:v1:${atual.usuarioId}:${atual.planId}:${atual.sessao.id}`;
  // Repetir a tentativa nunca substitui o snapshot original pela versão já reparada.
  if (
    !(await AsyncStorage.getItem(destino)) &&
    !(await AsyncStorage.getItem(chaveCopiaExcluida(destino)))
  )
    await AsyncStorage.setItem(
      destino,
      JSON.stringify({
        rascunho: atual,
        remota,
        arquivadoEm: new Date().toISOString(),
      }),
    );
}

/** Backup sem retirar a pendência: o envio só termina após confirmação remota. */
export function copiarRascunhoParaReenvio(
  usuarioId: string,
  planId: string,
  sessaoId: string,
  remota: EstadoSessaoCopiada,
) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
      if (!texto) throw new Error("O rascunho local não foi encontrado.");
      const atual = JSON.parse(texto) as TreinoRascunho;
      if (
        atual.usuarioId !== usuarioId ||
        atual.planId !== planId ||
        atual.sessao.id !== sessaoId
      )
        throw new Error("A sessão mudou. Reabra o treino para conferir.");
      await guardarCopia(atual, remota);
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}

/** Backup primeiro. Se qualquer gravação falhar, a sessão continua recuperável. */
export function arquivarConclusaoRemota(
  usuarioId: string,
  planId: string,
  sessaoId: string,
  remota: { finished_at: string; plan_id: string },
) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
      if (!texto) return;
      const atual = JSON.parse(texto) as TreinoRascunho;
      if (
        atual.usuarioId !== usuarioId ||
        atual.planId !== planId ||
        atual.sessao.id !== sessaoId
      )
        throw new Error("O rascunho mudou. Reabra o treino para conferir.");
      await guardarCopia(atual, remota);
      await AsyncStorage.setItem(chaveEncerrada(usuarioId, sessaoId), "1");
      await AsyncStorage.removeItem(chave(usuarioId, planId));
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}

export async function listarCopiasTreino(
  usuarioId: string,
  planId: string,
): Promise<CopiaTreino[]> {
  await fila.catch(() => {});
  const prefixo = `@treino-familia:recuperacao:v1:${usuarioId}:${planId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((item) =>
    item.startsWith(prefixo),
  );
  const textos = await Promise.all(
    chaves.map(async (id) => ({ id, texto: await AsyncStorage.getItem(id) })),
  );
  const copias: CopiaTreino[] = textos
    .filter((item) => Boolean(item.texto))
    .map((item) => ({ ...JSON.parse(item.texto!), id: item.id }))
    .filter(
      (item) =>
        item.rascunho?.usuarioId === usuarioId &&
        item.rascunho?.planId === planId,
    );
  const atual = await lerRascunho(usuarioId, planId);
  if (
    atual?.encerradaNoServidor &&
    !copias.some((copia) => copia.rascunho.sessao.id === atual.sessao.id)
  ) {
    copias.push({
      id: `pendente:${atual.sessao.id}`,
      rascunho: atual,
      remota: {
        plan_id: planId,
        finished_at: atual.encerradaNoServidor.finishedAt,
      },
      arquivadoEm: atual.salvoEm,
    });
  }
  return copias;
}

export async function listarRascunhos(
  usuarioId: string,
): Promise<TreinoRascunho[]> {
  await fila.catch(() => {});
  const prefixo = `@treino-familia:rascunho:v1:${usuarioId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((item) =>
    item.startsWith(prefixo),
  );
  const itens = await Promise.all(
    chaves.map(async (item) => {
      const rascunho = await lerRascunho(usuarioId, item.slice(prefixo.length));
      return rascunho &&
        (await lerExclusaoTreino(usuarioId, rascunho.sessao.id))
        ? { ...rascunho, exclusaoSolicitada: true }
        : rascunho;
    }),
  );
  return itens
    .filter((item): item is TreinoRascunho => item !== null)
    .sort(
      (a, b) =>
        Date.parse(b.sessao.started_at) - Date.parse(a.sessao.started_at),
    );
}

export async function lerResumoTreinoAtivo(
  usuarioId: string,
): Promise<ResumoTreinoAtivo | null> {
  const rascunho = (await listarRascunhos(usuarioId)).find(
    (item) => !item.encerradaNoServidor && !item.exclusaoSolicitada,
  );
  return rascunho
    ? {
        planId: rascunho.planId,
        planName: rascunho.planName,
        sessaoId: rascunho.sessao.id,
        startedAt: rascunho.sessao.started_at,
        seriesConcluidas: rascunho.series.filter((serie) => serie.concluida)
          .length,
        totalSeries: rascunho.series.filter((serie) => !serie.excluida).length,
        descanso: rascunho.descanso,
        finalizacaoPendente: Boolean(rascunho.finalizacao),
        pendencias:
          rascunho.series.filter((serie) => serie.pendente).length +
          Number(Boolean(rascunho.finalizacao)),
        conflito: Boolean(rascunho.conflitoSincronizacao),
      }
    : null;
}

export function segundosDeDescanso(
  descanso?: DescansoTreino,
  agora = Date.now(),
): number {
  if (!descanso) return 0;
  return descanso.pausado
    ? Math.max(0, descanso.segundosPausados)
    : descanso.fimEm === null
      ? 0
      : Math.max(0, Math.ceil((descanso.fimEm - agora) / 1000));
}

export function mesmaOperacao(a: SerieRascunho, b: SerieRascunho): boolean {
  return (
    a.chave === b.chave &&
    a.pendente === b.pendente &&
    a.registroId === b.registroId &&
    a.reps === b.reps &&
    a.weight_kg === b.weight_kg &&
    a.concluida === b.concluida &&
    a.avulsa === b.avulsa &&
    a.excluida === b.excluida
  );
}

export type SerieAnterior = {
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
};
/** Cópia explícita para o rascunho; séries concluídas ou com envio pendente são intocáveis. */
export function copiarSeriesAnteriores<T extends SerieRascunho>(
  series: T[],
  anteriores: SerieAnterior[],
  exercicioId: string,
): T[] {
  const porNumero = new Map(
    anteriores
      .filter((serie) => serie.exercise_id === exercicioId)
      .map((serie) => [serie.set_number, serie]),
  );
  return series.map((serie) => {
    const anterior = porNumero.get(serie.set_number);
    if (
      serie.exercise_id !== exercicioId ||
      serie.excluida ||
      serie.concluida ||
      serie.pendente ||
      !anterior ||
      !Number.isInteger(anterior.reps) ||
      anterior.reps < 1 ||
      anterior.reps > 1000 ||
      !Number.isFinite(anterior.weight_kg) ||
      anterior.weight_kg < 0 ||
      anterior.weight_kg > 2000
    )
      return serie;
    return {
      ...serie,
      reps: String(anterior.reps),
      weight_kg: String(anterior.weight_kg),
    };
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
    const remoto =
      localItem?.avulsa && localItem.registroId
        ? porId.get(localItem.registroId)
        : doServidor.get(padraoItem.chave);
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
        baseRemota: {
          id: remoto.id,
          reps: remoto.reps,
          weight_kg: remoto.weight_kg,
        },
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

/** Só arquiva localmente; não altera nem exclui o histórico do Supabase. */
export function arquivarParaNovoTreino(
  usuarioId: string,
  planId: string,
  sessaoId: string,
  remota: EstadoSessaoCopiada,
) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
      if (!texto) return;
      const atual = JSON.parse(texto) as TreinoRascunho;
      if (atual.usuarioId !== usuarioId || atual.sessao.id !== sessaoId)
        throw new Error("A sessão mudou. Abra novamente o treino.");
      const id = `@treino-familia:recuperacao:v1:${usuarioId}:${planId}:${sessaoId}:novo:${novoIdSerie()}`;
      await AsyncStorage.setItem(
        id,
        JSON.stringify({
          rascunho: atual,
          remota,
          arquivadoEm: new Date().toISOString(),
        }),
      );
      await AsyncStorage.setItem(chaveEncerrada(usuarioId, sessaoId), "1");
      await AsyncStorage.removeItem(chave(usuarioId, planId));
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}

export function excluirCopiaTreino(
  usuarioId: string,
  planId: string,
  copia: CopiaTreino,
) {
  const tarefa = fila
    .catch(() => {})
    .then(async () => {
      const prefixo = `@treino-familia:recuperacao:v1:${usuarioId}:${planId}:`;
      if (
        copia.rascunho.usuarioId !== usuarioId ||
        copia.rascunho.planId !== planId ||
        (!copia.id.startsWith(prefixo) &&
          copia.id !== `pendente:${copia.rascunho.sessao.id}`)
      )
        throw new Error("Cópia de outra conta ou treino.");
      const sessaoId = copia.rascunho.sessao.id;
      const ids = copia.id.startsWith(prefixo)
        ? [copia.id]
        : (await AsyncStorage.getAllKeys()).filter((id) =>
            id.startsWith(prefixo),
          );
      for (const id of ids) {
        const texto = await AsyncStorage.getItem(id);
        if (!texto) continue;
        const salva = JSON.parse(texto) as CopiaTreino;
        if (
          salva.rascunho?.usuarioId !== usuarioId ||
          salva.rascunho.planId !== planId ||
          salva.rascunho.sessao.id !== sessaoId
        )
          continue;
        await AsyncStorage.setItem(chaveCopiaExcluida(id), "1");
        await AsyncStorage.removeItem(id);
      }
      await AsyncStorage.setItem(chaveCopiaExcluida(prefixo + sessaoId), "1");
      const texto = await AsyncStorage.getItem(chave(usuarioId, planId));
      const atual = texto ? (JSON.parse(texto) as TreinoRascunho) : null;
      if (atual?.sessao.id === sessaoId && atual.encerradaNoServidor) {
        await AsyncStorage.setItem(chaveEncerrada(usuarioId, sessaoId), "1");
        await AsyncStorage.removeItem(chave(usuarioId, planId));
      }
      notificar();
    });
  fila = tarefa.catch(() => {});
  return tarefa;
}

/** Cópia vira outra sessão: nenhum ID de registro ou conclusão é reutilizado. */
export function novaSessaoDaCopia(
  copia: CopiaTreino,
  usuarioId: string,
  planId: string,
  planName: string,
  originais: PlanoExercicio[] = [],
): TreinoRascunho {
  if (
    copia.rascunho.usuarioId !== usuarioId ||
    copia.rascunho.planId !== planId
  )
    throw new Error("Cópia de outra conta ou treino.");
  const exercicios: PlanoExercicio[] = [];
  const series: SerieRascunho[] = [];
  for (const exercicio of copia.rascunho.exercicios.filter(
    (e) => !e.removido,
  )) {
    const referencias = copia.rascunho.series.filter(
      (s) => s.exercise_id === exercicio.id && !s.excluida,
    );
    if (!referencias.length) continue;
    const avulso = !originais.some((e) => e.id === exercicio.id && !e.removido);
    const id = avulso ? novoIdSerie() : exercicio.id;
    exercicios.push({
      id,
      name: exercicio.name,
      sets_goal: referencias.length,
      reps_goal: exercicio.reps_goal,
      avulso,
    });
    referencias.forEach((serie, i) =>
      series.push({
        chave: `${id}:${i + 1}`,
        exercise_id: id,
        exercise_name: exercicio.name,
        set_number: i + 1,
        reps: serie.reps,
        weight_kg: serie.weight_kg,
        concluida: false,
        avulsa: avulso,
      }),
    );
  }
  if (!exercicios.length)
    throw new Error("Esta cópia não contém exercícios disponíveis.");
  const agora = new Date().toISOString();
  return {
    versao: 1,
    usuarioId,
    planId,
    planName,
    sessao: { id: novoIdSerie(), plan_id: planId, started_at: agora },
    exercicios,
    series,
    intensidade: copia.rascunho.intensidade,
    esforco: "nao_informado",
    salvoEm: agora,
    criacaoPendente: true,
    novaSessaoAtiva: true,
  };
}
