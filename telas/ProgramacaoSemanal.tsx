import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

type Treino = {
  id: string;
  name: string;
};

type ProgramacaoDia = {
  day_of_week: number;
  plan_id: string | null;
  is_rest_day: boolean;
};

type Props = {
  onVoltar: () => void;
};

const dias = [
  { valor: 0, nome: "Domingo", curto: "DOM" },
  { valor: 1, nome: "Segunda-feira", curto: "SEG" },
  { valor: 2, nome: "Terça-feira", curto: "TER" },
  { valor: 3, nome: "Quarta-feira", curto: "QUA" },
  { valor: 4, nome: "Quinta-feira", curto: "QUI" },
  { valor: 5, nome: "Sexta-feira", curto: "SEX" },
  { valor: 6, nome: "Sábado", curto: "SÁB" },
];

export default function ProgramacaoSemanal({ onVoltar }: Props) {
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [programacao, setProgramacao] = useState<
    Record<number, ProgramacaoDia>
  >({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [usuarioId, setUsuarioId] = useState("");

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: usuarioData, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !usuarioData.user) {
        Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
        return;
      }

      const idUsuario = usuarioData.user.id;
      setUsuarioId(idUsuario);

      const [resultadoTreinos, resultadoProgramacao] = await Promise.all([
        supabase
          .from("workout_plans")
          .select("id, name")
          .eq("user_id", idUsuario)
          .order("created_at", { ascending: true }),
        supabase
          .from("weekly_workout_schedule")
          .select("day_of_week, plan_id, is_rest_day")
          .eq("user_id", idUsuario),
      ]);

      if (resultadoTreinos.error) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar os treinos: ${resultadoTreinos.error.message}`,
        );
        return;
      }
      if (resultadoProgramacao.error) {
        Alert.alert(
          "Erro ao carregar programação",
          `${resultadoProgramacao.error.message}\n\nConfira se executou o SQL de criação da tabela weekly_workout_schedule no Supabase.`,
        );
        return;
      }

      setTreinos((resultadoTreinos.data ?? []) as Treino[]);

      const mapa: Record<number, ProgramacaoDia> = {};
      for (const dia of dias) {
        mapa[dia.valor] = {
          day_of_week: dia.valor,
          plan_id: null,
          is_rest_day: false,
        };
      }
      for (const item of resultadoProgramacao.data ?? []) {
        mapa[item.day_of_week] = {
          day_of_week: item.day_of_week,
          plan_id: item.plan_id,
          is_rest_day: item.is_rest_day,
        };
      }
      setProgramacao(mapa);
    } catch {
      Alert.alert("Erro", "Não foi possível conectar ao Supabase.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  function selecionarTreino(dia: number, planId: string) {
    setProgramacao((atual) => ({
      ...atual,
      [dia]: {
        day_of_week: dia,
        plan_id: planId,
        is_rest_day: false,
      },
    }));
  }

  function definirDescanso(dia: number) {
    setProgramacao((atual) => ({
      ...atual,
      [dia]: {
        day_of_week: dia,
        plan_id: null,
        is_rest_day: true,
      },
    }));
  }

  function limparDia(dia: number) {
    setProgramacao((atual) => ({
      ...atual,
      [dia]: {
        day_of_week: dia,
        plan_id: null,
        is_rest_day: false,
      },
    }));
  }

  async function salvarProgramacao() {
    if (!usuarioId) {
      Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
      return;
    }

    setSalvando(true);
    try {
      const registros = dias.map((dia) => {
        const item = programacao[dia.valor] ?? {
          day_of_week: dia.valor,
          plan_id: null,
          is_rest_day: false,
        };
        return {
          user_id: usuarioId,
          day_of_week: dia.valor,
          plan_id: item.is_rest_day ? null : item.plan_id,
          is_rest_day: item.is_rest_day,
        };
      });

      const { error } = await supabase
        .from("weekly_workout_schedule")
        .upsert(registros, { onConflict: "user_id,day_of_week" });

      if (error) {
        Alert.alert("Erro ao salvar", error.message);
        return;
      }

      Alert.alert("Programação salva", "Sua semana de treinos foi atualizada.");
      await carregarDados();
    } catch {
      Alert.alert("Erro", "Não foi possível salvar a programação.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <StatusBar barStyle="light-content" backgroundColor="#101312" />
        <ActivityIndicator size="large" color="#35D07F" />
        <Text style={estilos.textoSecundario}>Carregando programação...</Text>
      </View>
    );
  }

  return (
    <View style={estilos.container}>
      <StatusBar barStyle="light-content" backgroundColor="#101312" />
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Programação semanal</Text>
        <Text style={estilos.subtitulo}>
          Escolha o treino de cada dia ou marque descanso. As alterações só são
          salvas ao tocar no botão no final.
        </Text>

        {treinos.length === 0 && (
          <View style={estilos.aviso}>
            <Text style={estilos.avisoTexto}>
              Você ainda não cadastrou treinos. Entre em “Meus treinos” e crie
              seus treinos antes de montar a semana.
            </Text>
          </View>
        )}

        {dias.map((dia) => {
          const item = programacao[dia.valor] ?? {
            day_of_week: dia.valor,
            plan_id: null,
            is_rest_day: false,
          };
          const hoje = new Date().getDay() === dia.valor;
          return (
            <View
              key={dia.valor}
              style={[estilos.cartaoDia, hoje && estilos.cartaoHoje]}
            >
              <View style={estilos.cabecalhoDia}>
                <View style={estilos.diaIcone}>
                  <Text style={estilos.diaCurto}>{dia.curto}</Text>
                </View>
                <View style={estilos.diaTextoContainer}>
                  <Text style={estilos.nomeDia}>{dia.nome}</Text>
                  {hoje && <Text style={estilos.etiquetaHoje}>HOJE</Text>}
                </View>
                <Text style={estilos.resumoDia}>
                  {item.is_rest_day
                    ? "Descanso"
                    : item.plan_id
                      ? (treinos.find((treino) => treino.id === item.plan_id)
                          ?.name ?? "Treino removido")
                      : "Não definido"}
                </Text>
              </View>

              <View style={estilos.listaTreinos}>
                {treinos.map((treino) => {
                  const selecionado =
                    !item.is_rest_day && item.plan_id === treino.id;
                  return (
                    <TouchableOpacity
                      key={treino.id}
                      style={[
                        estilos.opcaoTreino,
                        selecionado && estilos.opcaoSelecionada,
                      ]}
                      onPress={() => selecionarTreino(dia.valor, treino.id)}
                    >
                      <Text
                        style={[
                          estilos.textoOpcao,
                          selecionado && estilos.textoOpcaoSelecionada,
                        ]}
                      >
                        {selecionado ? "✓ " : ""}
                        {treino.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={estilos.acoesDia}>
                <TouchableOpacity
                  style={[
                    estilos.botaoDescanso,
                    item.is_rest_day && estilos.botaoDescansoAtivo,
                  ]}
                  onPress={() => definirDescanso(dia.valor)}
                >
                  <Text
                    style={[
                      estilos.textoAcao,
                      item.is_rest_day && estilos.textoDescansoAtivo,
                    ]}
                  >
                    {item.is_rest_day ? "✓ Dia de descanso" : "Marcar descanso"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={estilos.botaoLimpar}
                  onPress={() => limparDia(dia.valor)}
                >
                  <Text style={estilos.textoLimpar}>Limpar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[estilos.botaoSalvar, salvando && estilos.botaoDesabilitado]}
          onPress={salvarProgramacao}
          disabled={salvando}
        >
          {salvando ? (
            <ActivityIndicator color="#101312" />
          ) : (
            <Text style={estilos.textoBotaoSalvar}>
              Salvar programação semanal
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101312" },
  conteudo: { padding: 22, paddingBottom: 44 },
  centralizado: {
    flex: 1,
    backgroundColor: "#101312",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  textoSecundario: { color: "#A9B2AC", fontSize: 14 },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 18,
  },
  textoVoltar: { color: "#35D07F", fontSize: 16, fontWeight: "600" },
  marca: {
    color: "#35D07F",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F3F5F3",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitulo: {
    color: "#A9B2AC",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
  aviso: {
    backgroundColor: "#382F1C",
    borderColor: "#75612D",
    borderWidth: 1,
    padding: 13,
    borderRadius: 12,
    marginBottom: 16,
  },
  avisoTexto: { color: "#F0DCA7", lineHeight: 20 },
  cartaoDia: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  cartaoHoje: { borderColor: "#35D07F", borderWidth: 1.5 },
  cabecalhoDia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  diaIcone: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#243A2D",
    alignItems: "center",
    justifyContent: "center",
  },
  diaCurto: { color: "#8DE8B0", fontSize: 11, fontWeight: "800" },
  diaTextoContainer: { flex: 1, gap: 3 },
  nomeDia: { color: "#F3F5F3", fontSize: 15, fontWeight: "700" },
  etiquetaHoje: {
    color: "#35D07F",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  resumoDia: {
    color: "#A9B2AC",
    fontSize: 12,
    maxWidth: 120,
    textAlign: "right",
  },
  listaTreinos: { gap: 7 },
  opcaoTreino: {
    borderColor: "#343D37",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  opcaoSelecionada: { backgroundColor: "#1D4A31", borderColor: "#35D07F" },
  textoOpcao: { color: "#D0D7D2", fontSize: 14 },
  textoOpcaoSelecionada: { color: "#FFFFFF", fontWeight: "700" },
  acoesDia: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },
  botaoDescanso: {
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#536057",
  },
  botaoDescansoAtivo: { backgroundColor: "#3A3422", borderColor: "#D7B75C" },
  textoAcao: { color: "#D0D7D2", fontSize: 12, fontWeight: "600" },
  textoDescansoAtivo: { color: "#F2D989" },
  botaoLimpar: { paddingVertical: 9, paddingHorizontal: 11 },
  textoLimpar: { color: "#A9B2AC", fontSize: 12 },
  botaoSalvar: {
    backgroundColor: "#35D07F",
    borderRadius: 13,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  botaoDesabilitado: { opacity: 0.6 },
  textoBotaoSalvar: { color: "#101312", fontSize: 15, fontWeight: "800" },
});
