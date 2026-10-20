import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type Treino = {
  id: string;
  name: string;
};

type Exercicio = {
  id: string;
  plan_id: string;
  name: string;
  sets_goal: number;
  reps_goal: string;
  position: number;
};

type SerieCarga = {
  repeticoes: string;
  carga: string;
};

type Props = {
  onVoltar: () => void;
  corTema?: string;
};

export default function MeusTreinos({ onVoltar, corTema = "#35D07F" }: Props) {
  function mostrarMensagem(titulo: string, mensagem: string) {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(`${titulo}\n\n${mensagem}`);
      return;
    }

    Alert.alert(titulo, mensagem);
  }

  function confirmarExclusao(
    titulo: string,
    mensagem: string,
  ): Promise<boolean> {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
    }

    return new Promise((resolve) => {
      Alert.alert(titulo, mensagem, [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => resolve(true),
        },
      ]);
    });
  }

  const [usuarioId, setUsuarioId] = useState("");
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [treinoSelecionado, setTreinoSelecionado] = useState<Treino | null>(
    null,
  );
  const [nomeNovoTreino, setNomeNovoTreino] = useState("");
  const [mostrarFormularioExercicio, setMostrarFormularioExercicio] =
    useState(false);
  const [exercicios, setExercicios] = useState<Exercicio[]>([]);
  const [nomeExercicio, setNomeExercicio] = useState("");
  const [quantidadeSeries, setQuantidadeSeries] = useState("3");
  const [repeticoes, setRepeticoes] = useState("8-12");
  const [exercicioEditando, setExercicioEditando] = useState<Exercicio | null>(
    null,
  );
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [seriesEdicao, setSeriesEdicao] = useState("");
  const [repeticoesEdicao, setRepeticoesEdicao] = useState("");
  const [exercicioParaCarga, setExercicioParaCarga] =
    useState<Exercicio | null>(null);
  const [seriesCarga, setSeriesCarga] = useState<SerieCarga[]>([]);
  const [maioresCargas, setMaioresCargas] = useState<Record<string, number>>(
    {},
  );
  const [carregando, setCarregando] = useState(true);
  const [carregandoExercicios, setCarregandoExercicios] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    async function carregarTreinos() {
      setCarregando(true);

      try {
        const { data: usuarioData, error: usuarioErro } =
          await supabase.auth.getUser();

        if (usuarioErro || !usuarioData.user) {
          mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
          return;
        }

        setUsuarioId(usuarioData.user.id);

        const { data, error } = await supabase
          .from("workout_plans")
          .select("id, name")
          .eq("user_id", usuarioData.user.id)
          .order("created_at", { ascending: true });

        if (error) {
          mostrarMensagem("Erro", "Não foi possível carregar seus treinos.");
          return;
        }

        setTreinos((data ?? []) as Treino[]);
      } catch {
        mostrarMensagem("Erro", "Não foi possível conectar ao Supabase.");
      } finally {
        setCarregando(false);
      }
    }

    carregarTreinos();
  }, []);

  useEffect(() => {
    async function carregarExercicios() {
      if (!treinoSelecionado) {
        setExercicios([]);
        setExercicioParaCarga(null);
        return;
      }

      setCarregandoExercicios(true);

      try {
        const { data, error } = await supabase
          .from("exercises")
          .select("id, plan_id, name, sets_goal, reps_goal, position")
          .eq("plan_id", treinoSelecionado.id)
          .eq("user_id", usuarioId)
          .order("position");

        if (error) {
          mostrarMensagem("Erro", "Não foi possível carregar os exercícios.");
          return;
        }

        const lista = (data ?? []) as Exercicio[];
        setExercicios(lista);

        const cargas: Record<string, number> = {};

        await Promise.all(
          lista.map(async (exercicio) => {
            const { data: registros } = await supabase
              .from("workout_sets")
              .select("weight_kg")
              .eq("user_id", usuarioId)
              .eq("exercise_id", exercicio.id);

            const valores = (registros ?? [])
              .map((registro) => Number(registro.weight_kg))
              .filter((valor) => Number.isFinite(valor));

            if (valores.length > 0) {
              cargas[exercicio.id] = Math.max(...valores);
            }
          }),
        );

        setMaioresCargas((atuais) => ({ ...atuais, ...cargas }));
      } catch {
        mostrarMensagem("Erro", "Não foi possível conectar ao Supabase.");
      } finally {
        setCarregandoExercicios(false);
      }
    }

    if (usuarioId) carregarExercicios();
  }, [treinoSelecionado, usuarioId]);

  async function criarTreino() {
    const nome = nomeNovoTreino.trim();

    if (!nome) {
      mostrarMensagem("Atenção", "Digite o nome do novo treino.");
      return;
    }

    if (!usuarioId) {
      mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
      return;
    }

    setSalvando(true);

    try {
      const { data, error } = await supabase
        .from("workout_plans")
        .insert({ user_id: usuarioId, name: nome })
        .select("id, name")
        .single();

      if (error) {
        if (error.code === "23505") {
          mostrarMensagem(
            "Nome já utilizado",
            "Você já tem um treino com esse nome. Escolha outro.",
          );
        } else {
          mostrarMensagem("Erro ao criar treino", error.message);
        }

        return;
      }

      const novoTreino = data as Treino;

      setTreinos((atuais) =>
        [...atuais, novoTreino].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setTreinoSelecionado(novoTreino);
      setMostrarFormularioExercicio(false);
      setNomeNovoTreino("");
    } catch {
      mostrarMensagem("Erro", "Não foi possível criar o treino.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirTreino(treino: Treino) {
    const confirmado = await confirmarExclusao(
      "Excluir treino inteiro?",
      `Tem certeza de que deseja excluir o treino "${treino.name}" inteiro? Todos os exercícios cadastrados nele também serão excluídos. O histórico de cargas será preservado, mas ficará sem vínculo com esse treino.`,
    );

    if (!confirmado) return;

    setSalvando(true);

    try {
      const { data: exerciciosDoTreino, error: erroBusca } = await supabase
        .from("exercises")
        .select("id")
        .eq("plan_id", treino.id)
        .eq("user_id", usuarioId);

      if (erroBusca) {
        mostrarMensagem(
          "Erro",
          `Não foi possível localizar os exercícios: ${erroBusca.message}`,
        );
        return;
      }

      const idsExercicios = (exerciciosDoTreino ?? []).map((item) => item.id);

      if (idsExercicios.length > 0) {
        const { error: erroDesvincularCargas } = await supabase
          .from("workout_sets")
          .update({ exercise_id: null })
          .eq("user_id", usuarioId)
          .in("exercise_id", idsExercicios);

        if (erroDesvincularCargas) {
          mostrarMensagem(
            "Erro",
            `Não foi possível preservar o histórico de cargas: ${erroDesvincularCargas.message}`,
          );
          return;
        }
      }

      const { error: erroDesvincularSessoes } = await supabase
        .from("workout_sessions")
        .update({ plan_id: null })
        .eq("user_id", usuarioId)
        .eq("plan_id", treino.id);

      if (erroDesvincularSessoes) {
        mostrarMensagem(
          "Erro",
          `Não foi possível preservar o histórico do treino: ${erroDesvincularSessoes.message}`,
        );
        return;
      }

      const { error: erroExcluirExercicios } = await supabase
        .from("exercises")
        .delete()
        .eq("plan_id", treino.id)
        .eq("user_id", usuarioId);

      if (erroExcluirExercicios) {
        mostrarMensagem(
          "Erro",
          `Não foi possível remover os exercícios do treino: ${erroExcluirExercicios.message}`,
        );
        return;
      }

      const { error: erroExcluirTreino } = await supabase
        .from("workout_plans")
        .delete()
        .eq("id", treino.id)
        .eq("user_id", usuarioId);

      if (erroExcluirTreino) {
        mostrarMensagem(
          "Erro",
          `Não foi possível remover o treino: ${erroExcluirTreino.message}`,
        );
        return;
      }

      setTreinos((atuais) => atuais.filter((item) => item.id !== treino.id));

      if (treinoSelecionado?.id === treino.id) {
        setTreinoSelecionado(null);
        setMostrarFormularioExercicio(false);
        setExercicios([]);
        setExercicioEditando(null);
        setExercicioParaCarga(null);
      }

      mostrarMensagem(
        "Treino removido",
        "O treino foi removido. Os registros anteriores de cargas foram preservados.",
      );
    } catch (erro) {
      mostrarMensagem(
        "Erro",
        erro instanceof Error
          ? `Não foi possível remover o treino: ${erro.message}`
          : "Não foi possível conectar ao Supabase para remover o treino.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarExercicio() {
    const nome = nomeExercicio.trim();
    const series = Number(quantidadeSeries);
    const reps = repeticoes.trim();

    if (!treinoSelecionado) {
      mostrarMensagem("Atenção", "Selecione um treino primeiro.");
      return;
    }

    if (!nome) {
      mostrarMensagem("Atenção", "Digite o nome do exercício.");
      return;
    }

    if (!Number.isInteger(series) || series < 1 || series > 20) {
      mostrarMensagem("Atenção", "Informe entre 1 e 20 séries.");
      return;
    }

    if (!reps) {
      mostrarMensagem("Atenção", "Informe a quantidade de repetições.");
      return;
    }

    setSalvando(true);

    try {
      const { data, error } = await supabase
        .from("exercises")
        .insert({
          user_id: usuarioId,
          plan_id: treinoSelecionado.id,
          name: nome,
          sets_goal: series,
          reps_goal: reps,
          position: exercicios.length,
        })
        .select("id, plan_id, name, sets_goal, reps_goal, position")
        .single();

      if (error) {
        mostrarMensagem("Erro ao salvar", error.message);
        return;
      }

      setExercicios((atuais) =>
        [...atuais, data as Exercicio].sort((a, b) => a.position - b.position),
      );
      setNomeExercicio("");
      setQuantidadeSeries("3");
      setRepeticoes("8-12");
    } catch {
      mostrarMensagem("Erro", "Não foi possível salvar o exercício.");
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(exercicio: Exercicio) {
    setExercicioEditando(exercicio);
    setNomeEdicao(exercicio.name);
    setSeriesEdicao(String(exercicio.sets_goal));
    setRepeticoesEdicao(exercicio.reps_goal);
    setExercicioParaCarga(null);
  }

  async function salvarEdicao() {
    if (!exercicioEditando) return;

    const nome = nomeEdicao.trim();
    const series = Number(seriesEdicao);
    const reps = repeticoesEdicao.trim();

    if (
      !nome ||
      !reps ||
      !Number.isInteger(series) ||
      series < 1 ||
      series > 20
    ) {
      mostrarMensagem(
        "Dados inválidos",
        "Informe o nome, entre 1 e 20 séries e as repetições.",
      );
      return;
    }

    setSalvando(true);

    try {
      const { data, error } = await supabase
        .from("exercises")
        .update({ name: nome, sets_goal: series, reps_goal: reps })
        .eq("id", exercicioEditando.id)
        .eq("plan_id", exercicioEditando.plan_id)
        .eq("user_id", usuarioId)
        .select("id, plan_id, name, sets_goal, reps_goal, position")
        .single();

      if (error) {
        mostrarMensagem("Erro ao editar", error.message);
        return;
      }

      setExercicios((atuais) =>
        atuais.map((item) =>
          item.id === exercicioEditando.id ? (data as Exercicio) : item,
        ),
      );
      setExercicioEditando(null);
    } catch {
      mostrarMensagem("Erro", "Não foi possível editar o exercício.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirExercicio(exercicio: Exercicio) {
    const confirmado = await confirmarExclusao(
      "Excluir exercício",
      `Deseja excluir "${exercicio.name}" deste treino? O histórico de cargas será preservado.`,
    );

    if (!confirmado) return;

    try {
      const { error: erroDesvincularCargas } = await supabase
        .from("workout_sets")
        .update({ exercise_id: null })
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id);

      if (erroDesvincularCargas) {
        mostrarMensagem(
          "Erro",
          `Não foi possível preservar o histórico de cargas: ${erroDesvincularCargas.message}`,
        );
        return;
      }

      const { error } = await supabase
        .from("exercises")
        .delete()
        .eq("id", exercicio.id)
        .eq("plan_id", exercicio.plan_id)
        .eq("user_id", usuarioId);

      if (error) {
        mostrarMensagem(
          "Erro",
          `Não foi possível excluir o exercício: ${error.message}`,
        );
        return;
      }

      setExercicios((atuais) =>
        atuais.filter((item) => item.id !== exercicio.id),
      );

      if (exercicioEditando?.id === exercicio.id) {
        setExercicioEditando(null);
      }

      if (exercicioParaCarga?.id === exercicio.id) {
        setExercicioParaCarga(null);
      }

      mostrarMensagem(
        "Exercício removido",
        "O exercício foi excluído. O histórico de cargas foi preservado.",
      );
    } catch (erro) {
      mostrarMensagem(
        "Erro",
        erro instanceof Error
          ? `Não foi possível excluir o exercício: ${erro.message}`
          : "Não foi possível conectar ao Supabase.",
      );
    }
  }

  async function abrirRegistroCarga(exercicio: Exercicio) {
    setExercicioEditando(null);
    setExercicioParaCarga(exercicio);

    try {
      const { data: registros, error: erroRegistros } = await supabase
        .from("workout_sets")
        .select("session_id, set_number, reps, weight_kg")
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id);

      if (erroRegistros) {
        mostrarMensagem(
          "Erro",
          "Não foi possível carregar as séries anteriores.",
        );

        setSeriesCarga(
          Array.from({ length: exercicio.sets_goal }, () => ({
            repeticoes: "",
            carga: "",
          })),
        );

        return;
      }

      const idsSessoes = [
        ...new Set((registros ?? []).map((registro) => registro.session_id)),
      ].filter(Boolean);

      if (idsSessoes.length === 0) {
        setSeriesCarga(
          Array.from({ length: exercicio.sets_goal }, () => ({
            repeticoes: "",
            carga: "",
          })),
        );

        return;
      }

      const { data: sessoes, error: erroSessoes } = await supabase
        .from("workout_sessions")
        .select("id, started_at")
        .eq("user_id", usuarioId)
        .in("id", idsSessoes)
        .order("started_at", { ascending: false });

      if (erroSessoes) {
        mostrarMensagem(
          "Erro",
          "Não foi possível localizar o último registro do exercício.",
        );
        return;
      }

      const sessoesOrdenadas = sessoes ?? [];
      const ultimaSessao = sessoesOrdenadas.find((sessao) =>
        (registros ?? []).some((registro) => registro.session_id === sessao.id),
      );

      const seriesAnteriores = (registros ?? [])
        .filter((registro) => registro.session_id === ultimaSessao?.id)
        .sort((a, b) => a.set_number - b.set_number);

      const quantidadeSeries = Math.max(
        exercicio.sets_goal,
        seriesAnteriores.length,
      );

      setSeriesCarga(
        Array.from({ length: quantidadeSeries }, (_, indice) => {
          const serie = seriesAnteriores[indice];

          return {
            repeticoes: serie?.reps != null ? String(serie.reps) : "",
            carga: serie?.weight_kg != null ? String(serie.weight_kg) : "",
          };
        }),
      );
    } catch {
      mostrarMensagem(
        "Erro",
        "Não foi possível carregar as séries anteriores.",
      );

      setSeriesCarga(
        Array.from({ length: exercicio.sets_goal }, () => ({
          repeticoes: "",
          carga: "",
        })),
      );
    }
  }

  function atualizarSerieCarga(
    indice: number,
    campo: keyof SerieCarga,
    valor: string,
  ) {
    setSeriesCarga((atuais) =>
      atuais.map((serie, posicao) =>
        posicao === indice ? { ...serie, [campo]: valor } : serie,
      ),
    );
  }

  async function salvarCargas() {
    if (!exercicioParaCarga) {
      mostrarMensagem("Erro", "Nenhum exercício foi selecionado.");
      return;
    }

    if (!treinoSelecionado) {
      mostrarMensagem("Erro", "Nenhum treino foi selecionado.");
      return;
    }

    if (!usuarioId) {
      mostrarMensagem(
        "Sessão inválida",
        "Não foi possível identificar sua conta. Saia e entre novamente.",
      );
      return;
    }

    if (
      seriesCarga.length === 0 ||
      seriesCarga.some(
        (serie) => !serie.repeticoes.trim() || !serie.carga.trim(),
      )
    ) {
      mostrarMensagem(
        "Preencha as séries",
        "Informe as repetições realizadas e a carga em kg de cada série. Use 0 se não utilizou peso adicional.",
      );
      return;
    }

    const seriesValidadas = seriesCarga.map((serie) => ({
      reps: Number(serie.repeticoes),
      weight_kg: Number(serie.carga.replace(",", ".")),
    }));

    if (
      seriesValidadas.some(
        (serie) =>
          !Number.isInteger(serie.reps) ||
          serie.reps < 1 ||
          !Number.isFinite(serie.weight_kg) ||
          serie.weight_kg < 0,
      )
    ) {
      mostrarMensagem(
        "Valores inválidos",
        "As repetições devem ser inteiros positivos e a carga deve ser um número igual ou maior que zero.",
      );
      return;
    }

    setSalvando(true);

    try {
      const agora = new Date().toISOString();

      const { data: sessao, error: erroSessao } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: usuarioId,
          plan_id: treinoSelecionado.id,
          started_at: agora,
          finished_at: agora,
          notes: `Registro de cargas: ${exercicioParaCarga.name}`,
        })
        .select("id")
        .single();

      if (erroSessao || !sessao) {
        mostrarMensagem(
          "Erro ao registrar",
          erroSessao?.message ?? "Não foi possível criar o registro do treino.",
        );
        return;
      }

      const registros = seriesValidadas.map((serie, indice) => ({
        user_id: usuarioId,
        session_id: sessao.id,
        exercise_id: exercicioParaCarga.id,
        exercise_name: exercicioParaCarga.name,
        set_number: indice + 1,
        reps: serie.reps,
        weight_kg: serie.weight_kg,
      }));

      const { error: erroSeries } = await supabase
        .from("workout_sets")
        .insert(registros);

      if (erroSeries) {
        mostrarMensagem("Erro ao salvar as séries", erroSeries.message);
        return;
      }

      const maiorCargaNova = Math.max(
        ...seriesValidadas.map((serie) => serie.weight_kg),
      );

      setMaioresCargas((atuais) => ({
        ...atuais,
        [exercicioParaCarga.id]: Math.max(
          atuais[exercicioParaCarga.id] ?? 0,
          maiorCargaNova,
        ),
      }));

      setExercicioParaCarga(null);

      mostrarMensagem(
        "Cargas salvas",
        "As séries foram registradas no seu histórico.",
      );
    } catch {
      mostrarMensagem("Erro", "Não foi possível conectar ao Supabase.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.textoSecundario}>Carregando seus treinos...</Text>
      </View>
    );
  }

  return (
    <View style={estilos.container}>
      <ScrollView
        style={estiloRolagemWeb}
        ref={scrollViewRef}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (treinoSelecionado) {
            requestAnimationFrame(() =>
              scrollViewRef.current?.scrollToEnd({ animated: true }),
            );
          }
        }}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>

        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>

        <Text style={estilos.titulo}>Meus treinos</Text>

        <Text style={estilos.subtitulo}>
          Crie quantos treinos quiser e acompanhe suas cargas.
        </Text>

        <View style={estilos.formulario}>
          <Text style={estilos.rotulo}>Nome do novo treino</Text>

          <TextInput
            style={estilos.input}
            placeholder="Ex.: Peito e tríceps, Treino E..."
            placeholderTextColor="#828A85"
            value={nomeNovoTreino}
            onChangeText={setNomeNovoTreino}
            editable={!salvando}
            maxLength={80}
          />

          <TouchableOpacity
            style={[
              estilos.botaoAdicionar,
              { backgroundColor: corTema },
              salvando && estilos.botaoDesabilitado,
            ]}
            onPress={criarTreino}
            disabled={salvando}
          >
            {salvando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={estilos.textoBotaoAdicionar}>+ Criar treino</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={estilos.tituloSecao}>Seus treinos ({treinos.length})</Text>

        {treinos.length === 0 ? (
          <View style={estilos.vazio}>
            <Text style={estilos.vazioEmoji}>🏋️</Text>
            <Text style={estilos.vazioTitulo}>
              Você ainda não criou treinos
            </Text>
            <Text style={estilos.textoSecundario}>
              Digite um nome acima para criar o primeiro.
            </Text>
          </View>
        ) : (
          <View style={estilos.listaTreinos}>
            {treinos.map((treino, indice) => {
              const selecionado = treinoSelecionado?.id === treino.id;

              return (
                <View
                  key={treino.id}
                  style={[
                    estilos.cartaoTreino,
                    selecionado && {
                      borderColor: corTema,
                      backgroundColor: `${corTema}20`,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={estilos.conteudoCartaoTreino}
                    onPress={() => {
                      setTreinoSelecionado(treino);
                      setMostrarFormularioExercicio(false);
                    }}
                  >
                    <View
                      style={[
                        estilos.letraTreino,
                        selecionado && { backgroundColor: corTema },
                      ]}
                    >
                      <Text style={estilos.letraTreinoTexto}>{indice + 1}</Text>
                    </View>

                    <View style={estilos.infoTreino}>
                      <Text style={estilos.nomeTreino}>{treino.name}</Text>
                      <Text style={estilos.descricaoTreino}>
                        {selecionado
                          ? "Treino selecionado"
                          : "Toque para visualizar"}
                      </Text>
                    </View>

                    <Text style={[estilos.seta, { color: corTema }]}>
                      {selecionado ? "✓" : "›"}
                    </Text>
                  </TouchableOpacity>

                  <View style={estilos.acoesTreino}>
                    <TouchableOpacity
                      style={[
                        estilos.botaoAdicionarTreino,
                        { borderColor: corTema },
                      ]}
                      onPress={() => {
                        setTreinoSelecionado(treino);
                        setMostrarFormularioExercicio(true);
                      }}
                    >
                      <Text
                        style={[
                          estilos.textoBotaoAdicionarTreino,
                          { color: corTema },
                        ]}
                      >
                        + Adicionar exercício
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={estilos.botaoExcluirTreino}
                      onPress={() => excluirTreino(treino)}
                      disabled={salvando}
                    >
                      <Text style={estilos.textoExcluir}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {treinoSelecionado && (
          <View>
            <Text style={estilos.tituloSecao}>
              Exercícios — {treinoSelecionado.name}
            </Text>

            {mostrarFormularioExercicio && (
              <View style={estilos.formulario}>
                <View style={estilos.cabecalhoFormulario}>
                  <Text style={estilos.rotulo}>
                    Novo exercício para {treinoSelecionado.name}
                  </Text>

                  <TouchableOpacity
                    onPress={() => setMostrarFormularioExercicio(false)}
                  >
                    <Text style={estilos.textoCancelarFormulario}>
                      Cancelar
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={estilos.rotulo}>Nome do exercício</Text>

                <TextInput
                  style={estilos.input}
                  placeholder="Ex.: Supino reto"
                  placeholderTextColor="#828A85"
                  value={nomeExercicio}
                  onChangeText={setNomeExercicio}
                  editable={!salvando}
                />

                <View style={estilos.linhaCampos}>
                  <View style={estilos.campoPequeno}>
                    <Text style={estilos.rotulo}>Séries previstas</Text>
                    <TextInput
                      style={estilos.input}
                      value={quantidadeSeries}
                      onChangeText={setQuantidadeSeries}
                      keyboardType="number-pad"
                      placeholder="3"
                      placeholderTextColor="#828A85"
                      editable={!salvando}
                    />
                  </View>

                  <View style={estilos.campoGrande}>
                    <Text style={estilos.rotulo}>Repetições previstas</Text>
                    <TextInput
                      style={estilos.input}
                      value={repeticoes}
                      onChangeText={setRepeticoes}
                      placeholder="8-12"
                      placeholderTextColor="#828A85"
                      editable={!salvando}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    estilos.botaoAdicionar,
                    { backgroundColor: corTema },
                    salvando && estilos.botaoDesabilitado,
                  ]}
                  onPress={adicionarExercicio}
                  disabled={salvando}
                >
                  {salvando ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={estilos.textoBotaoAdicionar}>
                      + Adicionar exercício
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <Text style={estilos.tituloSecao}>
              Exercícios cadastrados ({exercicios.length})
            </Text>

            {carregandoExercicios ? (
              <ActivityIndicator
                size="large"
                color={corTema}
                style={estilos.carregandoLista}
              />
            ) : exercicios.length === 0 ? (
              <View style={estilos.vazio}>
                <Text style={estilos.vazioEmoji}>🏋️</Text>
                <Text style={estilos.vazioTitulo}>Nenhum exercício ainda</Text>
                <Text style={estilos.textoSecundario}>
                  Use o botão “+ Adicionar exercício” neste treino para
                  cadastrar o primeiro.
                </Text>
              </View>
            ) : (
              <View style={estilos.listaExercicios}>
                {exercicios.map((exercicio, indice) => (
                  <View key={exercicio.id} style={estilos.cartaoExercicio}>
                    <View
                      style={[
                        estilos.numeroExercicio,
                        { backgroundColor: `${corTema}30` },
                      ]}
                    >
                      <Text style={[estilos.numeroTexto, { color: corTema }]}>
                        {indice + 1}
                      </Text>
                    </View>

                    <View style={estilos.infoExercicio}>
                      <Text style={estilos.nomeExercicio}>
                        {exercicio.name}
                      </Text>

                      <Text style={estilos.detalheExercicio}>
                        {exercicio.sets_goal} séries · {exercicio.reps_goal}{" "}
                        repetições
                      </Text>

                      <Text
                        style={[estilos.detalheRecorde, { color: corTema }]}
                      >
                        Maior carga:{" "}
                        {maioresCargas[exercicio.id] !== undefined
                          ? `${maioresCargas[exercicio.id]} kg`
                          : "Ainda não registrada"}
                      </Text>
                    </View>

                    <View style={estilos.acoesExercicio}>
                      <TouchableOpacity
                        style={estilos.botaoAcao}
                        onPress={() => iniciarEdicao(exercicio)}
                      >
                        <Text style={[estilos.textoAcao, { color: corTema }]}>
                          Editar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={estilos.botaoAcao}
                        onPress={() => abrirRegistroCarga(exercicio)}
                      >
                        <Text style={[estilos.textoAcao, { color: corTema }]}>
                          Cargas
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={estilos.botaoExcluir}
                        onPress={() => excluirExercicio(exercicio)}
                      >
                        <Text style={estilos.textoExcluir}>Excluir</Text>
                      </TouchableOpacity>
                    </View>

                    {exercicioEditando?.id === exercicio.id && (
                      <View style={estilos.formularioInterno}>
                        <Text style={estilos.rotulo}>Editar nome</Text>

                        <TextInput
                          style={estilos.input}
                          value={nomeEdicao}
                          onChangeText={setNomeEdicao}
                          placeholder="Nome do exercício"
                          placeholderTextColor="#828A85"
                        />

                        <View style={estilos.linhaCampos}>
                          <View style={estilos.campoPequeno}>
                            <Text style={estilos.rotulo}>Séries</Text>
                            <TextInput
                              style={estilos.input}
                              value={seriesEdicao}
                              onChangeText={setSeriesEdicao}
                              keyboardType="number-pad"
                            />
                          </View>

                          <View style={estilos.campoGrande}>
                            <Text style={estilos.rotulo}>Repetições</Text>
                            <TextInput
                              style={estilos.input}
                              value={repeticoesEdicao}
                              onChangeText={setRepeticoesEdicao}
                            />
                          </View>
                        </View>

                        <View style={estilos.linhaBotoes}>
                          <TouchableOpacity
                            style={estilos.botaoSecundario}
                            onPress={() => setExercicioEditando(null)}
                          >
                            <Text style={estilos.textoBotaoSecundario}>
                              Cancelar
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              estilos.botaoAdicionarCompacto,
                              { backgroundColor: corTema },
                            ]}
                            onPress={salvarEdicao}
                            disabled={salvando}
                          >
                            <Text style={estilos.textoBotaoAdicionar}>
                              Salvar edição
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {exercicioParaCarga?.id === exercicio.id && (
                      <View style={estilos.formularioInterno}>
                        <Text style={estilos.rotulo}>
                          Registrar cargas por série (kg)
                        </Text>

                        {seriesCarga.map((serie, serieIndice) => (
                          <View
                            key={`${exercicio.id}-${serieIndice}`}
                            style={estilos.linhaCampos}
                          >
                            <View style={estilos.campoPequeno}>
                              <Text style={estilos.rotulo}>
                                Série {serieIndice + 1} · reps
                              </Text>

                              <TextInput
                                style={estilos.input}
                                value={serie.repeticoes}
                                onChangeText={(valor) =>
                                  atualizarSerieCarga(
                                    serieIndice,
                                    "repeticoes",
                                    valor,
                                  )
                                }
                                keyboardType="number-pad"
                                placeholder={exercicio.reps_goal}
                                placeholderTextColor="#828A85"
                              />
                            </View>

                            <View style={estilos.campoGrande}>
                              <Text style={estilos.rotulo}>Carga (kg)</Text>

                              <TextInput
                                style={estilos.input}
                                value={serie.carga}
                                onChangeText={(valor) =>
                                  atualizarSerieCarga(
                                    serieIndice,
                                    "carga",
                                    valor,
                                  )
                                }
                                keyboardType="decimal-pad"
                                placeholder="Ex.: 20"
                                placeholderTextColor="#828A85"
                              />
                            </View>
                          </View>
                        ))}

                        <View style={estilos.linhaBotoes}>
                          <TouchableOpacity
                            style={estilos.botaoSecundario}
                            onPress={() => setExercicioParaCarga(null)}
                          >
                            <Text style={estilos.textoBotaoSecundario}>
                              Cancelar
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              estilos.botaoAdicionarCompacto,
                              { backgroundColor: corTema },
                            ]}
                            onPress={salvarCargas}
                            disabled={salvando}
                          >
                            <Text style={estilos.textoBotaoAdicionar}>
                              {salvando ? "Salvando..." : "Salvar cargas"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101312" },
  centralizado: {
    flex: 1,
    backgroundColor: "#101312",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  conteudo: { paddingHorizontal: 22, paddingTop: 48, paddingBottom: 40 },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 22,
  },
  textoVoltar: { color: "#35D07F", fontSize: 16, fontWeight: "700" },
  marca: {
    color: "#35D07F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: { color: "#F0F3F1", fontSize: 29, fontWeight: "800" },
  subtitulo: {
    color: "#A4ADA7",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 20,
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 22,
    marginBottom: 14,
  },
  listaTreinos: { gap: 10 },
  cartaoTreino: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 15,
    padding: 13,
    gap: 12,
  },
  letraTreino: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
  },
  letraTreinoTexto: { color: "#F0F3F1", fontSize: 18, fontWeight: "800" },
  infoTreino: { flex: 1 },
  nomeTreino: { color: "#F0F3F1", fontSize: 15, fontWeight: "700" },
  descricaoTreino: { color: "#A4ADA7", fontSize: 12, marginTop: 5 },
  seta: { color: "#35D07F", fontSize: 23, fontWeight: "700" },
  conteudoCartaoTreino: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  acoesTreino: { alignItems: "flex-end", gap: 8 },
  botaoAdicionarTreino: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#25382C",
    borderWidth: 1,
    borderColor: "#35D07F",
  },
  textoBotaoAdicionarTreino: {
    color: "#6EE7A0",
    fontSize: 12,
    fontWeight: "800",
  },
  botaoExcluirTreino: {
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "#332020",
  },
  formulario: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 17,
    padding: 16,
    marginTop: 10,
  },
  formularioInterno: {
    width: "100%",
    backgroundColor: "#141A16",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  cabecalhoFormulario: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  textoCancelarFormulario: {
    color: "#A4ADA7",
    fontSize: 13,
    fontWeight: "700",
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#F0F3F1",
  },
  linhaCampos: { flexDirection: "row", gap: 12, marginTop: 15 },
  campoPequeno: { flex: 1 },
  campoGrande: { flex: 1.5 },
  botaoAdicionar: {
    backgroundColor: "#35D07F",
    paddingVertical: 15,
    borderRadius: 11,
    alignItems: "center",
    marginTop: 18,
  },
  botaoAdicionarCompacto: {
    flex: 1,
    backgroundColor: "#35D07F",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  botaoDesabilitado: { opacity: 0.65 },
  textoBotaoAdicionar: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  carregandoLista: { marginVertical: 25 },
  vazio: {
    backgroundColor: "#191E1B",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#2B332E",
    padding: 25,
    alignItems: "center",
  },
  vazioEmoji: { fontSize: 34, marginBottom: 10 },
  vazioTitulo: {
    color: "#F0F3F1",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  textoSecundario: {
    color: "#A4ADA7",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  listaExercicios: { gap: 10 },
  cartaoExercicio: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  numeroExercicio: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
  },
  numeroTexto: { color: "#35D07F", fontWeight: "800", fontSize: 15 },
  infoExercicio: { flex: 1, minWidth: 140 },
  nomeExercicio: { color: "#F0F3F1", fontSize: 14, fontWeight: "700" },
  detalheExercicio: { color: "#A4ADA7", fontSize: 12, marginTop: 5 },
  detalheRecorde: {
    color: "#6EE7A0",
    fontSize: 12,
    marginTop: 5,
    fontWeight: "700",
  },
  acoesExercicio: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
    flexWrap: "wrap",
  },
  botaoAcao: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#25382C",
    borderRadius: 8,
  },
  textoAcao: { color: "#6EE7A0", fontSize: 12, fontWeight: "700" },
  botaoExcluir: { paddingVertical: 8, paddingHorizontal: 10 },
  textoExcluir: { color: "#FF8A8A", fontSize: 12, fontWeight: "700" },
  linhaBotoes: { flexDirection: "row", gap: 10, marginTop: 14 },
  botaoSecundario: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#354039",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textoBotaoSecundario: {
    color: "#D8E0DA",
    fontWeight: "700",
    fontSize: 13,
  },
});
