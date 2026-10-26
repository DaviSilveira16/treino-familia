import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { formatarTempo } from "./ContadoresTreino";

export default function ProgressoFinalizacao({
  inicio,
  estimativa,
  salvando,
  online,
  erro,
  cor,
}: {
  inicio: number;
  estimativa: number | null;
  salvando: boolean;
  online: boolean;
  erro: boolean;
  cor: string;
}) {
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);
  const segundos = Math.max(0, Math.floor((agora - inicio) / 1000));
  const aguardando = !salvando && (!online || erro);
  return (
    <View
      accessibilityLabel="Progresso da conclusão do treino"
      style={{
        padding: 16,
        gap: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: cor,
        backgroundColor: "#191E1B",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {!aguardando ? <ActivityIndicator color={cor} /> : null}
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: "#F0F4F1", fontWeight: "800", fontSize: 17 }}
        >
          {salvando
            ? "Salvando neste aparelho…"
            : aguardando
              ? "Treino salvo · envio pendente"
              : "Finalizando seu treino…"}
        </Text>
      </View>
      <Text
        accessibilityLabel="Tempo de espera da conclusão"
        style={{ color: "#E1E8E3" }}
      >
        Tempo decorrido: {formatarTempo(segundos)}
      </Text>
      <Text style={{ color: "#A4ADA7", lineHeight: 20 }}>
        {aguardando
          ? "Sem previsão de término enquanto aguardamos conexão ou uma nova tentativa. Sua conclusão está guardada neste aparelho."
          : estimativa === null
            ? "Ainda não há envios anteriores para estimar o tempo. Estamos aguardando a confirmação."
            : segundos < estimativa
              ? `Previsão: cerca de ${estimativa - segundos} s restantes, com base nos envios anteriores deste aparelho. Pode variar conforme a conexão.`
              : "Está levando mais tempo que nos envios anteriores. A confirmação depende da conexão e do servidor."}
      </Text>
      {!salvando ? (
        <Text style={{ color: "#A4ADA7", lineHeight: 20 }}>
          Você pode sair desta tela. O envio continuará quando o app tiver
          conexão.
        </Text>
      ) : null}
    </View>
  );
}
