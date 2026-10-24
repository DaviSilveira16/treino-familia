import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = { children: React.ReactNode };
type Estado = { houveErro: boolean };

/** Mantém uma alternativa visível caso alguma tela lance um erro ao renderizar. */
export default class LimiteDeErro extends React.Component<Props, Estado> {
  state: Estado = { houveErro: false };

  static getDerivedStateFromError(): Estado {
    return { houveErro: true };
  }

  componentDidCatch(erro: Error) {
    // Não envia dados de conta ou de saúde a serviços externos.
    console.error("Falha ao renderizar o Treino Família:", erro);
  }

  render() {
    if (!this.state.houveErro) return this.props.children;

    return (
      <View style={estilos.tela}>
        <Text style={estilos.icone}>⚠️</Text>
        <Text style={estilos.titulo}>Não foi possível abrir esta tela</Text>
        <Text style={estilos.texto}>
          Ocorreu um problema inesperado na interface. Seus treinos já
          confirmados permanecem registrados na sua conta.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={estilos.botao}
          onPress={() => this.setState({ houveErro: false })}
        >
          <Text style={estilos.textoBotao}>Tentar novamente</Text>
        </TouchableOpacity>
        {Platform.OS === "web" && typeof window !== "undefined" ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={estilos.botaoSecundario}
            onPress={() => window.location.reload()}
          >
            <Text style={estilos.textoSecundario}>Recarregar aplicativo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
    justifyContent: "center",
    alignItems: "center",
    padding: 26,
    gap: 14,
  },
  icone: { fontSize: 34 },
  titulo: {
    color: "#F1F5F2",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  texto: {
    color: "#A4ADA7",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 400,
  },
  botao: {
    marginTop: 8,
    backgroundColor: "#1689E7",
    borderRadius: 12,
    minHeight: 48,
    minWidth: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  textoBotao: { color: "#0C151E", fontWeight: "800" },
  botaoSecundario: { padding: 12, minHeight: 44, justifyContent: "center" },
  textoSecundario: { color: "#B0CBE1", fontWeight: "700" },
});
