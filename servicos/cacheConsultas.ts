/**
 * Cache de leitura volátil e segmentado pelo ID autenticado.
 * Nunca persistimos dados privados em CacheStorage/localStorage, nem
 * reutilizamos dados após uma escrita confirmada pelo aplicativo.
 */
import { obterRevisaoDeDados } from "./revisaoDados";
import { supabase } from "../supabase";

type Entrada = {
  valor: unknown;
  venceEm: number;
  descartarEm: number;
  revisao: number;
};
const entradas = new Map<string, Entrada>();
const MAX_ENTRADAS = 60;

function chave(usuarioId: string, recurso: string) {
  return `${usuarioId}::${recurso}`;
}

export function lerCache<T>(usuarioId: string, recurso: string): T | undefined {
  if (!usuarioId) return undefined;
  const id = chave(usuarioId, recurso);
  const entrada = entradas.get(id);
  if (!entrada) return undefined;
  if (
    Date.now() > entrada.descartarEm ||
    entrada.revisao !== obterRevisaoDeDados()
  ) {
    entradas.delete(id);
    return undefined;
  }
  // LRU: recentes permanecem no cache; consultas de outras telas têm limite.
  entradas.delete(id);
  entradas.set(id, entrada);
  return Date.now() <= entrada.venceEm ? (entrada.valor as T) : undefined;
}

/** Exibe a última leitura brevemente enquanto valida no servidor (stale-while-revalidate). */
export function lerCacheParaExibicao<T>(
  usuarioId: string,
  recurso: string,
): T | undefined {
  if (!usuarioId) return undefined;
  const entrada = entradas.get(chave(usuarioId, recurso));
  if (
    !entrada ||
    Date.now() > entrada.descartarEm ||
    entrada.revisao !== obterRevisaoDeDados()
  )
    return undefined;
  return entrada.valor as T;
}

export function salvarCache<T>(
  usuarioId: string,
  recurso: string,
  valor: T,
  ttlMs = 30000,
) {
  if (!usuarioId || ttlMs <= 0) return;
  const id = chave(usuarioId, recurso);
  entradas.delete(id);
  entradas.set(id, {
    valor,
    venceEm: Date.now() + ttlMs,
    descartarEm: Date.now() + ttlMs + 180000,
    revisao: obterRevisaoDeDados(),
  });
  while (entradas.size > MAX_ENTRADAS) {
    const maisAntigo = entradas.keys().next().value;
    if (maisAntigo === undefined) break;
    entradas.delete(maisAntigo);
  }
}

export function limparCacheLeituras() {
  entradas.clear();
}

// Não é cache offline: gravações pendentes seguem o fluxo de treinoLocal.ts.

// Esvaziar imediatamente ao trocar ou sair da conta, inclusive sem remontar App.
let usuarioEmMemoria: string | null = null;
supabase.auth.onAuthStateChange((_, sessao) => {
  const proximo = sessao?.user.id ?? null;
  if (usuarioEmMemoria !== proximo) limparCacheLeituras();
  usuarioEmMemoria = proximo;
});
