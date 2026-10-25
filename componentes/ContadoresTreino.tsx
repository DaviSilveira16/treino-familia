import React, { memo, useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { segundosDeDescanso, type DescansoTreino } from "../servicos/treinoLocal";

export const OPCOES_DESCANSO = [30, 60, 90, 120, 180] as const;
export function formatarTempo(segundos: number): string {
  const seguro = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(seguro / 60)).padStart(2, "0")}:${String(seguro % 60).padStart(2, "0")}`;
}
/** O relógio só redesenha este componente; nenhum formulário depende de seus ticks. */
function useAgora(ativo: boolean) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    const atualizar = () => setAgora(Date.now());
    atualizar();
    const intervalo = setInterval(atualizar, 1000);
    const app = AppState.addEventListener("change", (estado) => { if (estado === "active") atualizar(); });
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("focus", atualizar);
    return () => {
      clearInterval(intervalo); app.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("focus", atualizar);
    };
  }, [ativo]);
  return agora;
}
export const CronometroTreino = memo(function CronometroTreino({ inicio, fim, ativo, cor }: { inicio: string; fim?: string; ativo: boolean; cor: string }) {
  const agora = useAgora(ativo && !fim);
  return <Text accessibilityLabel="Tempo de treino" style={[estilos.relogio, { color: cor }]}>{formatarTempo(((fim ? Date.parse(fim) : agora) - Date.parse(inicio)) / 1000)}</Text>;
});

export const PainelDescanso = memo(function PainelDescanso({ descanso, ativo, bloqueado, cor, onAlterar, onPreferencia }: {
  descanso: DescansoTreino; ativo: boolean; bloqueado: boolean; cor: string;
  onAlterar: (descanso: DescansoTreino) => void; onPreferencia: (segundos: number) => void;
}) {
  const agora = useAgora(ativo && descanso.fimEm !== null && !descanso.pausado && !bloqueado);
  const restantes = segundosDeDescanso(descanso, agora);
  const concluido = descanso.fimEm !== null && restantes === 0 && !descanso.pausado;
  const reiniciar = () => onAlterar({ ...descanso, fimEm: Date.now() + descanso.duracao * 1000, pausado: false, segundosPausados: 0 });
  return <View style={estilos.cartao}>
    <Text style={estilos.titulo}>Cronômetro de descanso</Text>
    <Text accessibilityLabel={`Descanso: ${restantes} segundos${descanso.pausado ? ", pausado" : ""}`} style={[estilos.relogio, { color: cor, textAlign: "center" }]}>{formatarTempo(restantes)}</Text>
    {concluido ? <Text accessibilityLiveRegion="polite" style={{ color: cor, textAlign: "center" }}>✓ Descanso concluído · pode continuar</Text> : null}
    <View style={estilos.linha}>{OPCOES_DESCANSO.map((valor) => <TouchableOpacity key={valor} disabled={bloqueado} accessibilityRole="button" accessibilityLabel={`Descanso de ${valor} segundos`} accessibilityState={{ selected: descanso.duracao === valor, disabled: bloqueado }} onPress={() => onPreferencia(valor)} style={[estilos.botao, descanso.duracao === valor && { borderColor: cor }]}><Text style={estilos.texto}>{valor}s</Text></TouchableOpacity>)}</View>
    <View style={estilos.linha}>
      <TouchableOpacity disabled={bloqueado || restantes === 0} accessibilityRole="button" accessibilityLabel={descanso.pausado ? "Continuar descanso" : "Pausar descanso"} style={estilos.botao} onPress={() => onAlterar(descanso.pausado
        ? { ...descanso, fimEm: Date.now() + restantes * 1000, pausado: false, segundosPausados: 0 }
        : { ...descanso, fimEm: null, pausado: true, segundosPausados: segundosDeDescanso(descanso) })}><Text style={estilos.texto}>{descanso.pausado ? "Continuar" : "Pausar"}</Text></TouchableOpacity>
      <TouchableOpacity disabled={bloqueado} accessibilityRole="button" accessibilityLabel="Reiniciar descanso" style={estilos.botao} onPress={reiniciar}><Text style={estilos.texto}>Reiniciar</Text></TouchableOpacity>
      <TouchableOpacity disabled={bloqueado} accessibilityRole="button" accessibilityLabel="Pular descanso" style={estilos.botao} onPress={() => onAlterar({ ...descanso, fimEm: null, pausado: false, segundosPausados: 0 })}><Text style={estilos.texto}>Pular</Text></TouchableOpacity>
    </View>
    <Text style={estilos.ajuda}>O descanso começa após cada série e continua contando ao sair desta tela.</Text>
  </View>;
});
const estilos = StyleSheet.create({
  cartao: { backgroundColor: "#191E1B", borderColor: "#2B332E", borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  relogio: { fontSize: 42, fontWeight: "900", fontVariant: ["tabular-nums"] },
  titulo: { color: "#F0F4F1", fontSize: 17, fontWeight: "800" },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  botao: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderColor: "#45544A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  texto: { color: "#F0F4F1", fontWeight: "700" },
  ajuda: { color: "#A4ADA7", fontSize: 13, lineHeight: 19 },
});
