import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useNavigationState } from "@react-navigation/native";

type Props = { corTema?: string };

export default function NavegacaoInferior({ corTema = "#35D07F" }: Props) {
  const navegacao = useNavigation<any>();
  const rotaAtual = useNavigationState(
    (estado) => estado.routes[estado.index]?.name ?? "Inicio",
  );
  const comunidadeAtiva = rotaAtual === "comunidade";

  return (
    <View
      style={[estilos.barra, { paddingBottom: Platform.OS === "ios" ? 12 : 7 }]}
    >
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Ir para treinos"
        onPress={() => navegacao.navigate("Inicio")}
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
      <View style={estilos.divisor} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Abrir comunidade da família"
        onPress={() => {
          if (!comunidadeAtiva) navegacao.navigate("comunidade");
        }}
        style={estilos.item}
        activeOpacity={0.8}
      >
        <View
          style={[
            estilos.icone,
            comunidadeAtiva && {
              backgroundColor: `${corTema}24`,
              borderColor: `${corTema}90`,
            },
          ]}
        >
          <Text style={estilos.emoji}>👥</Text>
        </View>
        <Text style={[estilos.rotulo, comunidadeAtiva && { color: corTema }]}>
          Comunidade
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    minHeight: 66,
    paddingTop: 7,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
    backgroundColor: "#111613",
    borderTopWidth: 1,
    borderTopColor: "#303A33",
  },
  item: {
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  icone: {
    minWidth: 46,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 20 },
  rotulo: { color: "#9AA69D", fontSize: 11, fontWeight: "700" },
  divisor: { width: 1, height: 35, backgroundColor: "#303A33" },
});
