/**
 * Monitoramento LOCAL e anonimizado: nunca coleta IDs, emails,
 * treinos ou URLs. Resultados permanecem só na memória desta página.
 * No console do navegador: treinoFamiliaPerf.relatorio() / .limpar().
 */
import { Platform } from "react-native";

type Amostra = {
  operacao: string;
  duracaoMs: number;
  erro: boolean;
  instante: number;
};
const historico: Amostra[] = [];
const LIMITE = 160;

export function registrarTempo(operacao: string, inicio: number, erro = false) {
  // Só aceitar rótulos fixos criados pelo código, nunca dados do usuário.
  if (!/^[a-zA-Z0-9._-]{1,60}$/.test(operacao)) return;
  const duracaoMs = Math.max(0, Math.round(Date.now() - inicio));
  historico.push({ operacao, duracaoMs, erro, instante: Date.now() });
  if (historico.length > LIMITE) historico.shift();
  if (typeof __DEV__ !== "undefined" && __DEV__ && duracaoMs > 500) {
    console.info(
      `[Treino Família] ${operacao}: ${duracaoMs}ms${erro ? " (erro)" : ""}`,
    );
  }
}

export async function medir<T>(
  operacao: string,
  execucao: () => PromiseLike<T>,
): Promise<T> {
  const inicio = Date.now();
  try {
    const resultado = await execucao();
    const erroRetornado = resultado && typeof resultado === "object"
      ? "error" in resultado
        ? resultado.error
        : "erro" in resultado
          ? resultado.erro
          : null
      : null;
    registrarTempo(operacao, inicio, Boolean(erroRetornado));
    return resultado;
  } catch (erro) {
    registrarTempo(operacao, inicio, true);
    throw erro;
  }
}

export function relatorioPerformance() {
  const grupos = new Map<string, Amostra[]>();
  for (const amostra of historico) {
    const lista = grupos.get(amostra.operacao) ?? [];
    lista.push(amostra);
    grupos.set(amostra.operacao, lista);
  }
  return [...grupos.entries()]
    .map(([operacao, lista]) => {
      const tempos = lista.map((item) => item.duracaoMs).sort((a, b) => a - b);
      return {
        operacao,
        amostras: tempos.length,
        medianaMs: tempos[Math.floor((tempos.length - 1) / 2)],
        p95Ms: tempos[Math.ceil(tempos.length * 0.95) - 1],
        falhas: lista.filter((item) => item.erro).length,
      };
    })
    .sort((a, b) => b.p95Ms - a.p95Ms);
}

if (Platform.OS === "web" && typeof window !== "undefined") {
  (
    window as typeof window & { treinoFamiliaPerf?: unknown }
  ).treinoFamiliaPerf = {
    relatorio: relatorioPerformance,
    limpar: () => {
      historico.length = 0;
    },
  };
}
