let revisao = 0;
type OrigemMudanca = "plano" | "atividade" | "foto" | "rascunho" | "nutricao";
type Ouvinte = (planoAlterado?: string, origem?: OrigemMudanca) => void;
const ouvintes = new Set<Ouvinte>();

export function registrarMudancaDeDados(planoAlterado?: string, origem?: OrigemMudanca): void {
  revisao += 1;
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(planoAlterado, origem);
    } catch {
      // Uma tela nunca deve interromper a gravação de dados de outra parte do app.
    }
  }
}

export function obterRevisaoDeDados(): number {
  return revisao;
}

export function assinarMudancasDeDados(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
