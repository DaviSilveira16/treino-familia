import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type RotaInferior = "Inicio" | "comunidade" | "nutricao";

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
  const nutricaoAtiva = rotaAtual === "nutricao";
  const treinosAtivo = !comunidadeAtiva && !nutricaoAtiva;
  const corIconeComunidade = comunidadeAtiva ? corTema : "#A3ACA5";

  return (
    <View nativeID="navegacao-inferior" style={estilos.barra}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir comunidade da família"
        accessibilityState={{ selected: comunidadeAtiva }}
        onPress={() => {
          if (!comunidadeAtiva) onNavegar("comunidade");
        }}
        style={estilos.item}
        activeOpacity={0.85}
      >
        <View style={estilos.areaIcone}>
          <View style={estilos.iconeBase}>
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
        </View>
        <Text style={[estilos.rotulo, comunidadeAtiva && { color: corTema }]}>
          Comunidade
        </Text>
      </TouchableOpacity>

      <View style={estilos.divisor} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Ir para treinos"
        accessibilityState={{ selected: treinosAtivo }}
        onPress={() => {
          if (rotaAtual !== "Inicio") onNavegar("Inicio");
        }}
        style={estilos.item}
        activeOpacity={0.85}
      >
        <View style={estilos.areaIcone}>
          <View
            style={[
              estilos.iconeBase,
              estilos.iconeTreino,
              treinosAtivo && {
                backgroundColor: `${corTema}1A`,
                borderColor: `${corTema}90`,
              },
            ]}
          >
            <Text style={estilos.emoji}>🏋️</Text>
          </View>
        </View>
        <Text style={[estilos.rotulo, treinosAtivo && { color: corTema }]}>
          Treinos
        </Text>
      </TouchableOpacity>

      <View style={estilos.divisor} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir nutrição"
        accessibilityState={{ selected: nutricaoAtiva }}
        onPress={() => { if (!nutricaoAtiva) onNavegar("nutricao"); }}
        style={estilos.item}
        activeOpacity={0.85}
      >
        <View style={estilos.areaIcone}>
          <View style={[estilos.iconeBase, nutricaoAtiva && { backgroundColor: `${corTema}1A`, borderColor: `${corTema}90` }]}>
            <Text style={estilos.emoji}>🍎</Text>
          </View>
        </View>
        <Text style={[estilos.rotulo, nutricaoAtiva && { color: corTema }]}>Nutrição</Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    height: 50,
    minHeight: 50,
    backgroundColor: "#111612",
    borderTopWidth: 1,
    borderTopColor: "#2A2F2B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 0,
    flexShrink: 0,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  areaIcone: {
    minHeight: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  iconeBase: {
    minWidth: 44,
    height: 27,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: 12,
  },
  iconeTreino: {
    minWidth: 50,
  },
  emoji: {
    fontSize: 17,
    lineHeight: 20,
  },
  desenhoComunidade: {
    width: 24,
    height: 18,
    position: "relative",
  },
  cabecaComunidade: {
    position: "absolute",
    borderRadius: 999,
  },
  cabecaEsquerda: { width: 6, height: 6, left: 1, top: 4 },
  cabecaCentral: { width: 8, height: 8, left: 8, top: 1 },
  cabecaDireita: { width: 6, height: 6, right: 1, top: 4 },
  corpoComunidade: {
    position: "absolute",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  corpoEsquerdo: { width: 8, height: 6, left: 0, top: 11 },
  corpoCentral: { width: 10, height: 9, left: 7, top: 8 },
  corpoDireito: { width: 8, height: 6, right: 0, top: 11 },
  rotulo: {
    marginTop: 1,
    color: "#A3ACA5",
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
  },
  divisor: {
    width: 1,
    height: 25,
    backgroundColor: "#353C37",
    marginHorizontal: 8,
  },
});
