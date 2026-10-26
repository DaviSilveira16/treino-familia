/** Cancela a requisição real; a fila só é liberada quando o fetch encerra. */
export async function requisicaoComPrazo(input: RequestInfo | URL, init?: RequestInit, prazoMs = 20000): Promise<Response> {
  const controle = new AbortController();
  const sinal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const cancelar = () => controle.abort();
  if (sinal?.aborted) cancelar();
  else sinal?.addEventListener("abort", cancelar, { once: true });
  const timer = setTimeout(cancelar, prazoMs);
  try {
    // Safari pode emitir um erro nativo de acesso ao chamar fetch com um sinal
    // já cancelado. Uma tela antiga não deve sequer iniciar essa requisição.
    if (controle.signal.aborted) {
      const erro = new Error("Requisição cancelada");
      erro.name = "AbortError";
      throw erro;
    }
    return await fetch(input, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(timer);
    sinal?.removeEventListener("abort", cancelar);
  }
}
