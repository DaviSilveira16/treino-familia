import { chamarAcompanhamento, type HistoricoAcompanhado, type SessaoAcompanhada } from "./acompanhamento";

export function chaveDiaLocal(valor: string | Date): string {
  const data = typeof valor === "string" ? new Date(valor) : valor;
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

export function gradeMes(ano: number, mes: number): (number | null)[] {
  const inicio = new Date(ano, mes, 1, 12).getDay();
  const dias = new Date(ano, mes + 1, 0, 12).getDate();
  const grade: (number | null)[] = [
    ...Array<null>(inicio).fill(null),
    ...Array.from({ length: dias }, (_, i) => i + 1),
  ];
  while (grade.length % 7) grade.push(null);
  return grade;
}

/** Reutiliza a autorização da RPC existente. Nunca trata só a primeira página como o mês inteiro. */
export async function carregarMesAcompanhado(
  usuarioId: string, vinculoId: string, ano: number, mes: number, continuar: () => boolean,
): Promise<SessaoAcompanhada[]> {
  const inicio = new Date(ano, mes, 1).getTime();
  const fim = new Date(ano, mes + 1, 1).getTime();
  const registros = new Map<string, SessaoAcompanhada>();
  let offset = 0;
  while (continuar()) {
    const pagina = await chamarAcompanhamento<HistoricoAcompanhado>(usuarioId, "history", { link_id: vinculoId, offset });
    if (!continuar()) return [];
    for (const sessao of pagina.sessions) {
      const instante = new Date(sessao.started_at).getTime();
      if (instante >= inicio && instante < fim) registros.set(sessao.id, sessao);
    }
    const ultima = pagina.sessions[pagina.sessions.length - 1];
    if (!ultima || new Date(ultima.started_at).getTime() < inicio || pagina.sessions.length < 20 || offset + pagina.sessions.length >= pagina.total) break;
    offset += pagina.sessions.length;
    // A API existente limita o deslocamento; nunca apresentar um mês parcial como completo.
    if (offset > 100000) throw new Error("Este período tem muitos registros para consultar aqui. Escolha um mês mais recente.");
  }
  return [...registros.values()];
}
