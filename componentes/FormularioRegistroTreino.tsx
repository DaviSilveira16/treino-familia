import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../supabase";
import { CartaoExercicioTreino } from "./CartaoExercicioTreino";
import ResumoRegistroTreino from "./ResumoRegistroTreino";
import { guardarRegistroManual, montarRegistroManual } from "../servicos/registroTreinoManual";
import { acrescentarSerie } from "../servicos/treinoAdaptavel";
import type { PerfilCalculoTreino, IntensidadeTreino } from "../servicos/caloriasTreino";
import type { EsforcoPercebido, PlanoExercicio, SerieRascunho } from "../servicos/treinoLocal";

export default function FormularioRegistroTreino({ usuarioId, planId, planName, dia, perfil, cor, onSalvo }: {
  usuarioId: string; planId: string; planName: string; dia: string; perfil: PerfilCalculoTreino | null; cor: string;
  onSalvo: (pendente: boolean, mensagem?: string) => Promise<void>;
}) {
  const [exercicios, setExercicios] = useState<PlanoExercicio[]>([]), [series, setSeries] = useState<SerieRascunho[]>([]);
  const [carregando, setCarregando] = useState(true), [salvando, setSalvando] = useState(false), [erro, setErro] = useState("");
  const [duracao, setDuracao] = useState(""), [intensidade, setIntensidade] = useState<IntensidadeTreino | null>(null), [esforco, setEsforco] = useState<EsforcoPercebido>("nao_informado");
  const envio = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let ativo = true;
    (async () => {
      setCarregando(true); setErro("");
      try {
        const { data: lista, error } = await supabase.from("exercises").select("id, name, sets_goal, reps_goal").eq("user_id", usuarioId).eq("plan_id", planId).order("position", { ascending: true }).abortSignal(controller.signal);
        if (error) throw error;
        const base = (lista ?? []) as PlanoExercicio[];
        if (!base.length) throw new Error("Este plano ainda não tem exercícios. Cadastre os exercícios em Meus treinos.");
        const { data: referencias, error: erroCargas } = await supabase.from("exercise_load_defaults").select("exercise_id, set_number, reps, weight_kg").eq("user_id", usuarioId).in("exercise_id", base.map(e => e.id)).abortSignal(controller.signal);
        if (erroCargas) throw erroCargas;
        const abertas: SerieRascunho[] = base.flatMap(e => Array.from({ length: Math.min(20, Math.max(1, Number(e.sets_goal) || 1, referencias?.filter(r => r.exercise_id === e.id).length ?? 0)) }, (_, i) => {
          const r = referencias?.find(r => r.exercise_id === e.id && Number(r.set_number) === i + 1);
          return { chave: `${e.id}:${i + 1}`, exercise_id: e.id, exercise_name: e.name, set_number: i + 1, reps: String(r?.reps ?? (e.reps_goal.match(/\d+/)?.[0] || "8")), weight_kg: String(r?.weight_kg ?? 0), concluida: false };
        }));
        if (ativo) { setExercicios(base); setSeries(abertas); }
      } catch (e) { if (ativo && !controller.signal.aborted) setErro(e instanceof Error ? e.message : "Não foi possível carregar o plano."); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; controller.abort(); };
  }, [usuarioId, planId]);
  const salvar = async () => {
    if (envio.current) return; envio.current = true; setSalvando(true); setErro("");
    try {
      if (!intensidade) throw new Error("Informe a intensidade do treino.");
      const rascunho = montarRegistroManual({ usuarioId, planId, planName, dia, perfil, exercicios, series, duracao: Number(duracao.replace(",", ".")), intensidade, esforco });
      const resultado = await guardarRegistroManual(rascunho);
      await onSalvo(!resultado.concluido, resultado.erro);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível guardar o registro."); }
    finally { envio.current = false; setSalvando(false); }
  };
  if (carregando) return <ActivityIndicator color={cor} accessibilityLabel="Carregando exercícios do registro" />;
  return <View style={s.grupo}>
    <Text style={s.ajuda}>Confira o que realmente realizou. As cargas do plano são sugestões editáveis e só entram no histórico depois de você marcar as séries. Este registro não altera as referências do plano.</Text>
    {series.length ? <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Marcar todas as séries deste registro" disabled={salvando} onPress={() => setSeries(atuais => atuais.map(s => ({ ...s, concluida: true })))} style={s.botao}><Text style={{ color: cor }}>Marcar todas as séries do plano como realizadas</Text></TouchableOpacity>
      {exercicios.map(e => <CartaoExercicioTreino key={e.id} exercicio={e} series={series.filter(s => s.exercise_id === e.id)} cor={cor} bloqueado={salvando} chaveSalvando={null} onCopiar={() => {}} onCampo={(chave, campo, valor) => setSeries(atuais => atuais.map(s => s.chave === chave && !s.concluida ? { ...s, [campo]: valor } : s))} onAlternar={serie => setSeries(atuais => atuais.map(s => s.chave === serie.chave ? { ...s, concluida: !s.concluida } : s))}
        onAdicionarSerie={() => setSeries(atuais => atuais.filter(s => s.exercise_id === e.id).length < 20 ? [...atuais, acrescentarSerie(e, atuais)] : atuais)}
        onRetirarSerie={serie => setSeries(atuais => atuais.filter(s => s.exercise_id === e.id).length > 1 ? atuais.filter(s => s.chave !== serie.chave) : atuais)} />)}
      <ResumoRegistroTreino perfil={perfil} series={series.filter(s => s.concluida).map(s => ({ exercise_id: s.exercise_id, exercise_name: s.exercise_name, set_number: s.set_number, reps: Number(s.reps), weight_kg: Number(s.weight_kg.replace(",", ".")) }))} duracao={duracao} onDuracao={setDuracao} intensidade={intensidade} onIntensidade={setIntensidade} esforco={esforco} onEsforco={setEsforco} cor={cor} bloqueado={salvando} />
      <Text style={s.ajuda}>O calendário usa meio-dia como referência da data escolhida e guarda a duração informada. O horário não representa uma medição por cronômetro.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmar registro de musculação" disabled={salvando} onPress={() => void salvar()} style={[s.botao, { backgroundColor: cor }]}><Text style={s.escuro}>{salvando ? "Guardando..." : "Confirmar treino realizado"}</Text></TouchableOpacity>
    </> : null}
    {erro ? <Text accessibilityRole="alert" style={s.erro}>{erro}</Text> : null}
  </View>;
}
const s = StyleSheet.create({ grupo: { gap: 16, marginTop: 12 }, ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 20 }, erro: { color: "#FCA5A5" }, botao: { minHeight: 44, padding: 12, borderRadius: 10, borderColor: "#45544A", borderWidth: 1, justifyContent: "center" }, escuro: { color: "#101312", fontWeight: "800", textAlign: "center" } });
