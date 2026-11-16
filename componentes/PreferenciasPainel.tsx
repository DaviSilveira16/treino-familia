import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

export type Preferencias = {
  meta: number;
  medidas: boolean;
  comunidade: boolean;
  intervalo: number;
};
export const preferenciasIniciais: Preferencias = {
  meta: 3, medidas: false, comunidade: false, intervalo: 30,
};

export default function PreferenciasPainel({ atual, salvar }: {
  atual: Preferencias;
  salvar: (novo: Preferencias) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
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
  const opcao = (rotulo: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" disabled={ocupado} onPress={onPress} style={s.botao}>
      <Text style={s.texto}>{rotulo}</Text>
    </Pressable>
  );
  return (
    <View style={s.cartao}>
      {opcao(aberto ? "Fechar meta e lembretes" : "Meta e lembretes", () => {
        setAberto(!aberto);
        setForm(atual);
        setMeta(String(atual.meta));
        setIntervalo(String(atual.intervalo));
      })}
      {aberto && <>
        <Text style={s.texto}>Preferências deste aparelho. Os avisos aparecem no painel com o app aberto.</Text>
        <Text style={s.texto}>Meta de treinos por semana</Text>
        <TextInput style={s.botao} accessibilityLabel="Meta de treinos por semana" keyboardType="number-pad" value={meta} onChangeText={setMeta} />
        {([["medidas", "Registrar medidas"], ["comunidade", "Novidades da família"]] as const).map(([chave, titulo]) => (
          <View key={chave} style={s.linha}>
            <Text style={s.texto}>{titulo}</Text>
            <Switch accessibilityLabel={titulo} value={form[chave]} onValueChange={(valor) => setForm({ ...form, [chave]: valor })} />
          </View>
        ))}
        {form.medidas && <>
          <Text style={s.texto}>Intervalo entre medições, em dias</Text>
          <TextInput style={s.botao} accessibilityLabel="Intervalo entre medições" keyboardType="number-pad" value={intervalo} onChangeText={setIntervalo} />
        </>}
        {opcao("Salvar meta e lembretes", () => void executar(async () => {
          const m = Number(meta), d = Number(intervalo);
          if (!Number.isInteger(m) || m < 1 || m > 21)
            throw new Error("Escolha de 1 a 21 treinos por semana.");
          if (!Number.isInteger(d) || d < 1 || d > 365)
            throw new Error("Escolha um intervalo de 1 a 365 dias.");
          await salvar({ meta: m, intervalo: d, medidas: form.medidas, comunidade: form.comunidade });
          setMensagem("Preferências salvas.");
        }))}
        {mensagem ? <Text accessibilityLiveRegion="polite" style={s.texto}>{mensagem}</Text> : null}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#191E1B", marginBottom: 16 },
  texto: { color: "#E0E8E2", fontSize: 14 },
  botao: { minHeight: 44, padding: 10, justifyContent: "center", borderWidth: 1, borderColor: "#45544A", borderRadius: 10, color: "#F0F3F1" },
  linha: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
