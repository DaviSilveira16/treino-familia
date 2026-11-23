import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export function BotaoAcao({ titulo, onPress, disabled = false, preencher = false }: { titulo: string; onPress: () => void; disabled?: boolean; preencher?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.botao, preencher && { flex: 1 }, disabled && { opacity: 0.5 }]}><Text style={ui.botaoTexto}>{titulo}</Text></TouchableOpacity>;
}
export function CartaoFerramenta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <View style={ui.cartao}><Text accessibilityRole="header" style={ui.titulo}>{titulo}</Text>{children}</View>;
}
export const ui = StyleSheet.create({
  cartao: { padding: 16, marginVertical: 8, backgroundColor: "#191E1B", borderRadius: 14, borderWidth: 1, borderColor: "#45544A", gap: 10, minWidth: 0 },
  titulo: { color: "#F0F4F1", fontSize: 18, fontWeight: "700", flexShrink: 1 },
  texto: { color: "#D2DAD5", fontSize: 14, lineHeight: 22, flexShrink: 1 },
  botao: { minHeight: 44, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#35D07F", justifyContent: "center", alignItems: "center" },
  botaoTexto: { color: "#80EAB1", fontWeight: "700", textAlign: "center", flexShrink: 1 },
  input: { color: "#F0F4F1", backgroundColor: "#101312", borderWidth: 1, borderColor: "#708178", borderRadius: 8, padding: 12, minHeight: 44 },
});
