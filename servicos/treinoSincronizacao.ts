import { supabase } from "../supabase";
import { registrarMudancaDeDados } from "./revisaoDados";
import {
  arquivarParaNovoTreino,
  arquivarConclusaoRemota,
  copiarRascunhoParaReenvio,
  marcarSessaoEncerrada,
  atualizarRascunho,
  lerRascunho,
  listarRascunhos,
  mesmaOperacao,
  novoIdSerie,
  lerExclusaoTreino,
  listarExclusoesPendentes,
  registrarExclusaoTreino,
  confirmarExclusaoTreino,
  type TreinoRascunho,
} from "./treinoLocal";
import {
  salvarModeloDoTreino,
  ConflitoModeloTreino,
} from "./salvarModeloTreino";

export type ResultadoSincronizacao = {
  rascunho: TreinoRascunho | null;
  concluido: boolean;
  erro?: string;
  conflito?: boolean;
  conflitoSessao?: boolean;
  encerrado?: boolean;
  adiado?: boolean;
};
class ConflitoTreino extends Error {}
class ConflitoSessao extends ConflitoTreino {}
class ExclusaoSolicitada extends Error {}
const emEnvio = new Map<string, Promise<ResultadoSincronizacao>>();
const filasPausadas = new Set<string>();
const exclusoesEmAndamento = new Map<string, Promise<void>>();

async function garantirEnvioPermitido(usuarioId: string, sessaoId: string) {
  if (await lerExclusaoTreino(usuarioId, sessaoId))
    throw new ExclusaoSolicitada(
      "A exclusão desta sessão tem prioridade sobre o reenvio.",
    );
}

type SessaoRemota = {
  plan_id: string | null;
  status: string | null;
  finished_at?: string | null;
};
function mensagemErro(erro: unknown): string {
  // PostgREST retorna objetos simples, não instâncias de Error.
  return erro &&
    typeof erro === "object" &&
    "message" in erro &&
    typeof erro.message === "string"
    ? erro.message
    : "Não foi possível enviar o treino. Seus dados continuam guardados neste aparelho.";
}
function mensagemEstado(sessao: SessaoRemota | null): string {
  if (!sessao)
    return "Esta sessão não foi encontrada no servidor. Use Enviar treino salvo neste aparelho para restaurar suas séries e o horário original.";
  if (sessao.status === "em_andamento")
    return "A sessão ainda está em andamento no servidor. Use Enviar treino salvo neste aparelho para concluir o envio.";
  if (
    !sessao.finished_at &&
    (sessao.status === null || sessao.status === "concluido")
  )
    return "O registro no servidor está incompleto, sem horário de conclusão. Use Enviar treino salvo neste aparelho para repará-lo.";
  return "A sessão no servidor tem outro estado, treino ou horário. Seus dados locais estão preservados. Confira o histórico antes de usar a conclusão remota.";
}

/** Não reabre sessões e só reconhece como nossa a conclusão com a mesma data. */
export function situacaoConclusao(
  sessao: SessaoRemota | null,
  rascunho: Pick<TreinoRascunho, "planId" | "finalizacao">,
): "ativa" | "confirmada" | "conflito" {
  if (!sessao) return "conflito";
  const modelo = rascunho.finalizacao?.modelo;
  if (
    sessao.plan_id !== rascunho.planId &&
    !(modelo?.modo === "novo" && sessao.plan_id === modelo.planId)
  )
    return "conflito";
  if (sessao.status === "em_andamento" && sessao.plan_id === rascunho.planId)
    return "ativa";
  if (
    sessao.status === "concluido" &&
    rascunho.finalizacao &&
    Date.parse(sessao.finished_at ?? "") ===
      Date.parse(rascunho.finalizacao.finishedAt)
  )
    return "confirmada";
  return "conflito";
}

/** A fila é independente da tela: pode ser retomada pela Home ou pela mini barra. */
export function sincronizarRascunho(
  usuarioId: string,
  planId: string,
  permitirSobrescrever = false,
): Promise<ResultadoSincronizacao> {
  if (filasPausadas.has(usuarioId))
    return Promise.resolve({ rascunho: null, concluido: false, adiado: true });
  const chave = `${usuarioId}:${planId}`;
  const atual = emEnvio.get(chave);
  if (atual) return atual;
  const tarefa = enviar(usuarioId, planId, permitirSobrescrever).finally(() =>
    emEnvio.delete(chave),
  );
  emEnvio.set(chave, tarefa);
  return tarefa;
}

