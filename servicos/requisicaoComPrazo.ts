/** Cancela a requisição real; a fila só é liberada quando o fetch encerra. */
export async function requisicaoComPrazo(input: RequestInfo | URL, init?: RequestInit, prazoMs = 20000): Promise<Response> {
  const sinal = init?.signal ?? (typeof input === "object" && input !== null && "signal" in input ? input.signal as AbortSignal : undefined);
  if (sinal) {
    if (sinal.aborted) {
      const erro = new Error("Requisição cancelada");
      erro.name = "AbortError";
      throw erro;
    }
    // O sinal do chamador precisa continuar ligado ao corpo da resposta, mesmo
    // depois de fetch devolver os cabeçalhos. Clonar e desligar no finally
    // interrompia esse cancelamento ao sair da tela. Combinação nativa também
    // mantém o prazo; em ambientes antigos, preserva o cancelamento do chamador.
    const combinado = typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.any([sinal, AbortSignal.timeout(prazoMs)]) : sinal;
    return fetch(input, { ...init, signal: combinado });
  }
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), prazoMs);
  try {
    return await fetch(input, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(timer);
  }
}
