import { supabase } from "../supabase";
import { registrarMudancaDeDados } from "./revisaoDados";
import { atualizarRascunho, lerRascunho, listarRascunhos, mesmaOperacao, type TreinoRascunho } from "./treinoLocal";
import { salvarModeloDoTreino, ConflitoModeloTreino } from "./salvarModeloTreino";

export type ResultadoSincronizacao = {
  rascunho: TreinoRascunho | null;
  concluido: boolean;
  erro?: string;
  conflito?: boolean;
};
class ConflitoTreino extends Error {}
const emEnvio = new Map<string, Promise<ResultadoSincronizacao>>();

/** Não reabre sessões e só reconhece como nossa a conclusão com a mesma data. */
export function situacaoConclusao(
  sessao: { plan_id: string; status: string; finished_at?: string | null } | null,
  rascunho: Pick<TreinoRascunho, "planId" | "finalizacao">,
): "ativa" | "confirmada" | "conflito" {
  if (!sessao) return "conflito";
  const modelo = rascunho.finalizacao?.modelo;
  if (sessao.plan_id !== rascunho.planId && !(modelo?.modo === "novo" && sessao.plan_id === modelo.planId)) return "conflito";
  if (sessao.status === "em_andamento" && sessao.plan_id === rascunho.planId) return "ativa";
  if (sessao.status === "concluido" && rascunho.finalizacao
    && Date.parse(sessao.finished_at ?? "") === Date.parse(rascunho.finalizacao.finishedAt)) return "confirmada";
  return "conflito";
}

/** A fila é independente da tela: pode ser retomada pela Home ou pela mini barra. */
export function sincronizarRascunho(usuarioId: string, planId: string, permitirSobrescrever = false): Promise<ResultadoSincronizacao> {
  const chave = `${usuarioId}:${planId}`;
  const atual = emEnvio.get(chave);
  if (atual) return atual;
  const tarefa = enviar(usuarioId, planId, permitirSobrescrever).finally(() => emEnvio.delete(chave));
  emEnvio.set(chave, tarefa);
  return tarefa;
}