async function enviar(
  usuarioId: string,
  planId: string,
  permitirSobrescrever: boolean,
): Promise<ResultadoSincronizacao> {
  let local = await lerRascunho(usuarioId, planId);
  if (!local) return { rascunho: null, concluido: false };
  const sessaoId = local.sessao.id;
  try {
    const exclusao = await lerExclusaoTreino(usuarioId, sessaoId);
    if (exclusao?.estado === "confirmada") {
      await confirmarExclusaoTreino(usuarioId, sessaoId);
      return { rascunho: null, concluido: false, encerrado: true };
    }
    if (local.exclusaoSolicitada) throw new ExclusaoSolicitada();
    await garantirEnvioPermitido(usuarioId, sessaoId);
    const { data: autenticado, error: erroAuth } =
      await supabase.auth.getUser();
    if (erroAuth || autenticado.user?.id !== usuarioId)
      throw new Error(
        "Entre novamente na sua conta para sincronizar este treino.",
      );
    let { data: remota, error: erroSessao } = await supabase
      .from("workout_sessions")
      .select("id, plan_id, status, finished_at")
      .eq("id", sessaoId)
      .eq("user_id", usuarioId)
      .maybeSingle();
    if (erroSessao) throw erroSessao;
    if (
      !remota &&
      (local.sessaoConfirmadaNoServidor || local.encerradaNoServidor)
    ) {
      // Uma sessão que comprovadamente existiu e desapareceu não é uma criação
      // offline nova. Preserva a cópia e respeita a exclusão feita em outro fluxo.
      await registrarExclusaoTreino(usuarioId, sessaoId);
      await confirmarExclusaoTreino(usuarioId, sessaoId);
      registrarMudancaDeDados();
      return { rascunho: null, concluido: false, encerrado: true };
    }
    if (
      remota &&
      (!local.sessaoConfirmadaNoServidor || local.criacaoPendente)
    ) {
      local = await atualizarRascunho(usuarioId, planId, (atual) =>
        atual.sessao.id !== sessaoId
          ? atual
          : {
              ...atual,
              sessaoConfirmadaNoServidor: true,
              criacaoPendente: false,
            },
      );
      if (!local || local.sessao.id !== sessaoId)
        throw new Error("O rascunho mudou durante a confirmação da sessão.");
    }
    if (remota?.status === "concluido") {
      // A sessão já terminou, mesmo se um envio posterior de detalhes falhar.
      local = await marcarSessaoEncerrada(
        usuarioId,
        planId,
        sessaoId,
        remota.finished_at ?? null,
      );
      if (!local || local.sessao.id !== sessaoId)
        throw new Error("A sessão local mudou durante a conferência.");
      if (
        Number.isFinite(Date.parse(remota.finished_at ?? "")) &&
        remota.plan_id &&
        (situacaoConclusao(remota, local) !== "confirmada" ||
          local.series.some((s) => s.pendente))
      ) {
        // Conclusão de outro fluxo/aparelho: não sobrescreve a versão remota.
        // Qualquer diferença local fica integralmente consultável na cópia.
        await arquivarConclusaoRemota(usuarioId, planId, sessaoId, {
          finished_at: remota.finished_at!,
          plan_id: remota.plan_id,
        });
        registrarMudancaDeDados();
        return {
          rascunho: await lerRascunho(usuarioId, planId),
          concluido: true,
          encerrado: true,
        };
      }
    }
    if (
      local.conflitoSincronizacao &&
      local.conflitoSessao === false &&
      !permitirSobrescrever &&
      !local.encerradaNoServidor
    )
      return {
        rascunho: local,
        concluido: false,
        conflito: true,
        conflitoSessao: false,
        erro: local.erroSincronizacao,
      };
    if (
      remota?.status === "em_andamento" &&
      !local.finalizacao &&
      !local.series.some((s) => s.pendente)
    )
      return { rascunho: local, concluido: false };
    if (!remota && local.criacaoPendente) {
      const data = new Date(local.sessao.started_at),
        inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate()),
        fim = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
      const { data: doDia, error: erroDia } = await supabase
        .from("workout_sessions")
        .select("id, plan_id")
        .eq("user_id", usuarioId)
        .gte("started_at", inicio.toISOString())
        .lt("started_at", fim.toISOString())
        .limit(2);
      if (erroDia) throw erroDia;
      if (
        !local.novaSessaoAtiva &&
        doDia?.some((s) => s.id !== sessaoId && s.plan_id)
      )
        throw new ConflitoTreino(
          "Já existe um treino nesta data. Seu registro local foi preservado; confira a Frequência antes de reenviar.",
        );
      const { data: ativas, error: erroAtivas } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("user_id", usuarioId)
        .eq("status", "em_andamento")
        .limit(1);
      if (erroAtivas) throw erroAtivas;
      if (ativas?.some((s) => s.id !== sessaoId))
        throw new Error(
          "Conclua o treino em andamento antes de enviar o registro pela Frequência.",
        );
      await garantirEnvioPermitido(usuarioId, sessaoId);
      const { data: criada, error } = await supabase
        .from("workout_sessions")
        .insert({
          id: sessaoId,
          user_id: usuarioId,
          plan_id: local.planId,
          started_at: local.sessao.started_at,
          status: "em_andamento",
        })
        .select("id, plan_id, status, finished_at")
        .single();
      if (error) throw error;
      remota = criada;
      local = await atualizarRascunho(usuarioId, planId, (atual) =>
        atual.sessao.id !== sessaoId
          ? atual
          : {
              ...atual,
              sessaoConfirmadaNoServidor: true,
              criacaoPendente: false,
            },
      );
      if (!local || local.sessao.id !== sessaoId)
        throw new Error("O rascunho mudou após criar a sessão.");
    }
    const reparar =
      local.reenvioSolicitado &&
      local.finalizacao &&
      remota?.plan_id === planId &&
      remota.finished_at === null &&
      (remota.status === null || remota.status === "concluido");
    const situacao = reparar ? "reparavel" : situacaoConclusao(remota, local);
    if (situacao === "conflito")
      throw new ConflitoSessao(mensagemEstado(remota));
    if (
      situacao === "confirmada" &&
      local.series.some((serie) => serie.pendente)
    )
      throw new ConflitoSessao(
        "O servidor já encerrou esta sessão, mas ainda existem séries locais pendentes. Confira a conclusão no servidor; sua cópia será preservada.",
      );

    for (const item of local.series.filter((serie) => serie.pendente)) {
      await garantirEnvioPermitido(usuarioId, sessaoId);
      let busca = supabase
        .from("workout_sets")
        .select("id, reps, weight_kg")
        .eq("user_id", usuarioId)
        .eq("session_id", sessaoId);
      if (item.avulsa) {
        if (!item.registroId)
          throw new Error(
            "Exercício da sessão sem identificador local. Reabra o treino para conferir.",
          );
        busca = busca.eq("id", item.registroId);
      } else
        busca = busca
          .eq("exercise_id", item.exercise_id)
          .eq("set_number", item.set_number);
      const { data: existentes, error: erroBusca } = await busca.limit(2);
      if (erroBusca) throw erroBusca;
      if ((existentes ?? []).length > 1)
        throw new ConflitoTreino(
          "Há séries duplicadas no servidor. Seu rascunho foi preservado para conferência.",
        );
      const existente = existentes?.[0];
      await garantirEnvioPermitido(usuarioId, sessaoId);
      let registroId: string | undefined;
      if (item.pendente === "remover") {
        if (existente) {
          const base = item.baseRemota ?? {
            id: item.registroId,
            reps: Number(item.reps),
            weight_kg: Number(item.weight_kg.replace(",", ".")),
          };
          if (
            !permitirSobrescrever &&
            (existente.id !== base.id ||
              Number(existente.reps) !== base.reps ||
              Number(existente.weight_kg) !== base.weight_kg)
          ) {
            throw new ConflitoTreino(
              `${item.exercise_name}, série ${item.set_number}: o registro remoto mudou. Confirme antes de removê-lo.`,
            );
          }
          const { data: apagadas, error } = await supabase
            .from("workout_sets")
            .delete()
            .eq("id", existente.id)
            .eq("user_id", usuarioId)
            .eq("session_id", sessaoId)
            .eq("reps", existente.reps)
            .eq("weight_kg", existente.weight_kg)
            .select("id");
          if (error) throw error;
          if (!apagadas?.length)
            throw new ConflitoTreino(
              "A série mudou durante o envio. Confira os dados antes de tentar novamente.",
            );
        }
      } else {
        const reps = Number(item.reps);
        const peso = Number(item.weight_kg.replace(",", "."));
        if (
          !Number.isInteger(reps) ||
          reps < 1 ||
          reps > 1000 ||
          !Number.isFinite(peso) ||
          peso < 0 ||
          peso > 2000
        ) {
          throw new Error(
            `Valores inválidos na série ${item.set_number} de ${item.exercise_name}.`,
          );
        }
        const dados = {
          user_id: usuarioId,
          session_id: sessaoId,
          exercise_id: item.avulsa ? null : item.exercise_id,
          exercise_name: item.exercise_name,
          set_number: item.set_number,
          reps,
          weight_kg: peso,
        };
        const iguais =
          existente &&
          Number(existente.reps) === reps &&
          Number(existente.weight_kg) === peso;
        if (iguais) registroId = existente.id;
        else if (existente) {
          const base = item.baseRemota;
          const mesmaBase =
            base &&
            existente.id === base.id &&
            Number(existente.reps) === base.reps &&
            Number(existente.weight_kg) === base.weight_kg;
          if (!permitirSobrescrever && !mesmaBase)
            throw new ConflitoTreino(
              `${item.exercise_name}, série ${item.set_number}: existem valores diferentes no servidor. Confirme se deseja enviar sua versão local.`,
            );
          const { data, error } = await supabase
            .from("workout_sets")
            .update(dados)
            .eq("id", existente.id)
            .eq("user_id", usuarioId)
            .eq("session_id", sessaoId)
            .eq("reps", existente.reps)
            .eq("weight_kg", existente.weight_kg)
            .select("id")
            .maybeSingle();
          if (error) throw error;
          if (!data)
            throw new ConflitoTreino(
              "A série mudou durante o envio. Seu rascunho foi preservado.",
            );
          registroId = data.id;
        } else {
          if (!item.registroId)
            throw new Error(
              "A série ainda não recebeu um identificador local. Reabra o treino para conferir os dados.",
            );
          // INSERT com UUID estável: uma resposta perdida é reconhecida na consulta acima.
          // Evita upsert sobrescrever uma linha que surgiu depois da leitura.
          const { data, error } = await supabase
            .from("workout_sets")
            .insert({ id: item.registroId, ...dados })
            .select("id")
            .single();
          if (error) throw error;
          registroId = data.id;
        }
      }
      local = await atualizarRascunho(usuarioId, planId, (atual) =>
        atual.sessao.id !== sessaoId
          ? atual
          : {
              ...atual,
              series: atual.series.map((serie) =>
                mesmaOperacao(serie, item)
                  ? {
                      ...serie,
                      pendente: undefined,
                      registroId,
                      baseRemota: registroId
                        ? {
                            id: registroId,
                            reps: Number(item.reps),
                            weight_kg: Number(item.weight_kg.replace(",", ".")),
                          }
                        : undefined,
                    }
                  : serie,
              ),
            },
      );
      if (!local || local.sessao.id !== sessaoId)
        throw new Error(
          "O rascunho mudou durante o envio. Reabra o treino para conferir.",
        );
      registrarMudancaDeDados();
    }
    local = await lerRascunho(usuarioId, planId);
    if (local?.finalizacao && !local.series.some((serie) => serie.pendente)) {
      await garantirEnvioPermitido(usuarioId, sessaoId);
      const finalizacao = local.finalizacao;
      if (situacao !== "confirmada") {
        let encerrar = supabase
          .from("workout_sessions")
          .update({
            finished_at: finalizacao.finishedAt,
            status: "concluido",
            notes: finalizacao.notes,
          })
          .eq("id", sessaoId)
          .eq("plan_id", planId)
          .eq("user_id", usuarioId);
        if (reparar) {
          encerrar = encerrar.is("finished_at", null);
          encerrar =
            remota!.status === null
              ? encerrar.is("status", null)
              : encerrar.eq("status", remota!.status);
        } else encerrar = encerrar.eq("status", "em_andamento");
        const { data, error } = await encerrar.select("id").maybeSingle();
        if (error) throw error;
        if (!data)
          throw new ConflitoTreino(
            "O encerramento mudou durante o envio. A conclusão local foi preservada para conferência.",
          );
        registrarMudancaDeDados();
      }
      local = await marcarSessaoEncerrada(
        usuarioId,
        planId,
        sessaoId,
        finalizacao.finishedAt,
      );
      if (!local || local.sessao.id !== sessaoId)
        throw new Error("A sessão local mudou após a confirmação.");
      // Até a confirmação dos detalhes, a fila continua no disco, inclusive após reabrir.
      await garantirEnvioPermitido(usuarioId, sessaoId);
      const { data: detalhes, error: erroDetalhes } = await supabase
        .from("workout_sessions")
        .update(finalizacao.metricas)
        .eq("id", sessaoId)
        .eq("user_id", usuarioId)
        .eq("status", "concluido")
        .eq("finished_at", finalizacao.finishedAt)
        .select("id")
        .maybeSingle();
      if (erroDetalhes)
        throw new Error(
          "O encerramento foi enviado. Os detalhes permanecem guardados até a próxima sincronização.",
        );
      if (!detalhes)
        throw new ConflitoTreino(
          "O encerramento remoto mudou. Seus detalhes locais continuam preservados.",
        );
      await garantirEnvioPermitido(usuarioId, sessaoId);
      await salvarModeloDoTreino(local);
      await atualizarRascunho(usuarioId, planId, (atual) =>
        atual.sessao.id === sessaoId &&
        atual.finalizacao?.finishedAt === finalizacao.finishedAt &&
        !atual.series.some((serie) => serie.pendente)
          ? null
          : atual,
      );
      registrarMudancaDeDados();
      return {
        rascunho: await lerRascunho(usuarioId, planId),
        concluido: true,
        encerrado: true,
      };
    }
    local = await atualizarRascunho(usuarioId, planId, (atual) => ({
      ...atual,
      erroSincronizacao: undefined,
      conflitoSincronizacao: false,
      conflitoSessao: false,
    }));
    return { rascunho: local, concluido: false };
  } catch (erro) {
    if (erro instanceof ExclusaoSolicitada)
      return {
        rascunho: await lerRascunho(usuarioId, planId),
        concluido: false,
        encerrado: true,
      };
    const mensagem = mensagemErro(erro);
    const conflito =
      erro instanceof ConflitoTreino || erro instanceof ConflitoModeloTreino;
    const conflitoSessao = erro instanceof ConflitoSessao;
    local = await atualizarRascunho(usuarioId, planId, (atual) =>
      atual.sessao.id !== sessaoId
        ? atual
        : {
            ...atual,
            erroSincronizacao: mensagem,
            conflitoSincronizacao: conflito,
            conflitoSessao,
          },
    );
    return {
      rascunho: local,
      concluido: false,
      erro: mensagem,
      conflito,
      conflitoSessao,
      encerrado: Boolean(local?.encerradaNoServidor),
    };
  }
}

