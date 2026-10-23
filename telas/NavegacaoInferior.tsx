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
  const corIconeComunidade = comunidadeAtiva ? corTema : "#9AA69D";

  return (
    <View nativeID="navegacao-inferior" style={estilos.barra}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir comunidade da família"
        onPress={() => {
          if (!comunidadeAtiva) {
            onNavegar("comunidade");
          }
        }}
        style={estilos.item}
        activeOpacity={0.8}
      >
        <View
          style={[
            estilos.iconeComunidade,
            comunidadeAtiva && {
              backgroundColor: `${corTema}18`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <View style={estilos.desenhoComunidade}>
            <View
              style={[
                estilos.cabeca,
                estilos.cabecaEsquerda,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.cabeca,
                estilos.cabecaCentral,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.cabeca,
                estilos.cabecaDireita,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpo,
                estilos.corpoEsquerdo,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpo,
                estilos.corpoCentral,
                { backgroundColor: corIconeComunidade },
              ]}
            />
            <View
              style={[
                estilos.corpo,
                estilos.corpoDireito,
                { backgroundColor: corIconeComunidade },
              ]}
            />
          </View>
        </View>

        <Text
          numberOfLines={1}
          style={[estilos.rotulo, comunidadeAtiva && { color: corTema }]}
        >
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
            estilos.iconeTreino,
            !comunidadeAtiva && {
              backgroundColor: `${corTema}24`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <Text style={estilos.emoji}>🏋️</Text>
        </View>

        <Text
          numberOfLines={1}
          style={[estilos.rotulo, !comunidadeAtiva && { color: corTema }]}
        >
          Treinos
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    height: 40,
    minHeight: 40,
    paddingTop: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    flexShrink: 0,
    backgroundColor: "#111613",
    borderTopWidth: 1,
    borderTopColor: "#303A33",
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  iconeComunidade: {
    width: 30,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  iconeTreino: {
    minWidth: 30,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  desenhoComunidade: {
    width: 20,
    height: 17,
    position: "relative",
  },
  cabeca: {
    position: "absolute",
    borderRadius: 8,
  },
  cabecaEsquerda: {
    width: 5,
    height: 5,
    left: 1,
    top: 4,
  },
  cabecaCentral: {
    width: 6,
    height: 6,
    left: 7,
    top: 0,
  },
  cabecaDireita: {
    width: 5,
    height: 5,
    right: 1,
    top: 4,
  },
  corpo: {
    position: "absolute",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  corpoEsquerdo: {
    width: 7,
    height: 7,
    left: 0,
    top: 10,
  },
  corpoCentral: {
    width: 9,
    height: 10,
    left: 5.5,
    top: 7,
  },
  corpoDireito: {
    width: 7,
    height: 7,
    right: 0,
    top: 10,
  },
  rotulo: {
    color: "#9AA69D",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
  },
  divisor: {
    width: 1,
    height: 22,
    backgroundColor: "#303A33",
  },
});
