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
  status?: string | null;
  duration_minutes?: number | null;
  intensity?: string | null;
  active_calories?: number | null;
  volume_kg?: number | null;
  exercises_count?: number | null;
  sets_completed?: number | null;
  reps_completed?: number | null;
  met_value?: number | null;
};
type SerieTreino = {
  id: string;
  session_id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
  progressoCarga?: number;
  progressoReps?: number;
  mudou?: boolean;
  serieNova?: boolean;
  diferencaCarga?: number;
  diferencaReps?: number;
};
type TreinoHistorico = SessaoTreino & {
  nomeTreino: string;
  series: SerieTreino[];
};
type SessaoCardioHistorico = {
  id: string;
  activity_name: string;
  activity_type: string;
  started_at: string;
  duration_minutes: number | null;
  distance_km: number | null;
  calories: number | null;
  active_calories?: number | null;
  intensity?: string | null;
  incline_percent?: number | null;
  heart_rate_avg?: number | null;
  speed_kmh?: number | null;
  weight_kg_snapshot?: number | null;
  height_cm_snapshot?: number | null;
  age_snapshot?: number | null;
  sex_snapshot?: string | null;
  floors_up?: number | null;
  met_value?: number | null;
  notes: string | null;
};
type Props = {
  onVoltar: () => void;
  corTema?: string;
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
function chaveExercicio(serie: SerieTreino) {
  if (serie.exercise_id) return `id:${serie.exercise_id}`;
  return (
    serie.exercise_name?.trim().toLocaleLowerCase("pt-BR") ||
    "exercício sem nome"
  );
}
function corComTransparencia(cor: string, transparencia: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(cor)) {
    return `${cor}${transparencia}`;
  }
  return cor;
}
export default function HistoricoTreinos({
  onVoltar,
  corTema = "#35D07F",
}: Props) {
  const [historico, setHistorico] = useState<TreinoHistorico[]>([]);
  const [historicoCardio, setHistoricoCardio] = useState<
    SessaoCardioHistorico[]
  >([]);
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
      const { data: cardios, error: erroCardios } = await supabase
        .from("cardio_sessions")
        .select(
          "id, activity_name, activity_type, started_at, duration_minutes, distance_km, calories, active_calories, intensity, incline_percent, heart_rate_avg, speed_kmh, weight_kg_snapshot, height_cm_snapshot, age_snapshot, sex_snapshot, floors_up, met_value, notes",
        )
        .eq("user_id", usuarioId)
        .order("started_at", { ascending: false });
      if (erroCardios) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar o histórico de cardio: ${erroCardios.message}`,
        );
        return;
      }
      setHistoricoCardio((cardios ?? []) as SessaoCardioHistorico[]);
      const { data: sessoes, error: erroSessoes } = await supabase
        .from("workout_sessions")
        .select(
          "id, plan_id, started_at, finished_at, notes, status, duration_minutes, intensity, active_calories, volume_kg, exercises_count, sets_completed, reps_completed, met_value",
        )
        .eq("user_id", usuarioId)
        .order("started_at", { ascending: false });
      if (erroSessoes) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar o histórico: ${erroSessoes.message}`,
        );
        return;
      }
      const listaSessoes = ((sessoes ?? []) as SessaoTreino[]).filter(
        (sessao) => sessao.status !== "em_andamento",
      );
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
      const resultado: TreinoHistorico[] = listaSessoes.map((sessao) => ({
        ...sessao,
        nomeTreino: sessao.plan_id
          ? (nomesPlanos.get(sessao.plan_id) ?? "Treino removido")
          : "Treino removido",
        series: series
          .filter((serie) => serie.session_id === sessao.id)
          .map((serie) => ({ ...serie })),
      }));
      const ordemCronologica = [...resultado].sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
      );
      const ultimasSeriesPorExercicio = new Map<string, SerieTreino[]>();
      for (const sessao of ordemCronologica) {
        const gruposExercicios = new Map<string, SerieTreino[]>();
        for (const serie of sessao.series) {
          const chave = `${sessao.plan_id ?? "sem-plano"}::${chaveExercicio(serie)}`;
          const grupo = gruposExercicios.get(chave) ?? [];
          grupo.push(serie);
          gruposExercicios.set(chave, grupo);
        }
        for (const [chave, seriesAtuais] of gruposExercicios) {
          const seriesAnteriores = ultimasSeriesPorExercicio.get(chave) ?? [];
          for (const serieAtual of seriesAtuais) {
            const serieAnterior = seriesAnteriores.find(
              (serie) =>
                Number(serie.set_number) === Number(serieAtual.set_number),
            );
            if (!serieAnterior) {
              serieAtual.serieNova = true;
              serieAtual.mudou = true;
              continue;
            }
            const diferencaCarga =
              Number(serieAtual.weight_kg) - Number(serieAnterior.weight_kg);
            const diferencaReps =
              Number(serieAtual.reps) - Number(serieAnterior.reps);
            serieAtual.diferencaCarga = diferencaCarga;
            serieAtual.diferencaReps = diferencaReps;
            serieAtual.mudou = diferencaCarga !== 0 || diferencaReps !== 0;
            if (diferencaCarga > 0) {
              serieAtual.progressoCarga = diferencaCarga;
            }
            if (diferencaReps > 0) {
              serieAtual.progressoReps = diferencaReps;
            }
          }
          ultimasSeriesPorExercicio.set(
            chave,
            seriesAtuais.map((serie) => ({ ...serie })),
          );
        }
      }
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
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.textoSecundario}>Carregando seu histórico...</Text>
      </View>
    );
  }
  return (
    <View style={estilos.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={estiloRolagemWeb}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => carregarHistorico(true)}
            tintColor={corTema}
            colors={[corTema]}
          />
        }
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Histórico de treinos</Text>
        <Text style={estilos.subtitulo}>
          Veja seus treinos registrados, o volume total e apenas as séries novas
          ou diferentes da última vez que você fez cada exercício.
        </Text>
        <View
          style={[
            estilos.resumo,
            {
              backgroundColor: corComTransparencia(corTema, "20"),
              borderColor: corComTransparencia(corTema, "66"),
            },
          ]}
        >
          <Text style={[estilos.resumoNumero, { color: corTema }]}>
            {historico.length}
          </Text>
          <Text style={estilos.resumoTexto}>
            {historico.length === 1
              ? "registro encontrado"
              : "registros encontrados"}
          </Text>
        </View>
        <View
          style={[
            estilos.legendaProgresso,
            { borderColor: corComTransparencia(corTema, "66") },
          ]}
        >
          <Text style={estilos.legendaTitulo}>COMO LER SUA EVOLUÇÃO</Text>
          <Text style={estilos.legendaTexto}>
            <Text style={[estilos.textoVerde, { color: corTema }]}>↑ +kg</Text>{" "}
            aumento de carga
          </Text>
          <Text style={estilos.legendaTexto}>
            <Text style={[estilos.textoVerde, { color: corTema }]}>
              ↑ +reps
            </Text>{" "}
            aumento de repetições
          </Text>
          <Text style={estilos.legendaTexto}>
            Séries novas e reduções de carga ou repetições também são
            destacadas.
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
              const todosExercicios = Array.from(
                new Set(
                  sessao.series.map(
                    (serie) =>
                      serie.exercise_name?.trim() || "Exercício sem nome",
                  ),
                ),
              );
              const seriesExibidas = sessao.series;
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
              const seriesComProgresso = sessao.series.filter(
                (serie) =>
                  (serie.progressoCarga ?? 0) > 0 ||
                  (serie.progressoReps ?? 0) > 0,
              );
              const quantidadeExerciciosComProgresso = new Set(
                seriesComProgresso.map(chaveExercicio),
              ).size;
              return (
                <View key={sessao.id} style={estilos.cartao}>
                  <TouchableOpacity
                    style={estilos.cabecalhoCartao}
                    onPress={() => alternarDetalhes(sessao.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        estilos.iconeData,
                        {
                          backgroundColor: corComTransparencia(corTema, "25"),
                        },
                      ]}
                    >
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
                      {sessao.duration_minutes != null && (
                        <Text style={estilos.hora}>
                          Duração real:{" "}
                          {Number(sessao.duration_minutes).toLocaleString(
                            "pt-BR",
                            { maximumFractionDigits: 1 },
                          )}{" "}
                          min
                          {sessao.intensity
                            ? ` · Intensidade ${sessao.intensity}`
                            : ""}
                        </Text>
                      )}
                      {sessao.active_calories != null && (
                        <Text
                          style={[estilos.resumoSessao, { color: corTema }]}
                        >
                          🔥 {Math.round(Number(sessao.active_calories))} kcal
                          ativas estimadas
                          {sessao.met_value != null
                            ? ` · ${sessao.met_value} MET`
                            : ""}
                        </Text>
                      )}
                      {sessao.volume_kg != null && (
                        <Text style={estilos.hora}>
                          Volume registrado:{" "}
                          {Math.round(Number(sessao.volume_kg)).toLocaleString(
                            "pt-BR",
                          )}{" "}
                          kg·reps
                        </Text>
                      )}
                      {sessao.reps_completed != null && (
                        <Text style={estilos.hora}>
                          Repetições concluídas:{" "}
                          {Number(sessao.reps_completed).toLocaleString(
                            "pt-BR",
                          )}
                        </Text>
                      )}
                      <Text style={[estilos.resumoSessao, { color: corTema }]}>
                        {todosExercicios.length}{" "}
                        {todosExercicios.length === 1
                          ? "exercício"
                          : "exercícios"}{" "}
                        · {sessao.series.length}{" "}
                        {sessao.series.length === 1
                          ? "série registrada"
                          : "séries registradas"}
                      </Text>
                      {seriesComProgresso.length > 0 && (
                        <View
                          style={[
                            estilos.destaqueEvolucao,
                            {
                              backgroundColor: corComTransparencia(
                                corTema,
                                "20",
                              ),
                              borderColor: corComTransparencia(corTema, "80"),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              estilos.destaqueEvolucaoTexto,
                              { color: corTema },
                            ]}
                          >
                            ↑ EVOLUÇÃO EM {quantidadeExerciciosComProgresso}{" "}
                            {quantidadeExerciciosComProgresso === 1
                              ? "EXERCÍCIO"
                              : "EXERCÍCIOS"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[estilos.seta, { color: corTema }]}>
                      {expandida ? "⌃" : "⌄"}
                    </Text>
                  </TouchableOpacity>
                  {expandida && (
                    <View style={estilos.detalhes}>
                      {sessao.series.length === 0 ? (
                        <Text style={estilos.semSeries}>
                          Este registro não possui séries salvas.
                        </Text>
                      ) : (
                        exercicios.map((nomeExercicio) => {
                          const seriesExercicio = seriesExibidas.filter(
                            (serie) =>
                              (serie.exercise_name?.trim() ||
                                "Exercício sem nome") === nomeExercicio,
                          );
                          const teveProgressoCarga = seriesExercicio.some(
                            (serie) => (serie.progressoCarga ?? 0) > 0,
                          );
                          const teveProgressoReps = seriesExercicio.some(
                            (serie) => (serie.progressoReps ?? 0) > 0,
                          );
                          return (
                            <View
                              key={`${sessao.id}-${nomeExercicio}`}
                              style={estilos.exercicio}
                            >
                              <Text style={estilos.nomeExercicio}>
                                {nomeExercicio}
                              </Text>
                              {(teveProgressoCarga || teveProgressoReps) && (
                                <View
                                  style={[
                                    estilos.faixaProgresso,
                                    {
                                      backgroundColor: corComTransparencia(
                                        corTema,
                                        "18",
                                      ),
                                      borderColor: corComTransparencia(
                                        corTema,
                                        "80",
                                      ),
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      estilos.faixaProgressoTitulo,
                                      { color: corTema },
                                    ]}
                                  >
                                    ↑ VOCÊ EVOLUIU NESTE EXERCÍCIO
                                  </Text>
                                  <View style={estilos.etiquetasProgresso}>
                                    {teveProgressoCarga && (
                                      <View
                                        style={[
                                          estilos.etiquetaProgresso,
                                          {
                                            backgroundColor:
                                              corComTransparencia(
                                                corTema,
                                                "30",
                                              ),
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            estilos.etiquetaProgressoTexto,
                                            { color: corTema },
                                          ]}
                                        >
                                          ↑ CARGA
                                        </Text>
                                      </View>
                                    )}
                                    {teveProgressoReps && (
                                      <View
                                        style={[
                                          estilos.etiquetaProgresso,
                                          {
                                            backgroundColor:
                                              corComTransparencia(
                                                corTema,
                                                "30",
                                              ),
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            estilos.etiquetaProgressoTexto,
                                            { color: corTema },
                                          ]}
                                        >
                                          ↑ REPETIÇÕES
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                              )}
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
                                  style={[
                                    estilos.linhaTabela,
                                    ((serie.progressoCarga ?? 0) > 0 ||
                                      (serie.progressoReps ?? 0) > 0) && {
                                      backgroundColor: corComTransparencia(
                                        corTema,
                                        "15",
                                      ),
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      estilos.celula,
                                      estilos.celulaSerie,
                                    ]}
                                  >
                                    {serie.set_number}
                                  </Text>
                                  <View style={estilos.celulaComProgresso}>
                                    <Text
                                      style={[
                                        estilos.celula,
                                        serie.mudou && {
                                          color: corTema,
                                          fontWeight: "900",
                                        },
                                      ]}
                                    >
                                      {serie.reps}
                                    </Text>
                                    {serie.diferencaReps !== undefined &&
                                      serie.diferencaReps !== 0 && (
                                        <Text
                                          style={[
                                            estilos.indicadorProgresso,
                                            {
                                              color:
                                                serie.diferencaReps > 0
                                                  ? corTema
                                                  : "#F29B9B",
                                            },
                                          ]}
                                        >
                                          {serie.diferencaReps > 0
                                            ? "↑ +"
                                            : "↓ "}
                                          {formatarCarga(
                                            Math.abs(serie.diferencaReps),
                                          )}
                                        </Text>
                                      )}
                                    {serie.serieNova && (
                                      <Text
                                        style={[
                                          estilos.indicadorProgresso,
                                          { color: corTema },
                                        ]}
                                      >
                                        NOVA
                                      </Text>
                                    )}
                                  </View>
                                  <View style={estilos.celulaComProgresso}>
                                    <Text
                                      style={[
                                        estilos.celula,
                                        serie.mudou && {
                                          color: corTema,
                                          fontWeight: "900",
                                        },
                                      ]}
                                    >
                                      {formatarCarga(Number(serie.weight_kg))}
                                    </Text>
                                    {serie.diferencaCarga !== undefined &&
                                      serie.diferencaCarga !== 0 && (
                                        <Text
                                          style={[
                                            estilos.indicadorProgresso,
                                            {
                                              color:
                                                serie.diferencaCarga > 0
                                                  ? corTema
                                                  : "#F29B9B",
                                            },
                                          ]}
                                        >
                                          {serie.diferencaCarga > 0
                                            ? "↑ +"
                                            : "↓ "}
                                          {formatarCarga(
                                            Math.abs(serie.diferencaCarga),
                                          )}{" "}
                                          kg
                                        </Text>
                                      )}
                                  </View>
                                </View>
                              ))}
                            </View>
                          );
                        })
                      )}
                      <View
                        style={[
                          estilos.rodapeDetalhes,
                          {
                            borderColor: corComTransparencia(corTema, "50"),
                          },
                        ]}
                      >
                        <Text style={estilos.volumeLabel}>
                          Volume registrado
                        </Text>
                        <Text style={[estilos.volumeValor, { color: corTema }]}>
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
        <View style={{ marginTop: 28 }}>
          <Text style={[estilos.titulo, { fontSize: 22, marginBottom: 8 }]}>
            Histórico de cardio
          </Text>
          <Text style={estilos.subtitulo}>
            Cada sessão preserva os valores registrados naquela data.
          </Text>
          {historicoCardio.length === 0 ? (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioEmoji}>❤️‍🔥</Text>
              <Text style={estilos.vazioTitulo}>Nenhum cardio registrado</Text>
              <Text style={estilos.vazioDescricao}>
                Registre uma sessão na área Frequência para vê-la aqui.
              </Text>
            </View>
          ) : (
            historicoCardio.map((cardio) => (
              <View
                key={cardio.id}
                style={[estilos.cartao, { padding: 18, marginBottom: 12 }]}
              >
                <Text style={estilos.nomeTreino}>{cardio.activity_name}</Text>
                <Text style={estilos.data}>
                  {formatarData(cardio.started_at)}
                </Text>
                <Text style={estilos.hora}>{cardio.activity_type}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {cardio.duration_minutes != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      {cardio.duration_minutes} min
                    </Text>
                  ) : null}
                  {cardio.distance_km != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      {formatarCarga(Number(cardio.distance_km))} km
                    </Text>
                  ) : null}
                  {(cardio.active_calories ?? cardio.calories) != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      {formatarCarga(
                        Number(cardio.active_calories ?? cardio.calories),
                      )}{" "}
                      {cardio.active_calories != null
                        ? "kcal ativas estimadas"
                        : "kcal"}
                    </Text>
                  ) : null}
                  {cardio.intensity ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Intensidade: {cardio.intensity}
                    </Text>
                  ) : null}

                  {cardio.speed_kmh != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Velocidade: {formatarCarga(Number(cardio.speed_kmh))} km/h
                    </Text>
                  ) : null}
                  {cardio.incline_percent != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Inclinação:{" "}
                      {formatarCarga(Number(cardio.incline_percent))}%
                    </Text>
                  ) : null}
                  {cardio.floors_up != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Andares subidos: {cardio.floors_up}
                    </Text>
                  ) : null}
                  {cardio.heart_rate_avg != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      FC média: {cardio.heart_rate_avg} bpm
                    </Text>
                  ) : null}
                  {cardio.weight_kg_snapshot != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Peso no registro:{" "}
                      {formatarCarga(Number(cardio.weight_kg_snapshot))} kg
                    </Text>
                  ) : null}
                  {cardio.height_cm_snapshot != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Altura no registro:{" "}
                      {formatarCarga(Number(cardio.height_cm_snapshot))} cm
                    </Text>
                  ) : null}
                  {cardio.age_snapshot != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Idade no registro: {cardio.age_snapshot} anos
                    </Text>
                  ) : null}
                  {cardio.sex_snapshot != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      Sexo da equação:{" "}
                      {cardio.sex_snapshot === "masculino"
                        ? "Masculino"
                        : "Feminino"}
                    </Text>
                  ) : null}
                  {cardio.met_value != null ? (
                    <Text
                      style={[
                        estilos.etiquetaProgressoTexto,
                        { color: corTema },
                      ]}
                    >
                      MET: {formatarCarga(Number(cardio.met_value))}
                    </Text>
                  ) : null}
                </View>
                {cardio.notes ? (
                  <Text style={estilos.observacoes}>
                    Observação: {cardio.notes}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
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
    marginBottom: 14,
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
  legendaProgresso: {
    backgroundColor: "#17241C",
    borderWidth: 1,
    borderColor: "#28573A",
    borderRadius: 12,
    padding: 13,
    marginBottom: 18,
    gap: 6,
  },
  legendaTitulo: {
    color: "#C6D9CC",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 2,
  },
  legendaTexto: {
    color: "#D6DED8",
    fontSize: 12,
  },
  textoVerde: {
    color: "#35D07F",
    fontWeight: "900",
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
  destaqueEvolucao: {
    alignSelf: "flex-start",
    backgroundColor: "#173C28",
    borderColor: "#2D8A50",
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 9,
  },
  destaqueEvolucaoTexto: {
    color: "#55E693",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
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
  faixaProgresso: {
    backgroundColor: "#153321",
    borderColor: "#286B40",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  faixaProgressoTitulo: {
    color: "#C5F5D5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  etiquetasProgresso: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 8,
  },
  etiquetaProgresso: {
    backgroundColor: "#235C37",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  etiquetaProgressoTexto: {
    color: "#75F0A4",
    fontSize: 10,
    fontWeight: "900",
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
  celulaComProgresso: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  indicadorProgresso: {
    color: "#55E693",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 3,
  },
  semSeries: {
    color: "#A4ADA7",
    fontSize: 13,
    lineHeight: 20,
  },
  rodapeDetalhes: {
    backgroundColor: "#101512",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#28573A",
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
