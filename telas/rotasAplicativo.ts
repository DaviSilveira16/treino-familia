import { createStackNavigator } from "@react-navigation/stack";

export type Rotas = {
  Inicio: undefined;
  perfil: undefined;
  treinos: undefined;
  cardios: undefined;
  evolucao: undefined;
  historico: undefined;
  frequencia: { cardioId?: string } | undefined;
  evolucaoTreinos: undefined;
  treinoAtivo: { planId: string; planName: string };
  comunidade: undefined;
  nutricao: undefined;
};

export const Pilha = createStackNavigator<Rotas>();
// A Comunidade é uma aba principal; apenas as páginas abaixo têm voltar.
export const ROTAS_COM_BOTAO_VOLTAR = new Set<keyof Rotas>([
  "perfil",
  "treinos",
  "cardios",
  "evolucao",
  "historico",
  "frequencia",
  "evolucaoTreinos",
  "treinoAtivo",
]);

