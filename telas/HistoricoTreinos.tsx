import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { supabase } from "../supabase";

const estiloRolagemWeb =
  Platform.OS === "web"
    ? ({
        flex: 1,
        minHeight: 0,
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",
      } as any)
    : { flex: 1, minHeight: 0 };

type SessaoTreino = {
  id: string;
  plan_id: string | null;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};

type SerieTreino = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
};

type TreinoHistorico = SessaoTreino & {
  nomeTreino: string;
  series: SerieTreino[];
};

type Props = {
  onVoltar: () => void;
};

function formatarData(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data não disponível";

  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatarHora(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatarCarga(valor: number) {
  return Number(valor).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
}

export default function HistoricoTreinos({ onVoltar }: Props) {
  const [historico, setHistorico] = useState<TreinoHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [sessaoExpandida, setSessaoExpandida] = useState<string | null>(null);

  const carregarHistorico = useCallback(async (atualizacao = false) => {
    if (atualizacao) setAtualizando(true);
    else setCarregando(true);

    try {
      const { data: usuarioData, error: erroUsuario } =
        await supabase.auth.getUser();

      if (erroUsuario || !usuarioData.user) {
        Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
        setHistorico([]);
        return;
      }

      const usuarioId = usuarioData.user.id;

      const { data: sessoes, error: erroSessoes } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, started_at, finished_at, notes")
        .eq("user_id", usuarioId)
        .order("started_at", { ascending: false });

      if (erroSessoes) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar o histórico: ${erroSessoes.message}`,
        );
        return;
      }

      const listaSessoes = (sessoes ?? []) as SessaoTreino[];

      if (listaSessoes.length === 0) {
        setHistorico([]);
        return;
      }

      const idsSessoes = listaSessoes.map((sessao) => sessao.id);
      const idsPlanos = Array.from(
        new Set(
          listaSessoes
            .map((sessao) => sessao.plan_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const [resultadoSeries, resultadoPlanos] = await Promise.all([
        supabase
          .from("workout_sets")
          .select(
            "id, session_id, exercise_id, exercise_name, set_number, reps, weight_kg",
          )
          .eq("user_id", usuarioId)
          .in("session_id", idsSessoes)
          .order("set_number", { ascending: true }),
        idsPlanos.length > 0
          ? supabase
              .from("workout_plans")
              .select("id, name")
              .eq("user_id", usuarioId)
              .in("id", idsPlanos)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (resultadoSeries.error) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar as séries: ${resultadoSeries.error.message}`,
        );
        return;
      }

      if (resultadoPlanos.error) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar os nomes dos treinos: ${resultadoPlanos.error.message}`,
        );
        return;
      }

      const series = (resultadoSeries.data ?? []) as SerieTreino[];
      const planos = (resultadoPlanos.data ?? []) as {
        id: string;
        name: string;
      }[];
      const nomesPlanos = new Map(
        planos.map((plano) => [plano.id, plano.name]),
      );

      const resultado = listaSessoes.map((sessao) => ({
        ...sessao,
        nomeTreino: sessao.plan_id
          ? (nomesPlanos.get(sessao.plan_id) ?? "Treino removido")
          : "Treino removido",
        series: series.filter((serie) => serie.session_id === sessao.id),
      }));

      setHistorico(resultado);
    } catch {
      Alert.alert(
        "Erro",
        "Não foi possível conectar ao Supabase para carregar o histórico.",
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  function alternarDetalhes(id: string) {
    setSessaoExpandida((atual) => (atual === id ? null : id));
  }

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <StatusBar barStyle="light-content" backgroundColor="#101312" />
        <ActivityIndicator size="large" color="#35D07F" />
        <Text style={estilos.textoSecundario}>Carregando seu histórico...</Text>
      </View>
    );
  }

  return (
    <View style={estilos.container}>
      <StatusBar barStyle="light-content" backgroundColor="#101312" />

      <ScrollView
        style={estiloRolagemWeb}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => carregarHistorico(true)}
            tintColor="#35D07F"
            colors={["#35D07F"]}
          />
        }
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Histórico de treinos</Text>
        <Text style={estilos.subtitulo}>
          Consulte os registros de cargas e repetições salvos anteriormente.
        </Text>

        <View style={estilos.resumo}>
          <Text style={estilos.resumoNumero}>{historico.length}</Text>
          <Text style={estilos.resumoTexto}>
            {historico.length === 1
              ? "registro encontrado"
              : "registros encontrados"}
          </Text>
        </View>

        {historico.length === 0 ? (
          <View style={estilos.vazio}>
            <Text style={estilos.vazioEmoji}>📋</Text>
            <Text style={estilos.vazioTitulo}>
              Seu histórico aparecerá aqui
            </Text>
            <Text style={estilos.vazioDescricao}>
              Registre as cargas e repetições em “Meus treinos”. Os registros
              salvos serão exibidos nesta tela.
            </Text>
          </View>
        ) : (
          <View style={estilos.lista}>
            {historico.map((sessao) => {
              const expandida = sessaoExpandida === sessao.id;
              const exercicios = Array.from(
                new Set(
                  sessao.series.map(
                    (serie) =>
                      serie.exercise_name?.trim() || "Exercício sem nome",
                  ),
                ),
              );
              const volumeTotal = sessao.series.reduce(
                (total, serie) =>
                  total +
                  Number(serie.weight_kg || 0) * Number(serie.reps || 0),
                0,
              );

              return (
                <View key={sessao.id} style={estilos.cartao}>
                  <TouchableOpacity
                    style={estilos.cabecalhoCartao}
                    onPress={() => alternarDetalhes(sessao.id)}
                    activeOpacity={0.8}
                  >
                    <View style={estilos.iconeData}>
                      <Text style={estilos.iconeDataTexto}>📅</Text>
                    </View>

                    <View style={estilos.informacoesCartao}>
                      <Text style={estilos.nomeTreino}>
                        {sessao.nomeTreino}
                      </Text>
                      <Text style={estilos.data}>
                        {formatarData(sessao.started_at)}
                      </Text>
                      <Text style={estilos.hora}>
                        {formatarHora(sessao.started_at)}
                        {sessao.finished_at &&
                        sessao.finished_at !== sessao.started_at
                          ? ` – ${formatarHora(sessao.finished_at)}`
                          : ""}
                      </Text>
                      <Text style={estilos.resumoSessao}>
                        {exercicios.length}{" "}
                        {exercicios.length === 1 ? "exercício" : "exercícios"} ·{" "}
                        {sessao.series.length}{" "}
                        {sessao.series.length === 1
                          ? "série registrada"
                          : "séries registradas"}
                      </Text>
                    </View>

                    <Text style={estilos.seta}>{expandida ? "⌃" : "⌄"}</Text>
                  </TouchableOpacity>

                  {expandida && (
                    <View style={estilos.detalhes}>
                      {sessao.series.length === 0 ? (
                        <Text style={estilos.semSeries}>
                          Este registro não possui séries salvas.
                        </Text>
                      ) : (
                        exercicios.map((nomeExercicio) => {
                          const seriesExercicio = sessao.series.filter(
                            (serie) =>
                              (serie.exercise_name?.trim() ||
                                "Exercício sem nome") === nomeExercicio,
                          );

                          return (
                            <View
                              key={`${sessao.id}-${nomeExercicio}`}
                              style={estilos.exercicio}
                            >
                              <Text style={estilos.nomeExercicio}>
                                {nomeExercicio}
                              </Text>
                              <View style={estilos.linhaTabela}>
                                <Text
                                  style={[
                                    estilos.celulaCabecalho,
                                    estilos.celulaSerie,
                                  ]}
                                >
                                  Série
                                </Text>
                                <Text style={estilos.celulaCabecalho}>
                                  Repetições
                                </Text>
                                <Text style={estilos.celulaCabecalho}>
                                  Carga (kg)
                                </Text>
                              </View>
                              {seriesExercicio.map((serie) => (
                                <View
                                  key={serie.id}
                                  style={estilos.linhaTabela}
                                >
                                  <Text
                                    style={[
                                      estilos.celula,
                                      estilos.celulaSerie,
                                    ]}
                                  >
                                    {serie.set_number}
                                  </Text>
                                  <Text style={estilos.celula}>
                                    {serie.reps}
                                  </Text>
                                  <Text style={estilos.celula}>
                                    {formatarCarga(Number(serie.weight_kg))}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          );
                        })
                      )}

                      <View style={estilos.rodapeDetalhes}>
                        <Text style={estilos.volumeLabel}>
                          Volume registrado
                        </Text>
                        <Text style={estilos.volumeValor}>
                          {formatarCarga(volumeTotal)} kg × repetições
                        </Text>
                      </View>

                      {sessao.notes ? (
                        <Text style={estilos.observacoes}>
                          Observação: {sessao.notes}
                        </Text>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101312",
  },
  centralizado: {
    flex: 1,
    backgroundColor: "#101312",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  conteudo: {
    paddingHorizontal: 22,
    paddingTop: 54,
    paddingBottom: 36,
  },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 22,
  },
  textoVoltar: {
    color: "#35D07F",
    fontSize: 16,
    fontWeight: "700",
  },
  marca: {
    color: "#35D07F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F0F3F1",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitulo: {
    color: "#A4ADA7",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 22,
  },
  resumo: {
    backgroundColor: "#1B3024",
    borderColor: "#2C593E",
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
  },
  resumoNumero: {
    color: "#35D07F",
    fontSize: 28,
    fontWeight: "800",
  },
  resumoTexto: {
    color: "#B4C5B9",
    fontSize: 13,
    marginTop: 3,
  },
  lista: {
    gap: 12,
  },
  cartao: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 16,
    overflow: "hidden",
  },
  cabecalhoCartao: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  iconeData: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconeDataTexto: {
    fontSize: 21,
  },
  informacoesCartao: {
    flex: 1,
  },
  nomeTreino: {
    color: "#F0F3F1",
    fontSize: 16,
    fontWeight: "800",
  },
  data: {
    color: "#C4CDC7",
    fontSize: 12,
    marginTop: 5,
    textTransform: "capitalize",
  },
  hora: {
    color: "#8F9A92",
    fontSize: 12,
    marginTop: 3,
  },
  resumoSessao: {
    color: "#35D07F",
    fontSize: 12,
    marginTop: 7,
    fontWeight: "600",
  },
  seta: {
    color: "#35D07F",
    fontSize: 23,
    marginLeft: 8,
  },
  detalhes: {
    borderTopWidth: 1,
    borderTopColor: "#303832",
    padding: 14,
  },
  exercicio: {
    marginBottom: 18,
  },
  nomeExercicio: {
    color: "#F0F3F1",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  linhaTabela: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#2B332E",
  },
  celulaCabecalho: {
    color: "#A4ADA7",
    fontSize: 11,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  celula: {
    color: "#F0F3F1",
    fontSize: 13,
    flex: 1,
    textAlign: "center",
  },
  celulaSerie: {
    flex: 0.6,
  },
  semSeries: {
    color: "#A4ADA7",
    fontSize: 13,
    lineHeight: 20,
  },
  rodapeDetalhes: {
    backgroundColor: "#101512",
    borderRadius: 10,
    padding: 12,
    marginTop: 2,
  },
  volumeLabel: {
    color: "#A4ADA7",
    fontSize: 12,
  },
  volumeValor: {
    color: "#35D07F",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  observacoes: {
    color: "#A4ADA7",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  vazio: {
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 18,
    padding: 24,
    marginTop: 4,
  },
  vazioEmoji: {
    fontSize: 42,
    marginBottom: 14,
  },
  vazioTitulo: {
    color: "#F0F3F1",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  vazioDescricao: {
    color: "#A4ADA7",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  textoSecundario: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 14,
    textAlign: "center",
  },
});
