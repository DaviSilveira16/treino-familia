import { gravarRascunho, listarRascunhos, novoIdSerie, type EsforcoPercebido, type PlanoExercicio, type SerieRascunho, type TreinoRascunho } from "./treinoLocal";
import { metricasRegistroTreino, type IntensidadeTreino, type PerfilCalculoTreino } from "./caloriasTreino";
import { sincronizarRascunho } from "./treinoSincronizacao";

export function montarRegistroManual(dados: { usuarioId: string; planId: string; planName: string; dia: string; duracao: number; intensidade: IntensidadeTreino; esforco: EsforcoPercebido;
  perfil: PerfilCalculoTreino | null; exercicios: PlanoExercicio[]; series: SerieRascunho[] }): TreinoRascunho {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.dia)) throw new Error("Confira a data do treino.");
  const fim = new Date(`${dados.dia}T12:00:00`);
  if (!Number.isFinite(fim.getTime()) || fim.getFullYear() !== Number(dados.dia.slice(0, 4)) || fim.getMonth() + 1 !== Number(dados.dia.slice(5, 7)) || fim.getDate() !== Number(dados.dia.slice(8))) throw new Error("Data inválida.");
  const feitas = dados.series.filter(s => s.concluida && !s.excluida);
  const metricas = metricasRegistroTreino(dados.perfil, dados.duracao, dados.intensidade, feitas.map(s => ({ exercise_id: s.exercise_id, exercise_name: s.exercise_name, set_number: s.set_number, reps: Number(s.reps), weight_kg: s.weight_kg.trim() ? Number(s.weight_kg.replace(",", ".")) : Number.NaN })));
  const iniciada = new Date(fim.getTime() - dados.duracao * 60000).toISOString();
  return { versao: 1, usuarioId: dados.usuarioId, planId: dados.planId, planName: dados.planName,
    sessao: { id: novoIdSerie(), plan_id: dados.planId, started_at: iniciada }, exercicios: dados.exercicios,
    series: feitas.map(s => ({ ...s, registroId: novoIdSerie(), pendente: "salvar" })), intensidade: dados.intensidade, esforco: dados.esforco,
    salvoEm: new Date().toISOString(), criacaoPendente: true,
    finalizacao: { finishedAt: fim.toISOString(), notes: "Treino registrado pela Frequência;horario=referencia_calendario;esforco_percebido=" + dados.esforco, metricas } };
}
export async function guardarRegistroManual(rascunho: TreinoRascunho) {
  const existentes = await listarRascunhos(rascunho.usuarioId);
  if (existentes.some(e => e.sessao.id !== rascunho.sessao.id)) throw new Error("Há um treino em andamento ou aguardando envio neste aparelho. Continue ou sincronize esse treino antes de registrar outro.");
  await gravarRascunho(rascunho);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { rascunho, concluido: false };
  return sincronizarRascunho(rascunho.usuarioId, rascunho.planId);
}