/** Restaura a mesma sessão e as séries locais, sem sobrescrever conclusões válidas. */
export async function reenviarConclusaoLocal(
  usuarioId: string,
  planId: string,
): Promise<ResultadoSincronizacao> {
  if (filasPausadas.has(usuarioId))
    return { rascunho: null, concluido: false, adiado: true };
  const chave = `${usuarioId}:${planId}`;
  while (emEnvio.has(chave)) await emEnvio.get(chave);
  if (filasPausadas.has(usuarioId))
    return { rascunho: null, concluido: false, adiado: true };
  const tarefa = (async (): Promise<ResultadoSincronizacao> => {
    const local = await lerRascunho(usuarioId, planId);
    if (!local)
      return {
        rascunho: null,
        concluido: false,
        erro: "Não há treino local para enviar. Confira o histórico.",
      };
    try {
      await garantirEnvioPermitido(usuarioId, local.sessao.id);
      const { data: autenticado, error: erroAuth } =
        await supabase.auth.getUser();
      if (erroAuth || autenticado.user?.id !== usuarioId)
        throw new Error(
          "Entre novamente na sua conta para enviar este treino.",
        );
      const fim = Date.parse(local.finalizacao?.finishedAt ?? ""),
        inicio = Date.parse(local.sessao.started_at);
      if (
        !Number.isFinite(fim) ||
        !Number.isFinite(inicio) ||
        fim < inicio ||
        !local.series.some((s) => s.concluida && !s.excluida)
      )
        throw new Error(
          "Confira o horário e as séries concluídas do treino local antes de reenviar.",
        );
      const { data: remota, error } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, status, finished_at")
        .eq("id", local.sessao.id)
        .eq("user_id", usuarioId)
        .maybeSingle();
      if (error) throw error;
      if (
        !remota &&
        (local.sessaoConfirmadaNoServidor || local.encerradaNoServidor)
      )
        return enviar(usuarioId, planId, false);
      if (remota && situacaoConclusao(remota, local) === "confirmada") {
        // O envio pode já ter terminado e só os detalhes/modelo estarem pendentes.
        await atualizarRascunho(usuarioId, planId, (atual) => ({
          ...atual,
          conflitoSincronizacao: false,
          conflitoSessao: false,
        }));
        return enviar(usuarioId, planId, false);
      }
      if (
        remota &&
        (remota.plan_id !== planId ||
          ![null, "em_andamento", "concluido"].includes(remota.status) ||
          remota.finished_at !== null)
      ) {
        throw new ConflitoSessao(
          "Esta sessão já tem outra conclusão ou foi alterada no servidor. O reenvio não substituiu os dados. Confira o histórico ou use a conclusão remota.",
        );
      }
      const { data: plano, error: erroPlano } = await supabase
        .from("workout_plans")
        .select("id")
        .eq("id", planId)
        .eq("user_id", usuarioId)
        .maybeSingle();
      if (erroPlano) throw erroPlano;
      if (!plano)
        throw new Error(
          "O plano deste treino não foi encontrado na sua conta. A cópia local permanece preservada.",
        );
      await copiarRascunhoParaReenvio(
        usuarioId,
        planId,
        local.sessao.id,
        remota,
      );
      await garantirEnvioPermitido(usuarioId, local.sessao.id);
      await atualizarRascunho(usuarioId, planId, (atual) => {
        if (atual.sessao.id !== local.sessao.id)
          throw new Error("A sessão mudou durante o reenvio.");
        return {
          ...atual,
          reenvioSolicitado: true,
          criacaoPendente: !remota || atual.criacaoPendente,
          conflitoSincronizacao: false,
          conflitoSessao: false,
          erroSincronizacao: undefined,
          // Confirmações antigas não provam que a linha ainda existe. Reconsultar
          // reconhece valores iguais e evita duplicar séries com resposta perdida.
          series: atual.series.map((s) =>
            s.concluida && !s.excluida
              ? {
                  ...s,
                  registroId: s.registroId ?? novoIdSerie(),
                  pendente: "salvar",
                }
              : s,
          ),
        };
      });
      return enviar(usuarioId, planId, false);
    } catch (erro) {
      return {
        rascunho: await lerRascunho(usuarioId, planId),
        concluido: false,
        conflito: true,
        conflitoSessao: true,
        erro: mensagemErro(erro),
      };
    }
  })().finally(() => emEnvio.delete(chave));
  emEnvio.set(chave, tarefa);
  return tarefa;
}

