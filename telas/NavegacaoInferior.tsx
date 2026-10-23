import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
    height: 40,
    minHeight: 40,
    paddingTop: 1,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    gap: 0,
    flexShrink: 0,
    backgroundColor: "#111613",
    borderTopWidth: 1,
    borderTopColor: "#303A33",
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  icone: {
    minWidth: 34,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 15 },
  iconeComunidadeFundo: { paddingHorizontal: 9 },
  desenhoComunidade: { width: 22, height: 19, position: "relative" },
  cabecaComunidade: { position: "absolute", borderRadius: 8 },
  cabecaEsquerda: { width: 6, height: 6, left: 1, top: 4 },
  cabecaCentral: { width: 7, height: 7, left: 9, top: 0 },
  cabecaDireita: { width: 6, height: 6, right: 1, top: 4 },
  corpoComunidade: {
    position: "absolute",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  corpoEsquerdo: { width: 8, height: 8, left: 0, top: 12 },
  corpoCentral: { width: 10, height: 11, left: 7.5, top: 9 },
  corpoDireito: { width: 8, height: 8, right: 0, top: 12 },
  rotulo: { color: "#9AA69D", fontSize: 9, fontWeight: "700" },
  divisor: { width: 1, height: 23, backgroundColor: "#303A33" },
});
