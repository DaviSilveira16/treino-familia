import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
export type DadosEditorExercicio = {
  nome: string;
  series: string;
  repeticoes: string;
  peso: string;
};
export default function EditorExercicioSessao({
  inicial,
  editando,
  nomeBloqueado,
  cor,
  onFechar,
  onSalvar,
}: {
  inicial: DadosEditorExercicio;
  editando: boolean;
  nomeBloqueado: boolean;
  cor: string;
  onFechar: () => void;
  onSalvar: (dados: DadosEditorExercicio) => Promise<void>;
}) {
  const [dados, setDados] = useState(inicial),
    [erro, setErro] = useState(""),
    [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await onSalvar(dados);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível guardar o exercício.",
      );
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (!salvando) onFechar();
      }}
    >
      <View style={s.fundo}>
        <ScrollView
          contentContainerStyle={s.area}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.cartao}>
            <Text style={s.titulo}>
              {editando
                ? "Editar exercício da sessão"
                : "Adicionar exercício à sessão"}
            </Text>
            <Text style={s.ajuda}>
              O cronômetro continua. O plano salvo só muda se você escolher isso
              ao finalizar.
            </Text>
            {(
              [
                ["nome", "Nome do exercício/aparelho"],
                ["series", "Quantidade de séries"],
                ["repeticoes", "Repetições iniciais"],
                ["peso", "Carga inicial em kg"],
              ] as const
            ).map(([campo, rotulo]) => (
              <View key={campo} style={s.grupo}>
                <Text style={s.texto}>{rotulo}</Text>
                <TextInput
                  accessibilityLabel={rotulo}
                  value={dados[campo]}
                  onChangeText={(valor) =>
                    setDados((atual) => ({ ...atual, [campo]: valor }))
                  }
                  editable={!salvando && !(campo === "nome" && nomeBloqueado)}
                  maxLength={campo === "nome" ? 100 : 10}
                  keyboardType={
                    campo === "nome"
                      ? "default"
                      : campo === "peso"
                        ? "decimal-pad"
                        : "number-pad"
                  }
                  style={s.input}
                />
              </View>
            ))}
            {nomeBloqueado ? (
              <Text style={s.ajuda}>
                Já há séries registradas. Para trocar o aparelho, adicione outro
                exercício; as séries realizadas continuam identificadas
                corretamente.
              </Text>
            ) : null}
            {erro ? (
              <Text accessibilityRole="alert" style={s.erro}>
                {erro}
              </Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Salvar exercício na sessão"
              disabled={salvando}
              onPress={() => void salvar()}
              style={[s.botao, { backgroundColor: cor }]}
            >
              <Text style={s.escuro}>
                {salvando ? "Guardando..." : "Salvar exercício na sessão"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={salvando}
              onPress={onFechar}
              style={s.botao}
            >
              <Text style={s.texto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: "#000B" },
  area: { flexGrow: 1, justifyContent: "center", padding: 18 },
  cartao: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 18,
    padding: 18,
    gap: 14,
    backgroundColor: "#191E1B",
  },
  titulo: { color: "#F0F4F1", fontSize: 20, fontWeight: "800" },
  texto: { color: "#E1E8E3", fontWeight: "700" },
  ajuda: { color: "#A4ADA7", lineHeight: 20, fontSize: 12 },
  grupo: { gap: 6 },
  input: {
    backgroundColor: "#101312",
    borderColor: "#45544A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: "#F0F4F1",
  },
  botao: {
    minHeight: 44,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  escuro: { color: "#101312", fontWeight: "800" },
  erro: { color: "#FCA5A5" },
});
