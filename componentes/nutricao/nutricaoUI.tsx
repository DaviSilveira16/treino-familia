import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { TextInputProps } from "react-native";
import { Alert } from "../../servicos/alerta";

export function erroNutricional(erro: unknown): string {
  return erro && typeof erro === "object" && "message" in erro && typeof erro.message === "string"
    ? erro.message
    : "Não foi possível guardar a alteração. Seus registros anteriores continuam disponíveis.";
}
export function confirmarNutricao(titulo: string, mensagem: string): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(titulo, mensagem, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Confirmar", style: "destructive", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
export const numeroNutricao = (valor: number, casas = 1) => valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export function BotaoNutricional({ texto, onPress, cor, desabilitado = false, primario = false, perigo = false, carregando = false, pequeno = false, rotulo }: {
  texto: string; onPress: () => void; cor: string; desabilitado?: boolean; primario?: boolean; perigo?: boolean; carregando?: boolean; pequeno?: boolean; rotulo?: string;
}) {
  const tom = perigo ? "#FF9A9A" : cor;
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={rotulo ?? texto} disabled={desabilitado || carregando}
    onPress={onPress} style={[n.botao, pequeno && n.botaoPequeno, { borderColor: `${tom}66`, backgroundColor: primario ? cor : `${tom}10` }, (desabilitado || carregando) && n.desabilitado]}>
    {carregando ? <ActivityIndicator color={primario ? "#101312" : tom} /> : <Text style={[n.textoBotao, { color: primario ? "#101312" : tom }]}>{texto}</Text>}
  </TouchableOpacity>;
}
export function CampoNutricional({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  return <View style={n.campo}><Text style={n.rotulo}>{rotulo}</Text><TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? rotulo} placeholderTextColor="#7D8981" style={[n.input, props.style]} /></View>;
}
export const n = StyleSheet.create({
  pilha: { gap: 12 },
  linha: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  crescer: { flex: 1, minWidth: 130 },
  cartao: { backgroundColor: "#191F1B", borderWidth: 1, borderColor: "#303B33", borderRadius: 16, padding: 14, gap: 10 },
  titulo: { color: "#F0F5F1", fontWeight: "800", fontSize: 19 },
  subtitulo: { color: "#F0F5F1", fontWeight: "700", fontSize: 16 },
  texto: { color: "#DFE8E1", fontSize: 14, lineHeight: 21 },
  secundario: { color: "#A9B6AD", fontSize: 13, lineHeight: 20 },
  erro: { color: "#FFB1A9", fontSize: 13, lineHeight: 21, backgroundColor: "#49251F", padding: 10, borderRadius: 8 },
  campo: { gap: 6, marginBottom: 8 },
  rotulo: { color: "#D5E0D8", fontSize: 13, fontWeight: "600" },
  input: { color: "#F0F5F1", backgroundColor: "#111713", borderColor: "#46544A", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, minHeight: 46, fontSize: 15 },
  botao: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, alignItems: "center", justifyContent: "center" },
  botaoPequeno: { minWidth: 44, paddingHorizontal: 10 },
  textoBotao: { fontSize: 13, fontWeight: "800", textAlign: "center" },
  desabilitado: { opacity: 0.4 },
  fundoModal: { flex: 1, backgroundColor: "#000000B8", alignItems: "center", justifyContent: "center", padding: 14 },
  modal: { width: "100%", maxWidth: 760, maxHeight: "90%", backgroundColor: "#151C17", borderWidth: 1, borderColor: "#3A493F", borderRadius: 18, overflow: "hidden" },
  cabecalhoModal: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#303B33", flexDirection: "row", alignItems: "center", gap: 12 },
  corpoModal: { padding: 16, gap: 12 },
  divisoria: { height: 1, backgroundColor: "#303B33", marginVertical: 4 },
});
