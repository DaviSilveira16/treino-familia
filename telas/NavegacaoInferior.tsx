import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type RotaInferior = "Inicio" | "comunidade";

type Props = {
  corTema?: string;
  rotaAtual: string;
  onNavegar: (rota: RotaInferior) => void;
};

export default function NavegacaoInferior({
  corTema = "#35D07F",
  rotaAtual,
  onNavegar,
}: Props) {
  const comunidadeAtiva = rotaAtual === "comunidade";
  const treinosAtivo = !comunidadeAtiva;
  const corIconeComunidade = comunidadeAtiva ? corTema : "#9AA69D";

  return (
    <View style={estilos.barra}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir comunidade da família"
        onPress={() => onNavegar("comunidade")}
        style={estilos.item}
        activeOpacity={0.8}
      >
        <View
          style={[
            estilos.icone,
            estilos.iconeComunidadeFundo,
            comunidadeAtiva && {
              backgroundColor: `${corTema}18`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <View style={estilos.desenhoComunidade}>
            <View
              style={[
                estilos.cabecaComunidade,
                estilos.cabecaEsquerda,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.cabecaComunidade,
                estilos.cabecaCentral,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.cabecaComunidade,
                estilos.cabecaDireita,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpoComunidade,
                estilos.corpoEsquerdo,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpoComunidade,
                estilos.corpoCentral,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpoComunidade,
                estilos.corpoDireito,
                { backgroundColor: corIconeComunidade },
              ]}
            />
          </View>
        </View>
        <Text style={[estilos.rotulo, comunidadeAtiva && { color: corTema }]}>
          Comunidade
        </Text>
      </TouchableOpacity>

      <View style={estilos.divisor} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Ir para treinos"
        onPress={() => onNavegar("Inicio")}
        style={estilos.item}
        activeOpacity={0.8}
      >
        <View
          style={[
            estilos.icone,
            treinosAtivo && {
              backgroundColor: `${corTema}24`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <Text style={estilos.emoji}>🏋️</Text>
        </View>
        <Text style={[estilos.rotulo, treinosAtivo && { color: corTema }]}>
          Treinos
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    height: 50,
    minHeight: 50,
    maxHeight: 50,
    paddingTop: 2,
    paddingBottom: 2,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    flexShrink: 0,
    backgroundColor: "#111613",
    borderTopWidth: 1,
    borderTopColor: "#303A33",
  },
  item: {
    minWidth: 92,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  icone: {
    minWidth: 34,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 21,
    lineHeight: 23,
  },
  iconeComunidadeFundo: {
    paddingHorizontal: 7,
  },
  desenhoComunidade: {
    width: 27,
    height: 23,
    position: "relative",
  },
  cabecaComunidade: {
    position: "absolute",
    borderRadius: 8,
  },
  cabecaEsquerda: { width: 7, height: 7, left: 1, top: 4 },
  cabecaCentral: { width: 8, height: 8, left: 9.5, top: 0 },
  cabecaDireita: { width: 7, height: 7, right: 1, top: 4 },
  corpoComunidade: {
    position: "absolute",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  corpoEsquerdo: { width: 8, height: 8, left: 0, top: 12 },
  corpoCentral: { width: 11, height: 12, left: 8, top: 9 },
  corpoDireito: { width: 8, height: 8, right: 0, top: 12 },
  rotulo: {
    color: "#9AA69D",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
  divisor: {
    width: 1,
    height: 24,
    backgroundColor: "#303A33",
  },
});
