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
          if (!comunidadeAtiva) onNavegar("comunidade");
        }}
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
            !comunidadeAtiva && {
              backgroundColor: `${corTema}24`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <Text style={estilos.emoji}>🏋️</Text>
        </View>
        <Text style={[estilos.rotulo, !comunidadeAtiva && { color: corTema }]}>
          Treinos
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    height: 30,
    minHeight: 30,
    maxHeight: 30,
    padding: 0,
    paddingHorizontal: 6,
    margin: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 0,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: "#111613",
    borderTopWidth: 1,
    borderTopColor: "#303A33",
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 29,
    padding: 0,
    margin: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  icone: {
    minWidth: 29,
    height: 10,
    paddingHorizontal: 4,
    margin: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 14, lineHeight: 16 },
  iconeComunidadeFundo: { paddingHorizontal: 4 },
  desenhoComunidade: { width: 22, height: 16, position: "relative" },
  cabecaComunidade: { position: "absolute", borderRadius: 8 },
  cabecaEsquerda: { width: 6, height: 6, left: 1, top: 2 },
  cabecaCentral: { width: 7, height: 7, left: 7, top: 0 },
  cabecaDireita: { width: 6, height: 6, right: 1, top: 2 },
  corpoComunidade: {
    position: "absolute",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  corpoEsquerdo: { width: 8, height: 6, left: 0, top: 9 },
  corpoCentral: { width: 9, height: 8, left: 6, top: 8 },
  corpoDireito: { width: 8, height: 6, right: 0, top: 9 },
  rotulo: {
    color: "#9AA69D",
    fontSize: 8,
    lineHeight: 9,
    fontWeight: "700",
    margin: 0,
    padding: 0,
  },
  divisor: { width: 1, height: 16, backgroundColor: "#303A33" },
});
