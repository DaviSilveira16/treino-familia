let revisao = 0;
const ouvintes = new Set<() => void>();

export function registrarMudancaDeDados(): void {
  revisao += 1;
  for (const ouvinte of ouvintes) {
    try {
      ouvinte();
    } catch {
      // Uma tela nunca deve interromper a gravação de dados de outra parte do app.
    }
  }
}

export function obterRevisaoDeDados(): number {
  return revisao;
}

export function assinarMudancasDeDados(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
