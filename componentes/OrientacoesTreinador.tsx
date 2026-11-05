import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { chamarAcompanhamento, validarFicha, type Entrega } from "../servicos/acompanhamento";

function validarEntrega(valor: Entrega | null, planId: string): Entrega | null {
  if (!valor?.id || valor.plan_id !== planId) return null;
  validarFicha(valor.document);
  return valor;
}

/** Somente cópias pertencentes ao aluno; nunca armazena histórico de terceiros. */
export default function OrientacoesTreinador({ usuarioId, planId, cor = "#35D07F" }: { usuarioId: string; planId: string; cor?: string }) {
  return <Orientacoes key={`${usuarioId}:${planId}`} usuarioId={usuarioId} planId={planId} cor={cor} />;
}
function Orientacoes({ usuarioId, planId, cor }: { usuarioId: string; planId: string; cor: string }) {
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [aberto, setAberto] = useState(false);
  const [local, setLocal] = useState(false);
  useEffect(() => {
    let ativo = true;
    if (!usuarioId || !planId) return;
    const chave = `@treino-familia:orientacoes:v1:${usuarioId}:${planId}`;
    void (async () => {
      try {
        const copia = await AsyncStorage.getItem(chave);
        if (copia && ativo) { setEntrega(validarEntrega(JSON.parse(copia) as Entrega, planId)); setLocal(true); }
      } catch { /* A leitura remota continua se o cache estiver indisponível. */ }
      try {
        const atual = validarEntrega(await chamarAcompanhamento<Entrega | null>(usuarioId, "delivery", { plan_id: planId }), planId);
        if (!ativo) return;
        setEntrega(atual); setLocal(false);
        if (atual) await AsyncStorage.setItem(chave, JSON.stringify(atual));
        else await AsyncStorage.removeItem(chave);
      } catch { /* Uma falha não bloqueia a execução do treino; a cópia pertence ao aluno. */ }
    })();
    return () => { ativo = false; };
  }, [usuarioId, planId]);
  if (!entrega) return null;
  return <View style={e.card}>
    <Text style={[e.titulo, { color: cor }]}>Preparado por {entrega.coach_name} · revisão {entrega.revision}</Text>
    <Text style={e.texto}>Esta ficha é sua, mesmo após encerrar o vínculo.{local ? " Orientações salvas neste aparelho." : ""}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: aberto }} style={e.botao} onPress={() => setAberto(!aberto)}>
      <Text style={[e.titulo, { color: cor }]}>{aberto ? "Ocultar orientações" : "Ver orientações do treinador"}</Text>
    </TouchableOpacity>
    {aberto && <>
      <Text style={e.texto}>Prescrição original. Suas cargas e adaptações atuais podem ser diferentes.</Text>
      {!!entrega.document.instructions && <Text style={e.texto}>{entrega.document.instructions}</Text>}
      {entrega.document.exercises.map((ex, i) => <View key={ex.exercise_id ?? i} style={e.exercicio}>
        <Text style={e.titulo}>{ex.name}</Text>
        <Text style={e.texto}>{ex.sets} séries · {ex.reps} reps · {ex.weight.toLocaleString("pt-BR")} kg · descanso: {ex.rest} s</Text>
        {!!ex.instructions && <Text style={e.texto}>{ex.instructions}</Text>}
      </View>)}
    </>}
  </View>;
}
const e = StyleSheet.create({
  card: { backgroundColor: "#191E1B", borderColor: "#354039", borderWidth: 1, borderRadius: 12, padding: 14, marginVertical: 12, gap: 8 },
  titulo: { color: "#F1F5F2", fontSize: 14, fontWeight: "700" },
  texto: { color: "#BCC7C0", fontSize: 14, lineHeight: 21 },
  botao: { minHeight: 44, justifyContent: "center" },
  exercicio: { gap: 4, paddingVertical: 8 },
});