/** Escolha explícita do usuário. Somente leitura remota; nunca reabre ou sobrescreve. */
export async function recuperarConclusaoRemota(
  usuarioId: string,
  planId: string,
): Promise<ResultadoSincronizacao> {
  if (filasPausadas.has(usuarioId))
    return { rascunho: null, concluido: false, adiado: true };
  const chave = `${usuarioId}:${planId}`;
  while (emEnvio.has(chave)) await emEnvio.get(chave);
  if (filasPausadas.has(usuarioId))
    return { rascunho: null, concluido: false, adiado: true };
  const tarefa = (async (): Promise<ResultadoSincronizacao> => {
    const local = await lerRascunho(usuarioId, planId);
    if (!local) return { rascunho: null, concluido: true };
    try {
      const { data, error: erroAuth } = await supabase.auth.getUser();
      if (erroAuth || data.user?.id !== usuarioId)
        throw new Error(
          "Entre novamente na sua conta para conferir a conclusão.",
        );
      const { data: remota, error } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, status, finished_at")
        .eq("id", local.sessao.id)
        .eq("user_id", usuarioId)
        .maybeSingle();
      if (error) throw error;
      if (
        remota?.status !== "concluido" ||
        !remota.plan_id ||
        !Number.isFinite(Date.parse(remota.finished_at ?? ""))
      ) {
        throw new Error(mensagemEstado(remota));
      }
      await arquivarConclusaoRemota(usuarioId, planId, local.sessao.id, {
        finished_at: remota.finished_at!,
        plan_id: remota.plan_id,
      });
      registrarMudancaDeDados();
      return {
        rascunho: await lerRascunho(usuarioId, planId),
        concluido: true,
      };
    } catch (erro) {
      return {
        rascunho: await lerRascunho(usuarioId, planId),
        concluido: false,
        conflito: true,
        conflitoSessao: true,
        erro: mensagemErro(erro),
      };
    }
  })().finally(() => emEnvio.delete(chave));
  emEnvio.set(chave, tarefa);
  return tarefa;
}

