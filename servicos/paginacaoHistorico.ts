/** Paginação por chave estável: inserções e exclusões não deslocam a próxima página. */
export type CursorData = { id: string; data: string };

export function filtroCursorDesc(coluna: "created_at" | "started_at", cursor: CursorData) {
  const data = JSON.stringify(cursor.data);
  const id = JSON.stringify(cursor.id);
  return `${coluna}.lt.${data},and(${coluna}.eq.${data},id.lt.${id})`;
}

export function unirPorId<T extends { id: string }>(anteriores: T[], pagina: T[]): T[] {
  const ids = new Set(anteriores.map((item) => item.id));
  return [...anteriores, ...pagina.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  })];
}

/** Uma resposta só pode publicar estado enquanto pertence à geração em foco. */
export function criarControleConsultas() {
  let geracao = 0;
  let controlador = new AbortController();
  const paginas = new Set<string>();
  function cancelar() {
    controlador.abort();
    geracao++;
    paginas.clear();
  }
  function atual(id: number) {
    return id === geracao && !controlador.signal.aborted;
  }
  return {
    cancelar,
    iniciar() {
      cancelar();
      controlador = new AbortController();
      const id = geracao;
      return { signal: controlador.signal, atual: () => atual(id) };
    },
    iniciarPagina(chave = "pagina") {
      if (controlador.signal.aborted || paginas.has(chave)) return null;
      paginas.add(chave);
      const id = geracao;
      return {
        signal: controlador.signal,
        atual: () => atual(id),
        concluir: () => { if (atual(id)) paginas.delete(chave); },
      };
    },
  };
}

/** Não presume o limite configurado no servidor; termina somente com página vazia. */
export async function carregarTodasPorId<T extends { id: string }>(
  buscar: (depoisDe: string | null) => PromiseLike<{ data: T[] | null; error: unknown }>,
  sinal: AbortSignal,
): Promise<T[]> {
  const resultado: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    if (sinal.aborted) throw new Error("Consulta cancelada");
    const pagina = await buscar(cursor);
    if (sinal.aborted) throw new Error("Consulta cancelada");
    if (pagina.error) throw pagina.error;
    const itens = pagina.data ?? [];
    if (!itens.length) return resultado;
    const proximo = itens[itens.length - 1].id;
    if (cursor !== null && proximo <= cursor)
      throw new Error("A consulta não avançou para a próxima página.");
    resultado.push(...itens);
    cursor = proximo;
  }
}
