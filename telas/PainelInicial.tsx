import React from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import TreinoDoDia from "./TreinoDoDia";
import ResumoSemanal from "./ResumoSemanal";

const COR_PADRAO = "#35D07F";

const telas = [
  {
    id: "treinos",
    titulo: "Meus treinos",
    descricao: "Acesse seus treinos e exercícios",
    emoji: "🏋️",
  },
  {
    id: "cardios",
    titulo: "Meus Cardios",
    descricao: "Cadastre e acompanhe seus cardios",
    emoji: "🏃",
  },
  {
    id: "evolucao",
    titulo: "Evolução física",
    descricao: "Acompanhe seu peso e suas medidas",
    emoji: "📈",
  },
  {
    id: "evolucaoTreinos",
    titulo: "Evolução dos treinos",
    descricao: "Compare cargas, repetições e volume por exercício",
    emoji: "📊",
  },
  {
    id: "historico",
    titulo: "Histórico",
    descricao: "Consulte seus treinos anteriores",
    emoji: "📋",
  },
  {
    id: "frequencia",
    titulo: "Frequência",
    descricao: "Veja sua frequência de treinamento",
    emoji: "📅",
  },
] as const;

type Props = {
  nomeUsuario: string;
  fotoUrl: string | null;
  corTema: string;
  onSair: () => void;
  onNavegar: (rota: (typeof telas)[number]["id"] | "perfil") => void;
  onAbrirTreino: (plano: { planId: string; planName: string }) => void;
};

export default function PainelInicial({ nomeUsuario, fotoUrl, corTema, onSair, onNavegar, onAbrirTreino }: Props) {
  return (
    <View style={estilos.container}>
      <ScrollView
        contentContainerStyle={estilos.conteudoHome}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.topoHome}>
          <View style={estilos.informacoesUsuario}>
            <Text style={[estilos.marcaPequena, { color: corTema }]}>
              TREINO FAMÍLIA
            </Text>

            <Text
              style={estilos.tituloHome}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Olá, {nomeUsuario}!
            </Text>

            <Text style={estilos.subtituloHome}>
              Vamos treinar hoje?
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Abrir perfil"
            style={[
              estilos.avatar,
              {
                backgroundColor: `${corTema}30`,
                borderColor: corTema,
              },
            ]}
            onPress={() => onNavegar("perfil")}
            activeOpacity={0.8}
          >
            {fotoUrl ? (
              <Image
                source={{ uri: fotoUrl }}
                style={estilos.imagemAvatar}
              />
            ) : (
              <Text style={[estilos.avatarTexto, { color: corTema }]}>
                {nomeUsuario.charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TreinoDoDia
          onAbrirFrequencia={() => onNavegar("frequencia")}
          onAbrirTreino={(plano) =>
            plano
              ? onAbrirTreino(plano)
              : onNavegar("treinos")
          }
          corTema={corTema}
        />

        <ResumoSemanal corTema={corTema} />

        <Text style={estilos.tituloSecao}>Seu espaço de treino</Text>

        <View style={estilos.listaCartoes}>
          {telas.map((tela) => (
            <TouchableOpacity
              key={tela.id}
              style={estilos.cartaoHome}
              onPress={() => onNavegar(tela.id)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  estilos.iconeCartao,
                  { backgroundColor: `${corTema}20` },
                ]}
              >
                <Text style={estilos.emojiCartao}>{tela.emoji}</Text>
              </View>

              <View style={estilos.textoCartao}>
                <Text style={estilos.tituloCartao}>
                  {tela.titulo}
                </Text>

                <Text style={estilos.descricaoCartao}>
                  {tela.descricao}
                </Text>
              </View>

              <Text style={[estilos.setaCartao, { color: corTema }]}>
                ›
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={estilos.botaoSair}
          onPress={onSair}
          activeOpacity={0.8}
        >
          <Text style={estilos.textoBotaoSair}>Sair da conta</Text>
        </TouchableOpacity>

        <Text style={estilos.rodapeHome}>
          Treino Família · Evoluindo juntos
        </Text>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101312" },
  conteudoHome: {
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 30,
  },
  topoHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 12,
  },
  informacoesUsuario: {
    flex: 1,
    minWidth: 0,
  },
  marcaPequena: {
    color: COR_PADRAO,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  tituloHome: {
    color: "#F0F3F1",
    fontSize: 27,
    fontWeight: "800",
  },
  subtituloHome: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 7,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#244C36",
    borderWidth: 1,
    borderColor: COR_PADRAO,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  imagemAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarTexto: {
    color: COR_PADRAO,
    fontSize: 22,
    fontWeight: "800",
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 16,
  },
  listaCartoes: {
    gap: 12,
  },
  cartaoHome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 16,
    padding: 16,
  },
  iconeCartao: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  emojiCartao: {
    fontSize: 23,
  },
  textoCartao: {
    flex: 1,
  },
  tituloCartao: {
    color: "#F0F3F1",
    fontSize: 15,
    fontWeight: "700",
  },
  descricaoCartao: {
    color: "#A4ADA7",
    fontSize: 12,
    marginTop: 5,
    lineHeight: 17,
  },
  setaCartao: {
    color: COR_PADRAO,
    fontSize: 28,
    marginLeft: 8,
  },
  botaoSair: {
    borderWidth: 1,
    borderColor: "#454D48",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  textoBotaoSair: {
    color: "#D6DDD8",
    fontWeight: "600",
    fontSize: 14,
  },
  rodapeHome: {
    color: "#6F7972",
    fontSize: 12,
    textAlign: "center",
    marginTop: 22,
  },
});