export async function sincronizarTreinosPendentes(
  usuarioId: string,
): Promise<ResultadoSincronizacao[]> {
  const resultados: ResultadoSincronizacao[] = [];
  for (const exclusao of await listarExclusoesPendentes(usuarioId)) {
    try {
      await excluirSessaoTreino(usuarioId, exclusao.sessaoId);
    } catch {
      /* Mantém o pedido e bloqueia reenvio até conseguir confirmar. */
    }
  }
  for (const rascunho of await listarRascunhos(usuarioId)) {
    // Rascunhos sem operações também podem ser de uma sessão já concluída remotamente.
    resultados.push(await sincronizarRascunho(usuarioId, rascunho.planId));
  }
  return resultados;
}

/** Serializa a exclusão com os envios em curso e só confirma após reler o servidor. */
export function excluirSessaoTreino(
  usuarioId: string,
  sessaoId: string,
): Promise<void> {
  const chave = `${usuarioId}:${sessaoId}`;
  const existente = exclusoesEmAndamento.get(chave);
  if (existente) return existente;
  const tarefa = (async () => {
    const { data: auth, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || auth.user?.id !== usuarioId)
      throw new Error("Entre novamente na sua conta para excluir este treino.");
    await registrarExclusaoTreino(usuarioId, sessaoId);
    await Promise.all(
      [...emEnvio.entries()]
        .filter(([envio]) => envio.startsWith(`${usuarioId}:`))
        .map(([, tarefa]) => tarefa),
    );
    const resultado = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", sessaoId)
      .eq("user_id", usuarioId)
      .select("id");
    // DELETE sem linhas afetadas pode significar RLS, não uma exclusão bem-sucedida.
    // A releitura também reconhece uma resposta perdida depois de apagar a linha.
    const { data: restante, error: erroConferencia } = await supabase
      .from("workout_sessions")
      .select("id")
      .eq("id", sessaoId)
      .eq("user_id", usuarioId)
      .maybeSingle();
    if (erroConferencia)
      throw new Error(
        "Não foi possível confirmar a exclusão no servidor. O pedido permanece guardado neste aparelho.",
      );
    if (restante)
      throw new Error(
        resultado.error
          ? mensagemErro(resultado.error)
          : "O servidor não confirmou a exclusão deste treino. Ele continua registrado; confira as permissões da conta no Supabase.",
      );
    await confirmarExclusaoTreino(usuarioId, sessaoId);
    registrarMudancaDeDados();
  })().finally(() => exclusoesEmAndamento.delete(chave));
  exclusoesEmAndamento.set(chave, tarefa);
  return tarefa;
}

