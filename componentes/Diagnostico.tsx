import React, { useState } from "react";
import { Platform, Text, TextInput } from "react-native";
import { gerarDiagnostico } from "../servicos/diagnostico";
import { listarFotosModelo, listarRascunhos } from "../servicos/treinoLocal";
import { listarPendenciasNutricao } from "../servicos/nutricaoRepositorio";
import { BotaoAcao, CartaoFerramenta, ui } from "./ControlesAcessiveis";

export default function Diagnostico({ usuarioId }: { usuarioId?: string }) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  async function copiar() {
    const pendencias = usuarioId ? await Promise.all([listarRascunhos(usuarioId), listarPendenciasNutricao(usuarioId), listarFotosModelo(usuarioId)]).then(([t,n,f]) => ({ treinos: t.filter(r => r.finalizacao || r.criacaoPendente || r.series.some(s => s.pendente)).length, nutricao: n.reduce((total, item) => total + item.quantidade, 0), fotos: f.length })).catch(() => undefined) : undefined;
    const conteudo = gerarDiagnostico(Platform.OS, pendencias);
    setTexto(conteudo);
    try {
      if (Platform.OS !== "web" || !navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(conteudo); setAviso("Diagnóstico copiado.");
    } catch { setAviso("Selecione o texto abaixo para copiar manualmente."); }
  }
  return <CartaoFerramenta titulo="Diagnóstico"><Text style={ui.texto}>Informações técnicas sem dados pessoais. Nada é enviado automaticamente.</Text><BotaoAcao titulo="Copiar diagnóstico" onPress={() => void copiar()} />{aviso ? <Text accessibilityLiveRegion="polite" style={ui.texto}>{aviso}</Text> : null}{texto ? <TextInput accessibilityLabel="Texto do diagnóstico" multiline editable={false} selectTextOnFocus value={texto} style={[ui.input, { minHeight: 160 }]} /> : null}</CartaoFerramenta>;
}
