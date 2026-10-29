import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useVoltarDoModal } from "../../servicos/voltarModal";

export const estilosNutricao = StyleSheet.create({
  card: { backgroundColor: "#191E1B", borderWidth: 1, borderColor: "#303A33", padding: 16, borderRadius: 16, gap: 10 },
  titulo: { color: "#F0F3F1", fontSize: 18, fontWeight: "800" },
  texto: { color: "#B5BEB8", fontSize: 14, lineHeight: 21 },
  pequeno: { color: "#A4ADA7", fontSize: 12, lineHeight: 18 },
  linha: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  campo: { minWidth: 130, flexGrow: 1, gap: 6 },
  input: { color: "#F0F3F1", borderWidth: 1, borderColor: "#46534A", backgroundColor: "#101612", borderRadius: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  botao: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  botaoTexto: { fontWeight: "700", fontSize: 13, textAlign: "center" },
});
export function BotaoNutricao({ titulo, onPress, cor = "#35D07F", primario = false, disabled = false }: { titulo: string; onPress: () => void; cor?: string; primario?: boolean; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[estilosNutricao.botao, { borderColor: `${cor}77`, backgroundColor: primario ? cor : `${cor}14`, opacity: disabled ? 0.4 : 1 }]}><Text style={[estilosNutricao.botaoTexto, { color: primario ? "#101612" : cor }]}>{titulo}</Text></TouchableOpacity>;
}
export function CampoNutricao({ titulo, valor, onChange, numerico = false, placeholder, disabled = false, maxLength = 200 }: { titulo: string; valor: string; onChange: (v: string) => void; numerico?: boolean; placeholder?: string; disabled?: boolean; maxLength?: number }) {
  return <View style={estilosNutricao.campo}><Text style={estilosNutricao.texto}>{titulo}</Text><TextInput accessibilityLabel={titulo} style={estilosNutricao.input} value={valor} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#7E8D83" keyboardType={numerico ? "decimal-pad" : "default"} autoCapitalize={numerico ? "none" : "sentences"} editable={!disabled} maxLength={maxLength} /></View>;
}
export function ModalNutricao({ visivel, titulo, onFechar, children, cor, bloqueado = false, aviso }: { visivel: boolean; titulo: string; onFechar: () => void; children: React.ReactNode; cor?: string; bloqueado?: boolean; aviso?: string }) {
  const fechar = () => { if (!bloqueado) onFechar(); };
  useVoltarDoModal(visivel, fechar);
  return <Modal visible={visivel} transparent animationType="fade" onRequestClose={fechar}><View style={{ flex: 1, backgroundColor: "#000B", justifyContent: "center", padding: 12 }}><View style={{ width: "100%", maxWidth: 760, maxHeight: "90%", alignSelf: "center", backgroundColor: "#101612", borderRadius: 18, borderWidth: 1, borderColor: "#3A493E", overflow: "hidden" }}><View style={{ padding: 14, gap: 10 }}><Text style={estilosNutricao.titulo}>{titulo}</Text><BotaoNutricao titulo={bloqueado ? "Guardando…" : "Fechar"} onPress={fechar} disabled={bloqueado} cor={cor} /></View><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>{aviso ? <Text accessibilityRole="alert" style={{ color: "#FFD090", lineHeight: 21 }}>{aviso}</Text> : null}{children}</ScrollView></View></View></Modal>;
}
export const numeroKcal = (valor: number) => Math.round(valor).toLocaleString("pt-BR");
