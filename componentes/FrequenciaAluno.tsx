import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { carregarMesAcompanhado, chaveDiaLocal, gradeMes } from "../servicos/frequenciaAcompanhamento";
import type { SessaoAcompanhada } from "../servicos/acompanhamento";

export default function FrequenciaAluno({ usuarioId, vinculoId, cor }: { usuarioId: string; vinculoId: string; cor: string }) {
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [dia, setDia] = useState(() => new Date().getDate());
  const [tentativa, setTentativa] = useState(0);
  const chave = `${mes.getFullYear()}-${mes.getMonth()}:${tentativa}`;
  return <>
    <View style={e.navegacao}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mês anterior" style={e.seta} onPress={() => {
        setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1, 12)); setDia(1);
      }}><Text style={[e.titulo, { color: cor }]}>‹</Text></TouchableOpacity>
      <Text style={e.mes}>{mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Próximo mês" style={e.seta} onPress={() => {
        setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1, 12)); setDia(1);
      }}><Text style={[e.titulo, { color: cor }]}>›</Text></TouchableOpacity>
    </View>
    <MesAluno key={`${vinculoId}:${chave}`} usuarioId={usuarioId} vinculoId={vinculoId} mes={mes} dia={dia} onDia={setDia} cor={cor} />
    <TouchableOpacity accessibilityRole="button" style={e.atualizar} onPress={() => setTentativa(valor => valor + 1)}>
      <Text style={[e.texto, { color: cor }]}>Atualizar frequência</Text>
    </TouchableOpacity>
  </>;
}

function MesAluno({ usuarioId, vinculoId, mes, dia, onDia, cor }: {
  usuarioId: string; vinculoId: string; mes: Date; dia: number; onDia: (dia: number) => void; cor: string;
}) {
  const [sessoes, setSessoes] = useState<SessaoAcompanhada[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    void carregarMesAcompanhado(usuarioId, vinculoId, mes.getFullYear(), mes.getMonth(), () => ativo)
      .then(lista => { if (ativo) setSessoes(lista); })
      .catch(problema => { if (ativo) setErro(problema instanceof Error ? problema.message : "Não foi possível consultar a frequência."); });
    return () => { ativo = false; };
  }, [usuarioId, vinculoId, mes]);
  if (erro) return <Text accessibilityRole="alert" style={e.erro}>{erro}</Text>;
  if (!sessoes) return <View style={e.card}><ActivityIndicator color={cor} /><Text style={e.texto}>Carregando frequência do mês…</Text></View>;
  const porDia = new Map<string, SessaoAcompanhada[]>();
  for (const sessao of sessoes) {
    const chave = chaveDiaLocal(sessao.started_at);
    porDia.set(chave, [...(porDia.get(chave) ?? []), sessao]);
  }
  const escolhido = new Date(mes.getFullYear(), mes.getMonth(), dia, 12);
  const doDia = porDia.get(chaveDiaLocal(escolhido)) ?? [];
  const minutos = sessoes.reduce((total, sessao) => total + Number(sessao.duration_minutes ?? 0), 0);
  return <>
    <View style={e.resumo}>
      <View style={e.indicador}><Text style={[e.numero, { color: cor }]}>{porDia.size}</Text><Text style={e.texto}>dias treinados</Text></View>
      <View style={e.indicador}><Text style={[e.numero, { color: cor }]}>{sessoes.length}</Text><Text style={e.texto}>treinos no mês</Text></View>
      <View style={e.indicador}><Text style={[e.numero, { color: cor }]}>{minutos.toLocaleString("pt-BR")}</Text><Text style={e.texto}>min registrados</Text></View>
    </View>
    <View style={e.card}>
      <View style={e.grade}>{["D", "S", "T", "Q", "Q", "S", "S"].map((letra, i) => <View key={i} style={e.celula}><Text style={e.texto}>{letra}</Text></View>)}</View>
      <View style={e.grade}>
        {gradeMes(mes.getFullYear(), mes.getMonth()).map((numero, i) => {
          const data = numero ? new Date(mes.getFullYear(), mes.getMonth(), numero, 12) : null;
          const quantidade = data ? (porDia.get(chaveDiaLocal(data))?.length ?? 0) : 0;
          return <View style={e.celula} key={i}>{data && numero && <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={`${data.toLocaleDateString("pt-BR")}, ${quantidade} treino(s)`} accessibilityState={{ selected: dia === numero }}
            onPress={() => onDia(numero)} style={[e.dia, quantidade > 0 && { backgroundColor: `${cor}25` }, dia === numero && { borderColor: cor }]}>
            <Text style={[e.textoDia, quantidade > 0 && { color: cor }]}>{numero}</Text>
            <View style={[e.ponto, { backgroundColor: quantidade > 0 ? cor : "transparent" }]} />
          </TouchableOpacity>}</View>;
        })}
      </View>
      <Text style={e.texto}>● Dia com treino de musculação concluído</Text>
    </View>
    <View style={e.card}>
      <Text style={e.titulo}>{escolhido.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</Text>
      {doDia.length === 0 ? <Text style={e.texto}>Nenhum treino concluído neste dia.</Text> : doDia.map(s => <View key={s.id} style={e.registro}>
        <Text style={[e.titulo, { color: cor }]}>{s.plan_name}</Text>
        <Text style={e.texto}>{s.duration_minutes ?? "—"} min · {s.sets.length} séries realizadas</Text>
        {!!s.comment && <Text style={e.texto}>{s.comment}</Text>}
      </View>)}
    </View>
    <Text style={e.texto}>Frequência baseada nos treinos de musculação concluídos pelo aluno. Os registros são consultados no fuso horário deste aparelho.</Text>
  </>;
}

const e = StyleSheet.create({
  navegacao: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seta: { minHeight: 48, minWidth: 48, justifyContent: "center", alignItems: "center" },
  mes: { color: "#F1F5F2", fontSize: 18, fontWeight: "700", textTransform: "capitalize", flexShrink: 1, textAlign: "center" },
  titulo: { color: "#F1F5F2", fontSize: 18, fontWeight: "700" },
  texto: { color: "#BCC7C0", fontSize: 13, lineHeight: 20 },
  erro: { color: "#FFB4AB", fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: "#191E1B", borderRadius: 14, padding: 12, gap: 12, borderWidth: 1, borderColor: "#354039" },
  resumo: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  indicador: { flex: 1, minWidth: 90, padding: 10, borderRadius: 12, backgroundColor: "#191E1B" },
  numero: { fontSize: 24, fontWeight: "800" },
  grade: { flexDirection: "row", flexWrap: "wrap" },
  celula: { width: "14.285714%", alignItems: "center", justifyContent: "center" },
  dia: { minHeight: 44, width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: "transparent", gap: 3 },
  textoDia: { fontSize: 15, fontWeight: "600", color: "#F1F5F2" },
  ponto: { height: 4, width: 4, borderRadius: 2 },
  registro: { gap: 6, paddingVertical: 6 },
  atualizar: { minHeight: 48, justifyContent: "center", alignItems: "center" },
});
