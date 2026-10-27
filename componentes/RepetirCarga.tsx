import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function RepetirCarga({
  marcado,
  onAlterar,
  cor,
  bloqueado = false,
  rotulo = "Repetir carga em todas as séries",
}: {
  marcado: boolean;
  onAlterar: (valor: boolean) => void;
  cor: string;
  bloqueado?: boolean;
  rotulo?: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="checkbox"
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: marcado, disabled: bloqueado }}
      disabled={bloqueado}
      onPress={() => onAlterar(!marcado)}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: cor,
          backgroundColor: marcado ? cor : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#101312", fontWeight: "900" }}>
          {marcado ? "✓" : ""}
        </Text>
      </View>
      <Text style={{ color: "#E1E8E3", flex: 1 }}>{rotulo}</Text>
    </TouchableOpacity>
  );
}
