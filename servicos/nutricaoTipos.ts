export type Nutrientes = { kcal: number; proteinas: number; carboidratos: number; gorduras: number };
export type PerfilNutricional = { pesoKg: number; alturaCm: number; idade: number; sexo: "masculino" | "feminino" };
export type AlimentoNutricao = {
  id: string; usuarioId: string | null; nome: string; marca: string; preparo: string; fonte: string;
  baseGramas: number; porcaoNome: string; nutrientes: Nutrientes;
};
export type ItemRefeicao = {
  id: string; alimentoId: string | null; nome: string; marca: string; preparo: string; fonte: string;
  gramas: number; baseGramas: number; nutrientesBase: Nutrientes; consumido: boolean;
};
export type RefeicaoNutricao = {
  id: string; nome: string; horario: string; itens: ItemRefeicao[];
  origemModeloId?: string; origemRefeicaoId?: string;
};
export type ModeloDieta = {
  id: string; usuarioId: string; grupoId: string; nome: string; versao: number;
  vigenteDesde: string; refeicoes: RefeicaoNutricao[]; criadoEm: string;
};
export type ConfiguracaoNutricional = {
  id: string; usuarioId: string; vigenteDesde: string; objetivo: "manter" | "perder" | "ganhar";
  metaKcal: number | null; metaProteinas: number | null; metaCarboidratos: number | null; metaGorduras: number | null;
  perfil: PerfilNutricional | null; repousoKcal: number | null; fatorRotina: number;
  baseDiariaKcal: number | null; toleranciaKcal: number; restricaoAutomatica: boolean;
  metodo: "repouso-rotina-v1"; criadoEm: string;
};
export type DiaNutricao = {
  id: string; usuarioId: string; data: string; refeicoes: RefeicaoNutricao[]; concluido: boolean;
  modeloOrigemId: string | null; modeloVersao: number | null;
  configuracao: ConfiguracaoNutricional | null; alteradoEm: string;
};
export type PreferenciasNutricao = {
  modeloPadraoId: string | null; repetirDiariamente: boolean; repetirDesde: string;
  favoritos: string[]; recentes: string[];
};
export type AtividadeNutricional = {
  id: string; tipo: "musculacao" | "cardio"; data: string; nome: string;
  caloriasAtivas: number | null; minutos: number; pendente: boolean;
};
export type EstadoNutricao = {
  dias: DiaNutricao[]; modelos: ModeloDieta[]; configuracoes: ConfiguracaoNutricional[];
  preferencias: PreferenciasNutricao; alimentosLocais: AlimentoNutricao[];
  pendencias: number; erro: string | null;
  conflitos?: { recursoId: string; tipo: string; mensagem: string; local: unknown; remoto: unknown }[];
};
export type ResultadoBuscaAlimentos = { alimentos: AlimentoNutricao[]; temMais: boolean; erro: string | null };