export async function comFilaTreinoPausada<T>(
  usuarioId: string,
  acao: () => Promise<T>,
): Promise<T> {
  if (filasPausadas.has(usuarioId))
    throw new Error("Aguarde a operação anterior terminar.");
  filasPausadas.add(usuarioId);
  try {
    await Promise.all(
      [...emEnvio.entries()]
        .filter(([chave]) => chave.startsWith(`${usuarioId}:`))
        .map(([, tarefa]) => tarefa),
    );
    return await acao();
  } finally {
    filasPausadas.delete(usuarioId);
  }
}

/** Chamado com a fila pausada: pendência concluída não ocupa o próximo treino. */
export async function liberarTreinosEncerrados(usuarioId: string) {
  for (const anterior of await listarRascunhos(usuarioId)) {
    const atual = await lerRascunho(usuarioId, anterior.planId);
    if (!atual || atual.sessao.id !== anterior.sessao.id) continue;
    const { data: remota, error } = await supabase
      .from("workout_sessions")
      .select("id, plan_id, status, finished_at")
      .eq("id", atual.sessao.id)
      .eq("user_id", usuarioId)
      .maybeSingle();
    if (error) throw error;
    if (
      remota?.status === "em_andamento" ||
      (!atual.encerradaNoServidor && remota?.status !== "concluido")
    ) {
      throw new Error(
        "Existe uma sessão realmente em andamento ou ainda não enviada. Conclua ou envie essa sessão antes de iniciar outra.",
      );
    }
    await arquivarParaNovoTreino(
      usuarioId,
      atual.planId,
      atual.sessao.id,
      remota ?? null,
    );
  }
}
