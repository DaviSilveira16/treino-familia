import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase";

type Props = { onVoltar: () => void; corTema?: string };
type Sessao = { id: string; started_at: string; status: string | null };
type Serie = {
  session_id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
};
type Ponto = {
  id: string;
  data: string;
  cargaMaxima: number;
  repsNaMaiorCarga: number;
  volume: number;
  quantidadeSeries: number;
};

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
function formatarData(valor: string) {
  return new Date(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
function formatarNumero(valor: number, casas = 1) {
  return Number(valor).toLocaleString("pt-BR", {
    maximumFractionDigits: casas,
  });
}

export default function EvolucaoTreinos({
  onVoltar,
  corTema = "#35D07F",
}: Props) {
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [pontosPorExercicio, setPontosPorExercicio] = useState<
    Record<string, { nome: string; pontos: Ponto[] }>
  >({});
  const [exercicioSelecionado, setExercicioSelecionado] = useState("");
  const [buscaExercicio, setBuscaExercicio] = useState("");
  const [larguraSeletor, setLarguraSeletor] = useState(0);
  const seletorRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const posicoesExerciciosRef = useRef<
    Record<string, { x: number; width: number }>
  >({});
  const selecionadoRef = useRef(exercicioSelecionado);
  selecionadoRef.current = exercicioSelecionado;

  const carregar = useCallback(async (atualizacao = false) => {
    if (atualizacao) setAtualizando(true);
    else setCarregando(true);
    setErro("");
    try {
      const { data: usuarioData, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !usuarioData.user)
        throw new Error("Entre novamente na sua conta.");
      const idUsuario = usuarioData.user.id;
      const [resultadoSessoes, resultadoSeries] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("id, started_at, status")
          .eq("user_id", idUsuario)
          .order("started_at", { ascending: true }),
        supabase
          .from("workout_sets")
          .select(
            "session_id, exercise_id, exercise_name, set_number, reps, weight_kg",
          )
          .eq("user_id", idUsuario)
          .order("set_number", { ascending: true }),
      ]);
      if (resultadoSessoes.error) throw resultadoSessoes.error;
      if (resultadoSeries.error) throw resultadoSeries.error;
      const sessoes = (resultadoSessoes.data ?? []) as Sessao[];
      const idsValidos = new Set(
        sessoes
          .filter((sessao) => sessao.status !== "em_andamento")
          .map((sessao) => sessao.id),
      );
      const sessoesPorId = new Map(
        sessoes
          .filter((sessao) => idsValidos.has(sessao.id))
          .map((sessao) => [sessao.id, sessao]),
      );
      const grupos = new Map<
        string,
        { nome: string; sessao: Sessao; series: Serie[] }
      >();
      for (const serie of (resultadoSeries.data ?? []) as Serie[]) {
        const sessao = sessoesPorId.get(serie.session_id);
        if (!sessao) continue;
        const nome = serie.exercise_name?.trim() || "Exercício sem nome";
        const chave = normalizar(nome);
        const chaveGrupo = `${chave}::${sessao.id}`;
        const grupo = grupos.get(chaveGrupo) ?? { nome, sessao, series: [] };
        grupo.series.push(serie);
        grupos.set(chaveGrupo, grupo);
      }
      const porNome: Record<string, { nome: string; pontos: Ponto[] }> = {};
      for (const grupo of grupos.values()) {
        const chave = normalizar(grupo.nome);
        const cargaMaxima = Math.max(
          ...grupo.series.map((serie) => Number(serie.weight_kg) || 0),
        );
        const repsNaMaiorCarga = grupo.series
          .filter((serie) => Number(serie.weight_kg) === cargaMaxima)
          .reduce(
            (maior, serie) => Math.max(maior, Number(serie.reps) || 0),
            0,
          );
        const volume = grupo.series.reduce(
          (total, serie) =>
            total + (Number(serie.weight_kg) || 0) * (Number(serie.reps) || 0),
          0,
        );
        const ponto: Ponto = {
          id: grupo.sessao.id,
          data: grupo.sessao.started_at,
          cargaMaxima,
          repsNaMaiorCarga,
          volume,
          quantidadeSeries: grupo.series.length,
        };
        if (!porNome[chave]) porNome[chave] = { nome: grupo.nome, pontos: [] };
        porNome[chave].pontos.push(ponto);
      }
      for (const item of Object.values(porNome))
        item.pontos.sort(
          (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
        );
      const exercicioAtual = selecionadoRef.current;
      const atual =
        exercicioAtual && porNome[exercicioAtual]
          ? exercicioAtual
          : (Object.keys(porNome).sort((a, b) =>
              porNome[a].nome.localeCompare(porNome[b].nome, "pt-BR"),
            )[0] ?? "");
      setPontosPorExercicio(porNome);
      setExercicioSelecionado(atual);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar a evolução dos exercícios.",
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  const nomes = useMemo(
    () =>
      Object.keys(pontosPorExercicio).sort((a, b) =>
        pontosPorExercicio[a].nome.localeCompare(
          pontosPorExercicio[b].nome,
          "pt-BR",
        ),
      ),
    [pontosPorExercicio],
  );
  const nomesRef = useRef(nomes);
  const nomesVisiveis = useMemo(
    () =>
      nomes.filter((chave) =>
        normalizar(pontosPorExercicio[chave].nome).includes(
          normalizar(buscaExercicio),
        ),
      ),
    [nomes, pontosPorExercicio, buscaExercicio],
  );
  nomesRef.current = nomesVisiveis;
  selecionadoRef.current = exercicioSelecionado;

  useEffect(() => {
    if (
      nomesVisiveis.length > 0 &&
      !nomesVisiveis.includes(exercicioSelecionado)
    ) {
      setExercicioSelecionado(nomesVisiveis[0]);
    }
  }, [nomesVisiveis, exercicioSelecionado]);

  const indiceSelecionado = nomesVisiveis.indexOf(exercicioSelecionado);
  const rolarParaExercicioSelecionado = useCallback(
    (chave: string) => {
      const posicao = posicoesExerciciosRef.current[chave];
      const largura = larguraSeletor;
      if (!posicao || largura <= 0 || !seletorRef.current) return;
      const x = Math.max(0, posicao.x - (largura - posicao.width) / 2);
      seletorRef.current.scrollTo({ x, animated: true });
    },
    [larguraSeletor],
  );

  useEffect(() => {
    if (!exercicioSelecionado) return;
    rolarParaExercicioSelecionado(exercicioSelecionado);
  }, [
    exercicioSelecionado,
    larguraSeletor,
    nomesVisiveis,
    rolarParaExercicioSelecionado,
  ]);

  const selecionarAnterior = useCallback(() => {
    if (indiceSelecionado > 0)
      setExercicioSelecionado(nomesVisiveis[indiceSelecionado - 1]);
  }, [indiceSelecionado, nomesVisiveis]);
  const selecionarProximo = useCallback(() => {
    if (
      indiceSelecionado >= 0 &&
      indiceSelecionado < nomesVisiveis.length - 1
    ) {
      setExercicioSelecionado(nomesVisiveis[indiceSelecionado + 1]);
    }
  }, [indiceSelecionado, nomesVisiveis]);
  const gestoExercicios = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evento, gesto) =>
          Math.abs(gesto.dx) >= 18 &&
          Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.2,
        onMoveShouldSetPanResponderCapture: (_evento, gesto) =>
          Math.abs(gesto.dx) >= 18 &&
          Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_evento, gesto) => {
          const lista = nomesRef.current;
          const indice = lista.indexOf(selecionadoRef.current);
          if (gesto.dx <= -35 && indice >= 0 && indice < lista.length - 1) {
            setExercicioSelecionado(lista[indice + 1]);
          } else if (gesto.dx >= 35 && indice > 0) {
            setExercicioSelecionado(lista[indice - 1]);
          }
        },
      }),
    [],
  );
  const pontos = pontosPorExercicio[exercicioSelecionado]?.pontos ?? [];
  const maiorCarga = Math.max(1, ...pontos.map((ponto) => ponto.cargaMaxima));
  const maiorVolume = Math.max(1, ...pontos.map((ponto) => ponto.volume));
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const progressoCarga =
    primeiro && ultimo ? ultimo.cargaMaxima - primeiro.cargaMaxima : 0;

  if (carregando)
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.secundario}>Carregando evolução...</Text>
      </View>
    );

  return (
    <View style={estilos.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.voltar} onPress={onVoltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Evolução dos treinos</Text>
        <Text style={estilos.subtitulo}>
          Compare cargas, repetições e volume registrados em cada sessão. Os
          registros antigos não são alterados.
        </Text>
        <TouchableOpacity
          onPress={() => carregar(true)}
          style={estilos.atualizar}
        >
          <Text style={[estilos.textoAtualizar, { color: corTema }]}>
            {atualizando ? "Atualizando..." : "↻ Atualizar dados"}
          </Text>
        </TouchableOpacity>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
        {nomes.length === 0 ? (
          <View style={estilos.cartao}>
            <Text style={estilos.tituloCartao}>
              Ainda não há séries registradas
            </Text>
            <Text style={estilos.secundario}>
              Quando você registrar séries no calendário ou concluir um treino
              no modo ativo, os gráficos aparecerão aqui.
            </Text>
          </View>
        ) : (
          <>
            <Text style={estilos.tituloSecao}>Selecione um exercício</Text>
            <View style={estilos.buscaContainer}>
              <Text style={estilos.iconeBusca}>⌕</Text>
              <TextInput
                value={buscaExercicio}
                onChangeText={setBuscaExercicio}
                placeholder="Pesquisar exercício..."
                placeholderTextColor="#89958D"
                accessibilityLabel="Pesquisar exercício"
                returnKeyType="search"
                style={estilos.campoBusca}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {buscaExercicio.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setBuscaExercicio("")}
                  accessibilityLabel="Limpar pesquisa"
                  style={estilos.limparBusca}
                >
                  <Text style={estilos.textoLimparBusca}>×</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={estilos.navegacaoExercicios}>
              <TouchableOpacity
                accessibilityLabel="Exercício anterior"
                disabled={indiceSelecionado <= 0}
                onPress={selecionarAnterior}
                style={[
                  estilos.setaExercicio,
                  indiceSelecionado <= 0 && estilos.setaDesabilitada,
                ]}
              >
                <Text style={estilos.textoSeta}>‹</Text>
              </TouchableOpacity>
              <Text style={estilos.contadorExercicio}>
                {indiceSelecionado >= 0
                  ? `${indiceSelecionado + 1} de ${nomesVisiveis.length}`
                  : `0 de ${nomesVisiveis.length}`}
              </Text>
              <TouchableOpacity
                accessibilityLabel="Próximo exercício"
                disabled={
                  indiceSelecionado < 0 ||
                  indiceSelecionado >= nomesVisiveis.length - 1
                }
                onPress={selecionarProximo}
                style={[
                  estilos.setaExercicio,
                  (indiceSelecionado < 0 ||
                    indiceSelecionado >= nomesVisiveis.length - 1) &&
                    estilos.setaDesabilitada,
                ]}
              >
                <Text style={estilos.textoSeta}>›</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={seletorRef}
              horizontal
              nestedScrollEnabled
              directionalLockEnabled
              showsHorizontalScrollIndicator
              contentContainerStyle={estilos.seletor}
              style={estilos.listaSeletor}
              onLayout={(evento) =>
                setLarguraSeletor(evento.nativeEvent.layout.width)
              }
            >
              {nomesVisiveis.map((chave) => (
                <TouchableOpacity
                  key={chave}
                  onPress={() => setExercicioSelecionado(chave)}
                  onLayout={(evento) => {
                    const { x, width } = evento.nativeEvent.layout;
                    posicoesExerciciosRef.current[chave] = { x, width };
                    if (chave === selecionadoRef.current)
                      rolarParaExercicioSelecionado(chave);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: exercicioSelecionado === chave,
                  }}
                  style={[
                    estilos.botaoExercicio,
                    exercicioSelecionado === chave && {
                      borderColor: corTema,
                      backgroundColor: `${corTema}20`,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      estilos.textoExercicio,
                      exercicioSelecionado === chave && { color: corTema },
                    ]}
                  >
                    {pontosPorExercicio[chave].nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {nomesVisiveis.length === 0 ? (
              <Text style={estilos.secundario}>
                Nenhum exercício encontrado para essa pesquisa.
              </Text>
            ) : null}
            <View
              style={estilos.faixaExercicioAtual}
              {...gestoExercicios.panHandlers}
            >
              <Text style={[estilos.nomeExercicioAtual, { color: corTema }]}>
                {pontosPorExercicio[exercicioSelecionado]?.nome ??
                  "Selecione um exercício"}
              </Text>
              <Text style={estilos.dicaDeslize}>
                Passe o dedo para a esquerda ou direita aqui para trocar de
                exercício.
              </Text>
            </View>
            <View>
              <View style={estilos.gradeIndicadores}>
                <View style={estilos.indicador}>
                  <Text style={estilos.rotulo}>MAIOR CARGA</Text>
                  <Text style={[estilos.numeroIndicador, { color: corTema }]}>
                    {formatarNumero(
                      Math.max(0, ...pontos.map((p) => p.cargaMaxima)),
                    )}{" "}
                    kg
                  </Text>
                </View>
                <View style={estilos.indicador}>
                  <Text style={estilos.rotulo}>ÚLTIMA SESSÃO</Text>
                  <Text style={estilos.numeroIndicador}>
                    {ultimo ? formatarData(ultimo.data) : "—"}
                  </Text>
                </View>
                <View style={estilos.indicador}>
                  <Text style={estilos.rotulo}>VARIAÇÃO</Text>
                  <Text
                    style={[
                      estilos.numeroIndicador,
                      { color: progressoCarga >= 0 ? corTema : "#F28B82" },
                    ]}
                  >
                    {progressoCarga > 0 ? "+" : ""}
                    {formatarNumero(progressoCarga)} kg
                  </Text>
                </View>
              </View>
              <View style={estilos.cartao}>
                <Text style={estilos.tituloCartao}>
                  Carga máxima por sessão
                </Text>
                {pontos.map((ponto) => (
                  <View key={`c-${ponto.id}`} style={estilos.linhaGrafico}>
                    <View style={estilos.linhaData}>
                      <Text style={estilos.textoData}>
                        {formatarData(ponto.data)}
                      </Text>
                      <Text style={estilos.textoValor}>
                        {formatarNumero(ponto.cargaMaxima)} kg
                      </Text>
                    </View>
                    <View style={estilos.fundoBarra}>
                      <View
                        style={[
                          estilos.barra,
                          {
                            width: `${Math.max(2, (ponto.cargaMaxima / maiorCarga) * 100)}%`,
                            backgroundColor: corTema,
                          },
                        ]}
                      />
                    </View>
                    <Text style={estilos.legenda}>
                      {ponto.repsNaMaiorCarga} reps na maior carga ·{" "}
                      {ponto.quantidadeSeries} séries
                    </Text>
                  </View>
                ))}
              </View>
              <View style={estilos.cartao}>
                <Text style={estilos.tituloCartao}>
                  Volume de carga por sessão
                </Text>
                <Text style={estilos.secundario}>
                  Volume = soma da carga multiplicada pelas repetições das
                  séries registradas. Não equivale a calorias gastas.
                </Text>
                {pontos.map((ponto) => (
                  <View key={`v-${ponto.id}`} style={estilos.linhaGrafico}>
                    <View style={estilos.linhaData}>
                      <Text style={estilos.textoData}>
                        {formatarData(ponto.data)}
                      </Text>
                      <Text style={estilos.textoValor}>
                        {formatarNumero(ponto.volume)} kg·reps
                      </Text>
                    </View>
                    <View style={estilos.fundoBarra}>
                      <View
                        style={[
                          estilos.barra,
                          {
                            width: `${Math.max(2, (ponto.volume / maiorVolume) * 100)}%`,
                            backgroundColor: corTema,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <View style={estilos.cartao}>
                <Text style={estilos.tituloCartao}>Histórico detalhado</Text>
                {pontos
                  .slice()
                  .reverse()
                  .map((ponto) => (
                    <View key={`d-${ponto.id}`} style={estilos.linhaDetalhe}>
                      <View style={{ flex: 1 }}>
                        <Text style={estilos.textoDetalhe}>
                          {formatarData(ponto.data)}
                        </Text>
                        <Text style={estilos.secundario}>
                          {ponto.quantidadeSeries} séries ·{" "}
                          {ponto.repsNaMaiorCarga} reps na maior carga
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={[estilos.textoDetalhe, { color: corTema }]}
                        >
                          {formatarNumero(ponto.cargaMaxima)} kg
                        </Text>
                        <Text style={estilos.secundario}>
                          {formatarNumero(ponto.volume)} kg·reps
                        </Text>
                      </View>
                    </View>
                  ))}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: "#101312" },
  conteudo: {
    padding: 20,
    paddingBottom: 40,
    gap: 14,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  centro: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#101312",
    gap: 12,
  },
  voltar: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 16 },
  textoVoltar: { fontSize: 16, fontWeight: "700" },
  marca: { fontSize: 12, letterSpacing: 2, fontWeight: "800" },
  titulo: { color: "#F0F4F1", fontSize: 28, fontWeight: "800" },
  subtitulo: { color: "#A4ADA7", lineHeight: 21 },
  atualizar: { alignSelf: "flex-start", paddingVertical: 6 },
  textoAtualizar: { fontWeight: "800" },
  erro: {
    color: "#F28B82",
    backgroundColor: "#3A1919",
    borderRadius: 10,
    padding: 12,
  },
  cartao: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 14,
    padding: 15,
    gap: 12,
  },
  tituloCartao: { color: "#F0F4F1", fontWeight: "800", fontSize: 17 },
  tituloSecao: {
    color: "#F0F4F1",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 4,
  },
  buscaContainer: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#354038",
    backgroundColor: "#191E1B",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  iconeBusca: { color: "#A4ADA7", fontSize: 25, lineHeight: 28 },
  campoBusca: {
    flex: 1,
    minWidth: 0,
    color: "#F0F4F1",
    fontSize: 15,
    paddingVertical: 10,
  },
  limparBusca: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#303832",
  },
  textoLimparBusca: { color: "#F0F4F1", fontSize: 22, lineHeight: 25 },
  faixaExercicioAtual: {
    backgroundColor: "#191E1B",
    borderColor: "#354038",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 5,
  },
  nomeExercicioAtual: { fontSize: 17, fontWeight: "900" },
  secundario: { color: "#A4ADA7", fontSize: 13, lineHeight: 19 },
  navegacaoExercicios: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  setaExercicio: {
    minWidth: 48,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#354038",
    backgroundColor: "#191E1B",
    alignItems: "center",
    justifyContent: "center",
  },
  setaDesabilitada: { opacity: 0.3 },
  textoSeta: {
    color: "#F0F4F1",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "800",
  },
  contadorExercicio: {
    flex: 1,
    textAlign: "center",
    color: "#F0F4F1",
    fontWeight: "800",
  },
  dicaDeslize: { color: "#94A098", fontSize: 11, marginBottom: 8 },
  listaSeletor: { width: "100%", flexGrow: 0, maxHeight: 52 },
  seletor: { gap: 8, paddingVertical: 4, paddingRight: 16 },
  botaoExercicio: {
    borderWidth: 1,
    borderColor: "#354038",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  textoExercicio: { color: "#E5EBE7", fontWeight: "700" },
  gradeIndicadores: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  indicador: {
    flex: 1,
    minWidth: 105,
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rotulo: {
    color: "#94A098",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  numeroIndicador: { color: "#F0F4F1", fontSize: 19, fontWeight: "900" },
  linhaGrafico: { gap: 6 },
  linhaData: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  textoData: { color: "#CED6D0", fontSize: 12 },
  textoValor: { color: "#F0F4F1", fontSize: 12, fontWeight: "800" },
  fundoBarra: {
    height: 10,
    backgroundColor: "#2B332E",
    borderRadius: 8,
    overflow: "hidden",
  },
  barra: { height: 10, borderRadius: 8, minWidth: 2 },
  legenda: { color: "#94A098", fontSize: 11 },
  linhaDetalhe: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#303832",
    paddingVertical: 9,
    gap: 8,
  },
  textoDetalhe: { color: "#F0F4F1", fontWeight: "800" },
});