async function enviar(usuarioId: string, planId: string, permitirSobrescrever: boolean): Promise<ResultadoSincronizacao> {
  let local = await lerRascunho(usuarioId, planId);
  if (!local) return { rascunho: null, concluido: false };
  const sessaoId = local.sessao.id;
  if (!local.finalizacao && !local.series.some((serie) => serie.pendente)) return { rascunho: local, concluido: false };
  if (local.conflitoSincronizacao && !permitirSobrescrever) return {
    rascunho: local, concluido: false, conflito: true, erro: local.erroSincronizacao,
  };
  try {
    const { data: autenticado, error: erroAuth } = await supabase.auth.getUser();
    if (erroAuth || autenticado.user?.id !== usuarioId) throw new Error("Entre novamente na sua conta para sincronizar este treino.");
    let { data: remota, error: erroSessao } = await supabase.from("workout_sessions")
      .select("id, plan_id, status, finished_at").eq("id", sessaoId).eq("user_id", usuarioId).maybeSingle();
    if (erroSessao) throw erroSessao;
    if (!remota && local.criacaoPendente) {
      const data = new Date(local.sessao.started_at), inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate()), fim = new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
      const { data: doDia, error: erroDia } = await supabase.from("workout_sessions").select("id, plan_id").eq("user_id", usuarioId).gte("started_at", inicio.toISOString()).lt("started_at", fim.toISOString()).limit(2);
      if (erroDia) throw erroDia;
      if (doDia?.some(s => s.id !== sessaoId && s.plan_id)) throw new ConflitoTreino("Já existe um treino nesta data. Seu registro local foi preservado; confira a Frequência antes de reenviar.");
      const { data: ativas, error: erroAtivas } = await supabase.from("workout_sessions").select("id").eq("user_id", usuarioId).eq("status", "em_andamento").limit(1);
      if (erroAtivas) throw erroAtivas;
      if (ativas?.some(s => s.id !== sessaoId)) throw new Error("Conclua o treino em andamento antes de enviar o registro pela Frequência.");
      const { data: criada, error } = await supabase.from("workout_sessions").insert({ id: sessaoId, user_id: usuarioId, plan_id: local.planId, started_at: local.sessao.started_at, status: "em_andamento" }).select("id, plan_id, status, finished_at").single();
      if (error) throw error;
      remota = criada;
    }
    const situacao = situacaoConclusao(remota, local);
    if (situacao === "conflito") throw new ConflitoTreino("Esta sessão foi encerrada ou alterada em outro aparelho. O rascunho e sua conclusão pendente foram preservados para conferência.");
    if (situacao === "confirmada" && local.series.some((serie) => serie.pendente)) throw new ConflitoTreino("O servidor já encerrou esta sessão, mas ainda existem séries locais pendentes. Os dados foram preservados para conferência.");

    for (const item of local.series.filter((serie) => serie.pendente)) {
      let busca = supabase.from("workout_sets").select("id, reps, weight_kg").eq("user_id", usuarioId).eq("session_id", sessaoId);
      if (item.avulsa) {
        if (!item.registroId) throw new Error("Exercício da sessão sem identificador local. Reabra o treino para conferir.");
        busca = busca.eq("id", item.registroId);
      } else busca = busca.eq("exercise_id", item.exercise_id).eq("set_number", item.set_number);
      const { data: existentes, error: erroBusca } = await busca.limit(2);
      if (erroBusca) throw erroBusca;
      if ((existentes ?? []).length > 1) throw new ConflitoTreino("Há séries duplicadas no servidor. Seu rascunho foi preservado para conferência.");
      const existente = existentes?.[0];
      let registroId: string | undefined;
      if (item.pendente === "remover") {
        if (existente) {
          const base = item.baseRemota ?? { id: item.registroId, reps: Number(item.reps), weight_kg: Number(item.weight_kg.replace(",", ".")) };
          if (!permitirSobrescrever && (existente.id !== base.id || Number(existente.reps) !== base.reps || Number(existente.weight_kg) !== base.weight_kg)) {
            throw new ConflitoTreino(`${item.exercise_name}, série ${item.set_number}: o registro remoto mudou. Confirme antes de removê-lo.`);
          }
          const { data: apagadas, error } = await supabase.from("workout_sets").delete()
            .eq("id", existente.id).eq("user_id", usuarioId).eq("session_id", sessaoId)
            .eq("reps", existente.reps).eq("weight_kg", existente.weight_kg).select("id");
          if (error) throw error;
          if (!apagadas?.length) throw new ConflitoTreino("A série mudou durante o envio. Confira os dados antes de tentar novamente.");
        }
      } else {
        const reps = Number(item.reps);
        const peso = Number(item.weight_kg.replace(",", "."));
        if (!Number.isInteger(reps) || reps < 1 || reps > 1000 || !Number.isFinite(peso) || peso < 0 || peso > 2000) {
          throw new Error(`Valores inválidos na série ${item.set_number} de ${item.exercise_name}.`);
        }
        const dados = { user_id: usuarioId, session_id: sessaoId, exercise_id: item.avulsa ? null : item.exercise_id, exercise_name: item.exercise_name, set_number: item.set_number, reps, weight_kg: peso };
        const iguais = existente && Number(existente.reps) === reps && Number(existente.weight_kg) === peso;
        if (iguais) registroId = existente.id;
        else if (existente) {
          if (!permitirSobrescrever) throw new ConflitoTreino(`${item.exercise_name}, série ${item.set_number}: existem valores diferentes no servidor. Confirme se deseja enviar sua versão local.`);
          const { data, error } = await supabase.from("workout_sets").update(dados)
            .eq("id", existente.id).eq("user_id", usuarioId).eq("session_id", sessaoId)
            .eq("reps", existente.reps).eq("weight_kg", existente.weight_kg).select("id").maybeSingle();
          if (error) throw error;
          if (!data) throw new ConflitoTreino("A série mudou durante o envio. Seu rascunho foi preservado.");
          registroId = data.id;
        } else {
          if (!item.registroId) throw new Error("A série ainda não recebeu um identificador local. Reabra o treino para conferir os dados.");
          // INSERT com UUID estável: uma resposta perdida é reconhecida na consulta acima.
          // Evita upsert sobrescrever uma linha que surgiu depois da leitura.
          const { data, error } = await supabase.from("workout_sets").insert({ id: item.registroId, ...dados }).select("id").single();
          if (error) throw error;
          registroId = data.id;
        }
      }
      local = await atualizarRascunho(usuarioId, planId, (atual) => atual.sessao.id !== sessaoId ? atual : {
        ...atual,
        series: atual.series.map((serie) => mesmaOperacao(serie, item) ? {
          ...serie, pendente: undefined, registroId,
          baseRemota: registroId ? { id: registroId, reps: Number(item.reps), weight_kg: Number(item.weight_kg.replace(",", ".")) } : undefined,
        } : serie),
      });
      if (!local || local.sessao.id !== sessaoId) throw new Error("O rascunho mudou durante o envio. Reabra o treino para conferir.");
      registrarMudancaDeDados();
    }
    local = await lerRascunho(usuarioId, planId);
    if (local?.finalizacao && !local.series.some((serie) => serie.pendente)) {
      const finalizacao = local.finalizacao;
      if (situacao !== "confirmada") {
        const { data, error } = await supabase.from("workout_sessions")
          .update({ finished_at: finalizacao.finishedAt, status: "concluido", notes: finalizacao.notes })
          .eq("id", sessaoId).eq("plan_id", planId).eq("user_id", usuarioId).eq("status", "em_andamento")
          .select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new ConflitoTreino("O encerramento mudou durante o envio. A conclusão local foi preservada para conferência.");
        registrarMudancaDeDados();
      }
      // Até a confirmação dos detalhes, a fila continua no disco, inclusive após reabrir.
      const { data: detalhes, error: erroDetalhes } = await supabase.from("workout_sessions").update(finalizacao.metricas)
        .eq("id", sessaoId).eq("user_id", usuarioId).eq("status", "concluido").eq("finished_at", finalizacao.finishedAt)
        .select("id").maybeSingle();
      if (erroDetalhes) throw new Error("O encerramento foi enviado. Os detalhes permanecem guardados até a próxima sincronização.");
      if (!detalhes) throw new ConflitoTreino("O encerramento remoto mudou. Seus detalhes locais continuam preservados.");
      await salvarModeloDoTreino(local);
      await atualizarRascunho(usuarioId, planId, (atual) => atual.sessao.id === sessaoId
        && atual.finalizacao?.finishedAt === finalizacao.finishedAt && !atual.series.some((serie) => serie.pendente) ? null : atual);
      registrarMudancaDeDados();
      return { rascunho: await lerRascunho(usuarioId, planId), concluido: true };
    }
    local = await atualizarRascunho(usuarioId, planId, (atual) => ({ ...atual, erroSincronizacao: undefined, conflitoSincronizacao: false }));
    return { rascunho: local, concluido: false };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Não foi possível sincronizar. Seus dados continuam guardados neste aparelho.";
    const conflito = erro instanceof ConflitoTreino || erro instanceof ConflitoModeloTreino;
    local = await atualizarRascunho(usuarioId, planId, (atual) => atual.sessao.id !== sessaoId ? atual : { ...atual, erroSincronizacao: mensagem, conflitoSincronizacao: conflito });
    return { rascunho: local, concluido: false, erro: mensagem, conflito };
  }
}

export async function sincronizarTreinosPendentes(usuarioId: string): Promise<ResultadoSincronizacao[]> {
  const resultados: ResultadoSincronizacao[] = [];
  for (const rascunho of await listarRascunhos(usuarioId)) {
    if (rascunho.finalizacao || rascunho.series.some((serie) => serie.pendente)) resultados.push(await sincronizarRascunho(usuarioId, rascunho.planId));
  }
  return resultados;
}
