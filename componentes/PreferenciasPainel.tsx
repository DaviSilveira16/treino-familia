import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { DiaProgramado, PlanoPainel } from "../servicos/painelSemanal";

export type Preferencias = {
  meta: number;
  treino: boolean;
  medidas: boolean;
  comunidade: boolean;
  hora: string;
  intervalo: number;
};
export const preferenciasIniciais: Preferencias = {
  meta: 3, treino: false, medidas: false, comunidade: false, hora: "18:00", intervalo: 30,
};
const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default function PreferenciasPainel({ atual, planos, programacao, cor, salvar, agendar }: {
  atual: Preferencias;
  planos: PlanoPainel[];
  programacao: DiaProgramado[];
  cor: string;
  salvar: (novo: Preferencias) => Promise<void>;
  agendar: (dia: DiaProgramado) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState<number | null>(null);
  const [form, setForm] = useState(atual);
  const [meta, setMeta] = useState(String(atual.meta));
  const [intervalo, setIntervalo] = useState(String(atual.intervalo));
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const executar = async (acao: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    setMensagem("");
    try { await acao(); }
    catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Não foi possível guardar a alteração.");
    } finally { setOcupado(false); }
  };
  const opcao = (rotulo: string, onPress: () => void, selecionado?: boolean, id = rotulo) => (
    <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: selecionado }}
      disabled={ocupado} onPress={onPress} style={[s.botao, selecionado && { borderColor: cor }]}>
      <Text style={s.texto}>{rotulo}</Text>
    </Pressable>
  );
  return (
    <View style={s.cartao}>
      {opcao(aberto ? "Fechar programação e lembretes" : "Programação e lembretes", () => {
        setAberto(!aberto);
        setForm(atual);
        setMeta(String(atual.meta));
        setIntervalo(String(atual.intervalo));
      })}
      {aberto && <>
        <Text style={s.titulo}>Programação semanal</Text>
        {dias.map((nome, indice) => {
          const item = programacao.find((d) => d.day_of_week === indice);
          const nomePlano = planos.find((p) => p.id === item?.plan_id)?.name;
          return opcao(`${nome} · ${item?.is_rest_day ? "Descanso" : nomePlano ?? "Sem programação"}`,
            () => setDia(dia === indice ? null : indice), dia === indice);
        })}
        {dia !== null && <>
          <Text style={s.titulo}>{dias[dia]}</Text>
          {[{ id: "", name: "Sem programação" }, { id: "descanso", name: "Descanso" }, ...planos].map((p) =>
            opcao(p.name, () => void executar(async () => {
              await agendar({ day_of_week: dia, plan_id: p.id && p.id !== "descanso" ? p.id : null, is_rest_day: p.id === "descanso" });
              setDia(null);
            }), undefined, p.id))}
        </>}
        <Text style={s.titulo}>Meta e lembretes</Text>
        <Text style={s.texto}>Preferências deste aparelho. Os avisos aparecem no painel com o app aberto.</Text>
        <Text style={s.texto}>Meta de treinos por semana</Text>
        <TextInput style={s.botao} accessibilityLabel="Meta de treinos por semana" keyboardType="number-pad" value={meta} onChangeText={setMeta} />
        {([["treino", "Treinos programados"], ["medidas", "Registrar medidas"], ["comunidade", "Novidades da família"]] as const).map(([chave, titulo]) => (
          <View key={chave} style={s.linha}>
            <Text style={s.texto}>{titulo}</Text>
            <Switch accessibilityLabel={titulo} value={form[chave]} onValueChange={(valor) => setForm({ ...form, [chave]: valor })} />
          </View>
        ))}
        {form.treino && <>
          <Text style={s.texto}>Horário local do treino</Text>
          <TextInput style={s.botao} accessibilityLabel="Horário local do treino" placeholder="HH:MM" placeholderTextColor="#A4ADA7"
            value={form.hora} onChangeText={(hora) => setForm({ ...form, hora })} />
        </>}
        {form.medidas && <>
          <Text style={s.texto}>Intervalo entre medições, em dias</Text>
          <TextInput style={s.botao} accessibilityLabel="Intervalo entre medições" keyboardType="number-pad" value={intervalo} onChangeText={setIntervalo} />
        </>}
        {opcao("Salvar meta e lembretes", () => void executar(async () => {
          const m = Number(meta), d = Number(intervalo);
          if (!Number.isInteger(m) || m < 1 || m > 21)
            throw new Error("Escolha de 1 a 21 treinos por semana.");
          if (form.treino && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.hora))
            throw new Error("Informe o horário em HH:MM.");
          if (!Number.isInteger(d) || d < 1 || d > 365)
            throw new Error("Escolha um intervalo de 1 a 365 dias.");
          await salvar({ ...form, meta: m, intervalo: d });
          setMensagem("Preferências salvas.");
        }))}
        {mensagem ? <Text accessibilityLiveRegion="polite" style={s.texto}>{mensagem}</Text> : null}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#191E1B", marginBottom: 16 },
  titulo: { fontSize: 16, fontWeight: "800", color: "#F0F3F1" },
  texto: { color: "#E0E8E2", fontSize: 14 },
  botao: { minHeight: 44, padding: 10, justifyContent: "center", borderWidth: 1, borderColor: "#45544A", borderRadius: 10, color: "#F0F3F1" },
  linha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
