import { Alert as AlertaNativa, Platform } from "react-native";
import type { AlertButton, AlertOptions } from "react-native";

function textoDialogo(titulo?: string | null, mensagem?: string | null) {
  const partes = [titulo, mensagem].filter(
    (parte): parte is string =>
      typeof parte === "string" && parte.trim().length > 0,
  );
  return partes.join("\n\n") || "Treino Família";
}

export const Alert = {
  alert(
    titulo: string | null | undefined,
    mensagem?: string | null,
    botoes?: AlertButton[],
    opcoes?: AlertOptions,
  ) {
    if (Platform.OS !== "web" || typeof window === "undefined") {
      AlertaNativa.alert(titulo, mensagem, botoes, opcoes);
      return;
    }

    const texto = textoDialogo(titulo, mensagem);
    if (!botoes || botoes.length === 0) {
      window.alert(texto);
      return;
    }

    if (botoes.length === 1) {
      window.alert(texto);
      botoes[0].onPress?.();
      return;
    }

    const cancelar = botoes.find((botao) => botao.style === "cancel");
    const confirmar = botoes.find((botao) => botao.style !== "cancel");
    if (cancelar && confirmar) {
      const aceitou = window.confirm(texto);
      (aceitou ? confirmar : cancelar).onPress?.();
      if (!aceitou) opcoes?.onDismiss?.();
      return;
    }

    window.alert(texto);
  },
};
