/** Cancela a requisição real; a fila só é liberada quando o fetch encerra. */
export async function requisicaoComPrazo(input: RequestInfo | URL, init?: RequestInit, prazoMs = 20000): Promise<Response> {
  const controle = new AbortController();
  const sinal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  const cancelar = () => controle.abort();
  if (sinal?.aborted) cancelar();
  else sinal?.addEventListener("abort", cancelar, { once: true });
  const timer = setTimeout(cancelar, prazoMs);
  try {
    return await fetch(input, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(timer);
    sinal?.removeEventListener("abort", cancelar);
  }
}
