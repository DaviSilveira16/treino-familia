import React, { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { BotaoAcao, ui } from "./ControlesAcessiveis";
import { registrarDiagnostico } from "../servicos/diagnostico";

export default function AtualizacaoAplicativo() {
  const [pronta, setPronta] = useState(false);
  const [adiada, setAdiada] = useState(false);
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !("serviceWorker" in navigator) ||
      !document.querySelector('meta[name="tf-build"]')
    )
      return;
    let ativo = true;
    let registro: ServiceWorkerRegistration | undefined;
    const verificar = () => {
      if (ativo && registro?.waiting) setPronta(true);
    };
    const atualizar = () => {
      void registro
        ?.update()
        .then(verificar)
        .catch(() => {});
    };
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((r) => {
        registro = r;
        verificar();
        r.addEventListener("updatefound", () => {
          const worker = r.installing;
          worker?.addEventListener("statechange", verificar);
        });
      })
      .catch(() => registrarDiagnostico("atualizacao", "INDISPONIVEL"));
    window.addEventListener("online", atualizar);
    const intervalo = setInterval(atualizar, 15 * 60_000);
    return () => {
      ativo = false;
      window.removeEventListener("online", atualizar);
      clearInterval(intervalo);
    };
  }, []);
  if (!pronta || adiada) return null;
  return (
    <View style={[ui.cartao, { marginHorizontal: 12 }]}>
      <Text accessibilityLiveRegion="polite" style={ui.texto}>
        Atualização pronta. Termine e salve o que está fazendo. A nova versão
        será ativada depois que todas as janelas deste app forem fechadas e você
        abrir novamente.
      </Text>
      <BotaoAcao
        titulo="Continuar e lembrar na próxima abertura"
        onPress={() => setAdiada(true)}
      />
    </View>
  );
}
