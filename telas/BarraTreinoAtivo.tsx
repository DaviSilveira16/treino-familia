import React, { memo, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { assinarRascunhos, lerResumoTreinoAtivo, type ResumoTreinoAtivo } from "../servicos/treinoLocal";
import { sincronizarTreinosPendentes } from "../servicos/treinoSincronizacao";

function Contagem({ fimEm, pausado, restantes }: { fimEm?: number | null; pausado?: boolean; restantes?: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { if (!fimEm || pausado) return; const timer = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(timer); }, [fimEm, pausado]);
  const segundos = pausado ? restantes ?? 0 : fimEm ? Math.max(0, Math.ceil((fimEm - agora) / 1000)) : 0;
  return segundos > 0 ? <Text style={estilos.descanso}>Descanso {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}{pausado ? " · pausado" : ""}</Text> : null;
}
function Barra({ usuarioId, corTema, visivel, onRetomar }: { usuarioId: string; corTema: string; visivel: boolean; onRetomar: (plano: { planId: string; planName: string }) => void }) {
  const [resumo, setResumo] = useState<ResumoTreinoAtivo | null>(null);
  useEffect(() => {
    let ativo = true;
    let versao = 0;
    let ultimoResumo: ResumoTreinoAtivo | null = null;
    const refresh = async () => {
      const pedido = ++versao;
      try { const atual = await lerResumoTreinoAtivo(usuarioId); if (ativo && pedido === versao) { ultimoResumo = atual; setResumo(atual); } }
      catch { /* Keep the last known local summary; never discard pending data. */ }
    };
    const sincronizar = () => { void sincronizarTreinosPendentes(usuarioId).then(refresh).catch(refresh); };
    refresh(); sincronizar();
    const cancelar = assinarRascunhos(refresh);
    const rede = NetInfo.addEventListener(estado => { if (estado.isConnected && estado.isInternetReachable !== false) sincronizar(); });
    const foco = AppState.addEventListener("change", estado => { if (estado === "active") { refresh(); sincronizar(); } });
    const tentar = () => { if (ativo && ultimoResumo?.pendencias && !ultimoResumo.conflito && (typeof navigator === "undefined" || navigator.onLine !== false)) sincronizar(); };
    const intervalo = setInterval(tentar, 12000);
    if (typeof window !== "undefined") { window.addEventListener("online", tentar); window.addEventListener("focus", tentar); }
    return () => { ativo = false; cancelar(); rede(); foco.remove(); clearInterval(intervalo); if (typeof window !== "undefined") { window.removeEventListener("online", tentar); window.removeEventListener("focus", tentar); } };
  }, [usuarioId]);
  if (!visivel || !resumo) return null;
  return <TouchableOpacity style={[estilos.barra, { borderColor: `${corTema}70` }]} onPress={() => onRetomar(resumo)} accessibilityRole="button" accessibilityLabel={`${resumo.finalizacaoPendente ? "Conclusão pendente" : "Continuar treino"}: ${resumo.planName}, ${resumo.seriesConcluidas} de ${resumo.totalSeries} séries`}>
    <View style={estilos.textos}><Text style={[estilos.titulo, { color: corTema }]} numberOfLines={1}>{resumo.finalizacaoPendente ? "Conclusão pendente de envio" : "Continuar treino"} · {resumo.planName}</Text><Text style={estilos.detalhes}>{resumo.seriesConcluidas}/{resumo.totalSeries} séries{resumo.conflito ? " · revisar conflito" : resumo.pendencias ? ` · ${resumo.pendencias} pendente(s)` : " · salvo"}</Text><Contagem fimEm={resumo.descanso?.fimEm} pausado={resumo.descanso?.pausado} restantes={resumo.descanso?.segundosPausados} /></View><Text style={[estilos.seta, { color: corTema }]}>›</Text>
  </TouchableOpacity>;
}
export default memo(Barra);
const estilos = StyleSheet.create({ barra: { marginHorizontal: 12, marginBottom: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", backgroundColor: "#19251E" }, textos: { flex: 1 }, titulo: { fontSize: 13, fontWeight: "800" }, detalhes: { color: "#C4CFC7", fontSize: 12, marginTop: 2 }, descanso: { color: "#FACC15", fontSize: 12, marginTop: 2 }, seta: { fontSize: 25, marginLeft: 8 } });
