import React, { useEffect, useRef, useState } from "react";
import { useVoltarDoModal } from "../servicos/voltarModal";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Alert } from "../servicos/alerta";
import RepetirCarga from "../componentes/RepetirCarga";
import * as ImagePicker from "expo-image-picker";
import type { ImagePickerOptions } from "expo-image-picker";
import { prepararFotoExercicio } from "../servicos/fotoExercicio";
import { supabase } from "../supabase";
import { obterFotosAssinadas } from "../servicos/fotosAssinadas";
import {
  registrarMudancaDeDados,
  obterRevisaoDeDados,
} from "../servicos/revisaoDados";
import {
  lerCache,
  lerCacheParaExibicao,
  salvarCache,
} from "../servicos/cacheConsultas";
import { medir } from "../servicos/performance";

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
  photo_path?: string | null;
  photo_url?: string | null;
};

type SerieCarga = {
  repeticoes: string;
  carga: string;
};

type Props = {
  onVoltar: () => void;
  onIniciarTreino: (treino: Treino) => void;
  corTema?: string;
};

export default function MeusTreinos({
  onVoltar,
  onIniciarTreino,
  corTema = "#0878D1",
}: Props) {
  const estilos = criarEstilos(corTema);
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
  const [repetirCarga, setRepetirCarga] = useState(false);
  const cargasAntesDeRepetir = useRef<SerieCarga[]>([]);
  const [fotoCarregandoId, setFotoCarregandoId] = useState<string | null>(null);
  useVoltarDoModal(Boolean(treinoSelecionado), () => {
    setTreinoSelecionado(null);
    setExercicioEditando(null);
    setExercicioParaCarga(null);
    setMostrarFormularioExercicio(false);
  });
  useVoltarDoModal(mostrarFormularioExercicio, () =>
    setMostrarFormularioExercicio(false),
  );
  useVoltarDoModal(Boolean(exercicioEditando), () =>
    setExercicioEditando(null),
  );
  useVoltarDoModal(Boolean(exercicioParaCarga), () =>
    setExercicioParaCarga(null),
  );
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null,
  );

  useEffect(() => {
    let ativo = true;
    const controlador = new AbortController();
    async function carregarTreinos() {
      try {
        // Apenas o usuário autenticado pode ler o cache de sua própria conta.
        const { data: usuarioData, error: usuarioErro } =
          await supabase.auth.getUser();
        if (!ativo) return;
        if (usuarioErro || !usuarioData.user) {
          Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
          return;
        }
        const id = usuarioData.user.id;
        setUsuarioId(id);
        const ch = "meus-treinos-planos";
        const exibicao = lerCacheParaExibicao<Treino[]>(id, ch);
        if (exibicao) {
          setTreinos(exibicao);
          setCarregando(false);
        }
        const armazenados = lerCache<Treino[]>(id, ch);
        if (armazenados) {
          setTreinos(armazenados);
          setCarregando(false);
          return;
        }
        const revisaoInicial = obterRevisaoDeDados();
        const { data, error } = await medir("meusTreinos.planos", () =>
          supabase
            .from("workout_plans")
            .select("id, name")
            .eq("user_id", id)
            .order("created_at", { ascending: true })
            .abortSignal(controlador.signal),
        );
        if (!ativo || controlador.signal.aborted) return;
        if (error) {
          Alert.alert("Erro", "Não foi possível carregar seus treinos.");
          return;
        }
        if (revisaoInicial !== obterRevisaoDeDados()) return;
        const planos = (data ?? []) as Treino[];
        salvarCache(id, "meus-treinos-planos", planos, 20000);
        setTreinos(planos);
      } catch {
        if (ativo && !controlador.signal.aborted)
          Alert.alert("Erro", "Não foi possível conectar ao Supabase.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregarTreinos();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    const controlador = new AbortController();
    const treino = treinoSelecionado;
    if (!treino) {
      setExercicios([]);
      setExercicioParaCarga(null);
      return () => {
        ativo = false;
        controlador.abort();
      };
    }
    if (!usuarioId)
      return () => {
        ativo = false;
        controlador.abort();
      };
    const treinoId = treino.id;
    const chave = `meus-treinos-exercicios:${treinoId}`;
    type CacheExercicios = {
      lista: Exercicio[];
      cargas: Record<string, number>;
    };
    const exibicao = lerCacheParaExibicao<CacheExercicios>(usuarioId, chave);
    if (exibicao) {
      setExercicios(exibicao.lista);
      setMaioresCargas((atuais) => ({ ...atuais, ...exibicao.cargas }));
      setCarregandoExercicios(false);
    }
    const anterior = lerCache<CacheExercicios>(usuarioId, chave);
    if (anterior) {
      setExercicios(anterior.lista);
      setMaioresCargas((atuais) => ({ ...atuais, ...anterior.cargas }));
      setCarregandoExercicios(false);
      return () => {
        ativo = false;
        controlador.abort();
      };
    }
    async function carregarExercicios() {
      if (!exibicao) setCarregandoExercicios(true);
      const revisaoInicial = obterRevisaoDeDados();
      try {
        const { data, error } = await medir("meusTreinos.exercicios", () =>
          supabase
            .from("exercises")
            .select(
              "id, plan_id, name, sets_goal, reps_goal, position, photo_path",
            )
            .eq("plan_id", treinoId)
            .eq("user_id", usuarioId)
            .order("position")
            .abortSignal(controlador.signal),
        );
        if (!ativo || controlador.signal.aborted) return;
        if (error) {
          Alert.alert("Erro", "Não foi possível carregar os exercícios.");
          return;
        }
        const listaBase = (data ?? []) as Exercicio[];
        const [urlsFotos, resultadoReferencias] = await medir(
          "meusTreinos.fotosECargas",
          () =>
            Promise.all([
              obterFotosAssinadas(
                "exercise-photos",
                listaBase.map((e) => e.photo_path),
                604800,
                usuarioId,
              ),
              listaBase.length > 0
                ? supabase
                    .from("exercise_load_defaults")
                    .select("exercise_id, set_number, reps, weight_kg")
                    .eq("user_id", usuarioId)
                    .in(
                      "exercise_id",
                      listaBase.map((e) => e.id),
                    )
                    .order("set_number", { ascending: true })
                    .abortSignal(controlador.signal)
                : Promise.resolve({ data: [], error: null }),
            ]),
        );
        if (!ativo || controlador.signal.aborted) return;
        const { data: referencias, error: erroReferencias } =
          resultadoReferencias;
        if (erroReferencias) {
          mostrarMensagem("Erro ao carregar cargas", erroReferencias.message);
          return;
        }
        const cargas: Record<string, number> = {};
        for (const referencia of referencias ?? []) {
          const carga = Number(referencia.weight_kg);
          if (Number.isFinite(carga))
            cargas[referencia.exercise_id] = Math.max(
              cargas[referencia.exercise_id] ?? 0,
              carga,
            );
        }
        if (revisaoInicial !== obterRevisaoDeDados()) return;
        const lista = listaBase.map((e) => ({
          ...e,
          photo_url: e.photo_path
            ? (urlsFotos.get(e.photo_path) ?? null)
            : null,
        }));
        salvarCache(usuarioId, chave, { lista, cargas }, 20000);
        setExercicios(lista);
        setMaioresCargas((atuais) => ({ ...atuais, ...cargas }));
      } catch {
        if (ativo && !controlador.signal.aborted)
          Alert.alert("Erro", "Não foi possível conectar ao Supabase.");
      } finally {
        if (ativo) setCarregandoExercicios(false);
      }
    }
    void carregarExercicios();
    return () => {
      ativo = false;
      controlador.abort();
    };
  }, [treinoSelecionado, usuarioId]);

  async function criarTreino() {
    const nome = nomeNovoTreino.trim();
    if (!nome) {
      Alert.alert("Atenção", "Digite o nome do novo treino.");
      return;
    }
    if (!usuarioId) {
      Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
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
          Alert.alert(
            "Nome já utilizado",
            "Você já tem um treino com esse nome. Escolha outro.",
          );
        } else {
          Alert.alert("Erro ao criar treino", error.message);
        }
        return;
      }

      const novoTreino = data as Treino;
      registrarMudancaDeDados();
      setTreinos((atuais) =>
        [...atuais, novoTreino].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setTreinoSelecionado(novoTreino);
      setMostrarFormularioExercicio(false);
      setNomeNovoTreino("");
    } catch {
      Alert.alert("Erro", "Não foi possível criar o treino.");
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

      registrarMudancaDeDados();
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
      Alert.alert("Atenção", "Selecione um treino primeiro.");
      return;
    }
    if (!nome) {
      Alert.alert("Atenção", "Digite o nome do exercício.");
      return;
    }
    if (!Number.isInteger(series) || series < 1 || series > 20) {
      Alert.alert("Atenção", "Informe entre 1 e 20 séries.");
      return;
    }
    if (!reps) {
      Alert.alert("Atenção", "Informe a quantidade de repetições.");
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
        .select("id, plan_id, name, sets_goal, reps_goal, position, photo_path")
        .single();

      if (error) {
        Alert.alert("Erro ao salvar", error.message);
        return;
      }

      registrarMudancaDeDados();
      setExercicios((atuais) =>
        [...atuais, data as Exercicio].sort((a, b) => a.position - b.position),
      );
      setNomeExercicio("");
      setQuantidadeSeries("3");
      setRepeticoes("8-12");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar o exercício.");
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
      Alert.alert(
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
        .select("id, plan_id, name, sets_goal, reps_goal, position, photo_path")
        .single();

      if (error) {
        Alert.alert("Erro ao editar", error.message);
        return;
      }

      registrarMudancaDeDados();
      setExercicios((atuais) =>
        atuais.map((item) =>
          item.id === exercicioEditando.id
            ? { ...(data as Exercicio), photo_url: item.photo_url }
            : item,
        ),
      );
      setExercicioEditando(null);
    } catch {
      Alert.alert("Erro", "Não foi possível editar o exercício.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirExercicio(exercicio: Exercicio) {
    const confirmado = await confirmarExclusao(
      "Excluir exercício",
      `Deseja excluir "${exercicio.name}" deste treino?`,
    );

    if (!confirmado) return;

    try {
      const { error: erroPreservarHistorico } = await supabase
        .from("workout_sets")
        .update({ exercise_id: null })
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id);

      if (erroPreservarHistorico) {
        mostrarMensagem(
          "Histórico preservado",
          `Não foi possível proteger os registros anteriores. O exercício não foi excluído: ${erroPreservarHistorico.message}`,
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

      registrarMudancaDeDados();
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
        "O exercício foi excluído com sucesso.",
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

  function escolherOrigemFoto(exercicio: Exercicio) {
    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      /Android/i.test(navigator.userAgent)
    ) {
      const usarCamera =
        typeof window !== "undefined" &&
        window.confirm(
          "Para fotografar agora, confirme. Para escolher uma imagem da galeria, cancele.",
        );
      void adicionarOuTrocarFoto(
        exercicio,
        usarCamera ? "camera" : "biblioteca",
      );
      return;
    }
    if (Platform.OS !== "android") {
      void adicionarOuTrocarFoto(exercicio, "biblioteca");
      return;
    }
    Alert.alert(
      "Foto do exercício",
      "Escolha de onde deseja adicionar a foto.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Biblioteca de fotos",
          onPress: () => void adicionarOuTrocarFoto(exercicio, "biblioteca"),
        },
        {
          text: "Câmera",
          onPress: () => void adicionarOuTrocarFoto(exercicio, "camera"),
        },
      ],
    );
  }

  async function adicionarOuTrocarFoto(
    exercicio: Exercicio,
    origem: "biblioteca" | "camera",
  ) {
    if (!usuarioId) {
      mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
      return;
    }

    setFotoCarregandoId(exercicio.id);
    try {
      if (Platform.OS !== "web") {
        const permissao =
          origem === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissao.granted) {
          mostrarMensagem(
            "Permissão necessária",
            origem === "camera"
              ? "Permita o acesso à câmera nas configurações do Android."
              : "Permita o acesso às fotos nas configurações do Android.",
          );
          return;
        }
      }
      const opcoesImagem: ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: Platform.OS !== "web",
      };
      const resultado =
        origem === "camera" && Platform.OS !== "web"
          ? await ImagePicker.launchCameraAsync(opcoesImagem)
          : await ImagePicker.launchImageLibraryAsync(opcoesImagem);

      if (resultado.canceled || !resultado.assets[0]) return;

      const imagem = resultado.assets[0];
      const { arquivoImagem, contentType, extensao } =
        await prepararFotoExercicio(imagem);
      // eslint-disable-next-line react-hooks/purity -- Timestamp is created in the async photo button handler, never during render.
      const novoCaminho = `${usuarioId}/${exercicio.id}/${Date.now()}.${extensao}`;
      const { error: erroUpload } = await supabase.storage
        .from("exercise-photos")
        .upload(novoCaminho, arquivoImagem, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });

      if (erroUpload) {
        mostrarMensagem("Não foi possível enviar a foto", erroUpload.message);
        return;
      }

      const { error: erroAtualizarExercicio } = await supabase
        .from("exercises")
        .update({ photo_path: novoCaminho })
        .eq("id", exercicio.id)
        .eq("plan_id", exercicio.plan_id)
        .eq("user_id", usuarioId);

      if (erroAtualizarExercicio) {
        await supabase.storage.from("exercise-photos").remove([novoCaminho]);
        mostrarMensagem(
          "Não foi possível salvar a foto",
          erroAtualizarExercicio.message,
        );
        return;
      }

      const { data: fotoAssinada, error: erroUrl } = await supabase.storage
        .from("exercise-photos")
        .createSignedUrl(novoCaminho, 604800);

      registrarMudancaDeDados();
      setExercicios((atuais) =>
        atuais.map((item) =>
          item.id === exercicio.id
            ? {
                ...item,
                photo_path: novoCaminho,
                photo_url: fotoAssinada?.signedUrl ?? null,
              }
            : item,
        ),
      );

      if (exercicio.photo_path) {
        await supabase.storage
          .from("exercise-photos")
          .remove([exercicio.photo_path]);
      }

      if (erroUrl) {
        mostrarMensagem(
          "Foto salva",
          "A foto foi salva. Ela aparecerá após recarregar os exercícios.",
        );
        return;
      }

      mostrarMensagem("Foto salva", "A foto do exercício foi atualizada.");
    } catch (erro) {
      mostrarMensagem(
        "Erro ao adicionar foto",
        erro instanceof Error
          ? erro.message
          : "Não foi possível selecionar ou enviar a foto.",
      );
    } finally {
      setFotoCarregandoId(null);
    }
  }

  async function abrirRegistroCarga(exercicio: Exercicio) {
    if (!usuarioId || !treinoSelecionado) {
      mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
      return;
    }

    setExercicioEditando(null);
    setExercicioParaCarga(exercicio);
    setRepetirCarga(false);
    setCarregandoExercicios(true);

    try {
      const { data: referencias, error } = await supabase
        .from("exercise_load_defaults")
        .select("set_number, reps, weight_kg")
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id)
        .order("set_number", { ascending: true });

      if (error) {
        mostrarMensagem("Erro ao carregar cargas", error.message);
        return;
      }

      const salvas = referencias ?? [];
      const quantidade = Math.max(exercicio.sets_goal || 1, salvas.length, 1);
      const repsPadrao =
        String(exercicio.reps_goal || "8-12").match(/\d+/)?.[0] ?? "8";
      const series = Array.from({ length: quantidade }, (_, indice) => {
        const salva = salvas.find(
          (item) => Number(item.set_number) === indice + 1,
        );
        return {
          repeticoes: salva ? String(salva.reps) : repsPadrao,
          carga: salva ? String(salva.weight_kg) : "",
        };
      });
      setSeriesCarga(series);
    } catch {
      mostrarMensagem("Erro", "Não foi possível carregar as cargas salvas.");
    } finally {
      setCarregandoExercicios(false);
    }
  }

  function atualizarSerieCarga(
    indice: number,
    campo: keyof SerieCarga,
    valor: string,
  ) {
    setSeriesCarga((atuais) =>
      atuais.map((serie, posicao) =>
        posicao === indice || (campo === "carga" && repetirCarga)
          ? { ...serie, [campo]: valor }
          : serie,
      ),
    );
  }

  async function salvarCargas() {
    if (!exercicioParaCarga || !treinoSelecionado || !usuarioId) return;

    if (
      seriesCarga.length === 0 ||
      seriesCarga.some(
        (serie) => !serie.repeticoes.trim() || !serie.carga.trim(),
      )
    ) {
      mostrarMensagem(
        "Preencha as séries",
        "Informe as repetições e a carga de cada série.",
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
      const registrosReferencia = seriesValidadas.map((serie, indice) => ({
        user_id: usuarioId,
        exercise_id: exercicioParaCarga.id,
        set_number: indice + 1,
        reps: serie.reps,
        weight_kg: serie.weight_kg,
        updated_at: new Date().toISOString(),
      }));

      const { error: erroSalvarReferencias } = await supabase
        .from("exercise_load_defaults")
        .upsert(registrosReferencia, {
          onConflict: "user_id,exercise_id,set_number",
        });
      if (erroSalvarReferencias) {
        mostrarMensagem("Erro ao salvar cargas", erroSalvarReferencias.message);
        return;
      }

      registrarMudancaDeDados();
      const { error: erroLimparSeriesAntigas } = await supabase
        .from("exercise_load_defaults")
        .delete()
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicioParaCarga.id)
        .gt("set_number", seriesValidadas.length);
      if (erroLimparSeriesAntigas) {
        mostrarMensagem(
          "Cargas salvas parcialmente",
          `As novas cargas foram salvas, mas não foi possível remover séries de referência que deixaram de ser usadas: ${erroLimparSeriesAntigas.message}`,
        );
        return;
      }

      const maiorCargaNova = Math.max(
        ...seriesValidadas.map((serie) => serie.weight_kg),
      );
      setMaioresCargas((atuais) => ({
        ...atuais,
        [exercicioParaCarga.id]: maiorCargaNova,
      }));
      setExercicioParaCarga(null);
      mostrarMensagem(
        "Cargas salvas",
        "As cargas de referência foram atualizadas para os próximos treinos. Os registros já feitos no histórico permanecem exatamente como foram registrados.",
      );
    } catch (erro) {
      mostrarMensagem(
        "Erro",
        erro instanceof Error
          ? erro.message
          : "Não foi possível conectar ao Supabase.",
      );
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
        style={{ flex: 1, minHeight: 0 }}
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
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
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
              salvando && estilos.botaoDesabilitado,
            ]}
            onPress={criarTreino}
            disabled={salvando}
          >
            {salvando ? (
              <ActivityIndicator color="#101312" />
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
                    selecionado && estilos.cartaoTreinoSelecionado,
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
                        selecionado && estilos.letraTreinoSelecionada,
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
                    <Text style={estilos.seta}>{selecionado ? "✓" : "›"}</Text>
                  </TouchableOpacity>
                  <View style={estilos.acoesTreino}>
                    <TouchableOpacity
                      style={estilos.botaoAdicionarTreino}
                      onPress={() => {
                        setTreinoSelecionado(treino);
                        setMostrarFormularioExercicio(true);
                      }}
                    >
                      <Text style={estilos.textoBotaoAdicionarTreino}>
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
          <>
            <View>
              <Text style={estilos.tituloSecao}>
                Exercícios — {treinoSelecionado.name}
              </Text>
              {exercicios.length > 0 &&
                !mostrarFormularioExercicio &&
                !exercicioEditando &&
                !exercicioParaCarga && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: corTema,
                      borderRadius: 12,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      alignItems: "center",
                      marginTop: 10,
                      marginBottom: 8,
                    }}
                    onPress={() => onIniciarTreino(treinoSelecionado)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={{
                        color: "#101312",
                        fontSize: 15,
                        fontWeight: "800",
                      }}
                    >
                      ▶ Iniciar treino com cronômetro
                    </Text>
                  </TouchableOpacity>
                )}
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
                      salvando && estilos.botaoDesabilitado,
                    ]}
                    onPress={adicionarExercicio}
                    disabled={salvando}
                  >
                    {salvando ? (
                      <ActivityIndicator color="#101312" />
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
                  <Text style={estilos.vazioTitulo}>
                    Nenhum exercício ainda
                  </Text>
                  <Text style={estilos.textoSecundario}>
                    Use o botão “+ Adicionar exercício” neste treino para
                    cadastrar o primeiro.
                  </Text>
                </View>
              ) : (
                <View style={estilos.listaExercicios}>
                  {exercicios.map((exercicio, indice) => (
                    <View key={exercicio.id} style={estilos.cartaoExercicio}>
                      <TouchableOpacity
                        style={estilos.numeroExercicio}
                        onPress={() => escolherOrigemFoto(exercicio)}
                        disabled={fotoCarregandoId === exercicio.id}
                        activeOpacity={0.8}
                      >
                        {exercicio.photo_url ? (
                          <Image
                            source={{ uri: exercicio.photo_url }}
                            style={estilos.fotoExercicio}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={estilos.numeroTexto}>
                            {fotoCarregandoId === exercicio.id
                              ? "…"
                              : indice + 1}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <View style={estilos.infoExercicio}>
                        <Text style={estilos.nomeExercicio}>
                          {exercicio.name}
                        </Text>
                        <Text style={estilos.detalheExercicio}>
                          {exercicio.sets_goal} séries · {exercicio.reps_goal}{" "}
                          repetições
                        </Text>
                        <Text style={estilos.detalheRecorde}>
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
                          <Text style={estilos.textoAcao}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={estilos.botaoAcao}
                          onPress={() => abrirRegistroCarga(exercicio)}
                        >
                          <Text style={estilos.textoAcao}>Cargas</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={estilos.botaoAcao}
                          onPress={() => escolherOrigemFoto(exercicio)}
                          disabled={fotoCarregandoId === exercicio.id}
                        >
                          <Text style={estilos.textoAcao}>
                            {fotoCarregandoId === exercicio.id
                              ? "Enviando foto…"
                              : exercicio.photo_path
                                ? "Trocar foto"
                                : "Adicionar foto"}
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
                              style={estilos.botaoAdicionarCompacto}
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
                          <Text style={estilos.descricaoTreino}>
                            Cargas salvas como referência. Se não houver
                            evolução, basta consultar e fechar; altere somente
                            quando quiser atualizar seus valores.
                          </Text>
                          <Text style={[estilos.rotulo, { marginTop: 18 }]}>
                            Registrar cargas por série (kg)
                          </Text>
                          <RepetirCarga
                            marcado={repetirCarga}
                            cor={corTema}
                            bloqueado={salvando}
                            onAlterar={(valor) => {
                              if (valor) {
                                cargasAntesDeRepetir.current = seriesCarga.map(
                                  (serie) => ({ ...serie }),
                                );
                                setSeriesCarga((atuais) =>
                                  atuais.map((serie) => ({
                                    ...serie,
                                    carga: atuais[0]?.carga ?? "",
                                  })),
                                );
                              } else if (
                                cargasAntesDeRepetir.current.length ===
                                seriesCarga.length
                              ) {
                                setSeriesCarga(
                                  cargasAntesDeRepetir.current.map((serie) => ({
                                    ...serie,
                                  })),
                                );
                              }
                              setRepetirCarga(valor);
                            }}
                          />
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
                              style={estilos.botaoAdicionarCompacto}
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

const criarEstilos = (corTema: string) =>
  StyleSheet.create({
    cartaoSessao: {
      backgroundColor: "#191E1B",
      borderWidth: 1,
      borderColor: "#2B332E",
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    cartaoSessaoSelecionado: {
      borderColor: corTema,
      backgroundColor: `${corTema}18`,
    },
    container: { flex: 1, backgroundColor: "#101312" },
    centralizado: {
      flex: 1,
      backgroundColor: "#101312",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    conteudo: {
      paddingHorizontal: 22,
      paddingTop: Platform.OS === "web" ? 8 : 48,
      paddingBottom: 40,
    },
    botaoVoltar: {
      alignSelf: "flex-start",
      paddingVertical: 8,
      paddingRight: 16,
      marginBottom: 22,
    },
    textoVoltar: { color: corTema, fontSize: 16, fontWeight: "700" },
    marca: {
      color: corTema,
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
    cartaoTreinoSelecionado: {
      borderColor: corTema,
      backgroundColor: `${corTema}18`,
    },
    letraTreino: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor: `${corTema}20`,
      alignItems: "center",
      justifyContent: "center",
    },
    letraTreinoSelecionada: { backgroundColor: corTema },
    letraTreinoTexto: { color: "#F0F3F1", fontSize: 18, fontWeight: "800" },
    infoTreino: { flex: 1 },
    nomeTreino: { color: "#F0F3F1", fontSize: 15, fontWeight: "700" },
    descricaoTreino: { color: "#A4ADA7", fontSize: 12, marginTop: 5 },
    seta: { color: corTema, fontSize: 23, fontWeight: "700" },
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
      backgroundColor: `${corTema}20`,
      borderWidth: 1,
      borderColor: corTema,
    },
    textoBotaoAdicionarTreino: {
      color: corTema,
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
      backgroundColor: corTema,
      paddingVertical: 15,
      borderRadius: 11,
      alignItems: "center",
      marginTop: 18,
    },
    botaoAdicionarCompacto: {
      flex: 1,
      backgroundColor: corTema,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    botaoDesabilitado: { opacity: 0.65 },
    textoBotaoAdicionar: { color: "#101312", fontWeight: "800", fontSize: 14 },
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
      width: 64,
      height: 64,
      borderRadius: 13,
      backgroundColor: `${corTema}20`,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      flexShrink: 0,
    },
    fotoExercicio: {
      width: "100%",
      height: "100%",
      borderRadius: 13,
    },
    numeroTexto: { color: corTema, fontWeight: "800", fontSize: 18 },
    infoExercicio: { flex: 1, minWidth: 140 },
    nomeExercicio: { color: "#F0F3F1", fontSize: 14, fontWeight: "700" },
    detalheExercicio: { color: "#A4ADA7", fontSize: 12, marginTop: 5 },
    detalheRecorde: {
      color: corTema,
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
      backgroundColor: `${corTema}20`,
      borderRadius: 8,
    },
    textoAcao: { color: corTema, fontSize: 12, fontWeight: "700" },
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
    textoBotaoSecundario: { color: "#D8E0DA", fontWeight: "700", fontSize: 13 },
  });
