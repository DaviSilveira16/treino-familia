let revisao = 0;
const ouvintes = new Set<(planoAlterado?: string) => void>();

export function registrarMudancaDeDados(planoAlterado?: string): void {
  revisao += 1;
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(planoAlterado);
    } catch {
      // Uma tela nunca deve interromper a gravação de dados de outra parte do app.
    }
  }
}

export function obterRevisaoDeDados(): number {
  return revisao;
}

export function assinarMudancasDeDados(ouvinte: (planoAlterado?: string) => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
