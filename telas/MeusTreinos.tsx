import React, { useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useVoltarDoModal } from "../servicos/voltarModal";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
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
import { EntradaGaleriaWeb } from "../componentes/SeletorGaleriaWeb";
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
import { criarEstilos } from "./MeusTreinos.estilos";

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
  const focado = useIsFocused();
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
  const [carregandoCargas, setCarregandoCargas] = useState(false);
  const carregandoCargasRef = useRef(false);
  const cargasRequestIdRef = useRef(0);
  const cargasAbortRef = useRef<AbortController | null>(null);
  const [salvando, setSalvando] = useState(false);
  const reordenandoRef = useRef(false);
  const [repetirCarga, setRepetirCarga] = useState(false);
  const cargasAntesDeRepetir = useRef<SerieCarga[]>([]);
  const [fotoCarregandoId, setFotoCarregandoId] = useState<string | null>(null);
  const fotoEmEnvioRef = useRef(false);
  const scrollYAtualRef = useRef(0);
  const scrollOrigemFormularioRef = useRef(0);
  const scrollOrigemPainelRef = useRef(0);
  const restaurarScrollRef = useRef<number | null>(null);
  const rolagemSolicitadaRef = useRef<{
    treinoId: string;
    alvo: "inicio" | "formulario" | "cargas";
  } | null>(null);
  const treinoRenderizadoRef = useRef<string | null>(null);
  const inicioTreinoRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const formularioExercicioRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const formularioCargaRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const rolagemFrameRef = useRef<number | null>(null);
  const [origemFotoAberta, setOrigemFotoAberta] = useState<Exercicio | null>(
    null,
  );
  function selecionarTreino(treino: Treino | null) {
    rolagemSolicitadaRef.current = null;
    if (treinoSelecionado?.id !== treino?.id) {
      cargasRequestIdRef.current += 1;
      cargasAbortRef.current?.abort();
      carregandoCargasRef.current = false;
      setCarregandoCargas(false);
      setExercicios([]);
      setExercicioParaCarga(null);
    }
    setTreinoSelecionado(treino);
  }
  useVoltarDoModal(Boolean(treinoSelecionado), () => {
    selecionarTreino(null);
    setExercicioEditando(null);
    setExercicioParaCarga(null);
    setMostrarFormularioExercicio(false);
  });
  useVoltarDoModal(mostrarFormularioExercicio, cancelarFormularioExercicio);
  useVoltarDoModal(Boolean(exercicioEditando), cancelarEdicao);
  useVoltarDoModal(Boolean(exercicioParaCarga), cancelarCargas);
  useVoltarDoModal(Boolean(origemFotoAberta), () => setOrigemFotoAberta(null));
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null,
  );

  function alinharDestinoSolicitado() {
    if (rolagemFrameRef.current !== null)
      cancelAnimationFrame(rolagemFrameRef.current);
    rolagemFrameRef.current = requestAnimationFrame(() => {
      rolagemFrameRef.current = null;
      const pedido = rolagemSolicitadaRef.current;
      if (!pedido || treinoRenderizadoRef.current !== pedido.treinoId) return;
      // Espere a consulta terminar para medir o cartão já com as séries carregadas.
      if (pedido.alvo === "cargas" && carregandoCargasRef.current) return;
      const alvo = pedido.alvo === "formulario"
        ? formularioExercicioRef.current
        : pedido.alvo === "cargas"
          ? formularioCargaRef.current
          : inicioTreinoRef.current;
      const scroll = scrollViewRef.current;
      if (!alvo || !scroll) return;
      // Ambos são medidos na janela: não soma coordenadas de pais distintos.
      alvo.measureInWindow((_x, yAlvo, _largura, altura) => {
        if (altura <= 0 || rolagemSolicitadaRef.current !== pedido) return;
        scroll.measureInWindow((_sx, yScroll) => {
          if (rolagemSolicitadaRef.current !== pedido) return;
          const destino = Math.max(0, scrollYAtualRef.current + yAlvo - yScroll - 12);
          rolagemSolicitadaRef.current = null;
          scroll.scrollTo({ y: destino, animated: true });
        });
      });
    });
  }

  useEffect(() => () => {
    rolagemSolicitadaRef.current = null;
    if (rolagemFrameRef.current !== null)
      cancelAnimationFrame(rolagemFrameRef.current);
  }, []);

  function abrirFormularioExercicio(treino: Treino) {
    scrollOrigemFormularioRef.current = scrollYAtualRef.current;
    restaurarScrollRef.current = null;
    selecionarTreino(treino);
    rolagemSolicitadaRef.current = { treinoId: treino.id, alvo: "formulario" };
    setMostrarFormularioExercicio(true);
    alinharDestinoSolicitado();
  }

  function cancelarFormularioExercicio() {
    rolagemSolicitadaRef.current = null;
    restaurarScrollRef.current = scrollOrigemFormularioRef.current;
    setMostrarFormularioExercicio(false);
  }

  function cancelarEdicao() {
    restaurarScrollRef.current = scrollOrigemPainelRef.current;
    setExercicioEditando(null);
  }

  function cancelarCargas() {
    cargasRequestIdRef.current += 1;
    cargasAbortRef.current?.abort();
    cargasAbortRef.current = null;
    carregandoCargasRef.current = false;
    setCarregandoCargas(false);
    rolagemSolicitadaRef.current = null;
    restaurarScrollRef.current = scrollOrigemPainelRef.current;
    setExercicioParaCarga(null);
  }

  useEffect(() => {
    if (!focado) return;
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
  }, [focado]);

  useEffect(() => {
    if (!focado) return;
    let ativo = true;
    const controlador = new AbortController();
    const treino = treinoSelecionado;
    if (!treino) {
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
    async function carregarExercicios() {
      const exibicao = lerCacheParaExibicao<CacheExercicios>(usuarioId, chave);
      if (!ativo || controlador.signal.aborted) return;
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
        return;
      }
      if (!exibicao && !anterior) setCarregandoExercicios(true);
      let revisaoInicial = obterRevisaoDeDados();
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
        // Reaplica as referências a partir da sessão concluída mais recente.
        // Isso também recupera sessões antigas caso a migração do gatilho ainda
        // não estivesse aplicada quando o treino foi finalizado.
        const { data: ultimaSessao, error: erroUltimaSessao } =
          await supabase
            .from("workout_sessions")
            .select("id")
            .eq("plan_id", treinoId)
            .eq("user_id", usuarioId)
            .eq("status", "concluido")
            .not("finished_at", "is", null)
            .order("finished_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!ativo || controlador.signal.aborted) return;
        if (erroUltimaSessao) {
          mostrarMensagem(
            "Erro ao sincronizar cargas",
            erroUltimaSessao.message,
          );
          return;
        }
        if (ultimaSessao && listaBase.length > 0) {
          const { data: seriesHistoricas, error: erroSeriesHistoricas } =
            await supabase
              .from("workout_sets")
              .select("exercise_id, set_number, reps, weight_kg")
              .eq("session_id", ultimaSessao.id)
              .eq("user_id", usuarioId)
              .in("exercise_id", listaBase.map((exercicio) => exercicio.id))
              .gt("set_number", 0)
              .gt("reps", 0)
              .gte("weight_kg", 0)
              .lte("weight_kg", 2000)
              .order("set_number", { ascending: true });
          if (!ativo || controlador.signal.aborted) return;
          if (erroSeriesHistoricas) {
            mostrarMensagem(
              "Erro ao sincronizar cargas",
              erroSeriesHistoricas.message,
            );
            return;
          }
          const exerciciosHistoricos = new Map<
            string,
            { reps: number; weight_kg: number }[]
          >();
          for (const serie of seriesHistoricas ?? []) {
            if (!serie.exercise_id) continue;
            const lista = exerciciosHistoricos.get(serie.exercise_id) ?? [];
            lista.push({
              reps: Number(serie.reps),
              weight_kg: Number(serie.weight_kg),
            });
            exerciciosHistoricos.set(serie.exercise_id, lista);
          }
          for (const [exerciseId, series] of exerciciosHistoricos) {
            const referencias = series.map((serie, indice) => ({
              user_id: usuarioId,
              exercise_id: exerciseId,
              set_number: indice + 1,
              reps: serie.reps,
              weight_kg: serie.weight_kg,
              updated_at: new Date().toISOString(),
            }));
            const { error: erroSalvar } = await supabase
              .from("exercise_load_defaults")
              .upsert(referencias, {
                onConflict: "user_id,exercise_id,set_number",
              });
            if (erroSalvar) {
              mostrarMensagem("Erro ao sincronizar cargas", erroSalvar.message);
              return;
            }
            const { error: erroLimpar } = await supabase
              .from("exercise_load_defaults")
              .delete()
              .eq("user_id", usuarioId)
              .eq("exercise_id", exerciseId)
              .gt("set_number", referencias.length);
            if (erroLimpar) {
              mostrarMensagem("Erro ao sincronizar cargas", erroLimpar.message);
              return;
            }
          }
          if (exerciciosHistoricos.size > 0) {
            registrarMudancaDeDados();
            revisaoInicial = obterRevisaoDeDados();
          }
        }
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
  }, [focado, treinoSelecionado, usuarioId]);

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
      selecionarTreino(novoTreino);
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
        selecionarTreino(null);
        setMostrarFormularioExercicio(false);
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
          position:
            exercicios.reduce(
              (maior, exercicio) => Math.max(maior, exercicio.position),
              -1,
            ) + 1,
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

  async function moverExercicio(indice: number, direcao: -1 | 1) {
    const treino = treinoSelecionado;
    const destino = indice + direcao;
    if (
      !treino ||
      !usuarioId ||
      salvando ||
      reordenandoRef.current ||
      destino < 0 ||
      destino >= exercicios.length
    )
      return;

    const ordem = [...exercicios];
    [ordem[indice], ordem[destino]] = [ordem[destino], ordem[indice]];
    const movido = exercicios[indice];
    const vizinho = exercicios[destino];
    const posicaoMovido = movido.position;
    const posicaoVizinho = vizinho.position;
    const definirPosicao = async (exercicio: Exercicio, position: number) => {
      const { data, error } = await supabase
        .from("exercises")
        .update({ position })
        .eq("id", exercicio.id)
        .eq("plan_id", treino.id)
        .eq("user_id", usuarioId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(`O servidor não confirmou a posição de ${exercicio.name}.`);
    };
    reordenandoRef.current = true;
    setSalvando(true);
    try {
      // A posição temporária permite trocar dois valores sem colidir caso o
      // banco exija posições únicas dentro do treino.
      const temporaria =
        Math.max(...exercicios.map((exercicio) => exercicio.position), -1) + 1;
      await definirPosicao(movido, temporaria);
      await definirPosicao(vizinho, posicaoMovido);
      await definirPosicao(movido, posicaoVizinho);
      setExercicios(
        ordem.map((exercicio) =>
          exercicio.id === movido.id
            ? { ...exercicio, position: posicaoVizinho }
            : exercicio.id === vizinho.id
              ? { ...exercicio, position: posicaoMovido }
              : exercicio,
        ),
      );
      registrarMudancaDeDados();
    } catch (erro) {
      let erroReversao: unknown;
      try {
        const { data, error } = await supabase
          .from("exercises")
          .select("id, position")
          .eq("plan_id", treino.id)
          .eq("user_id", usuarioId)
          .in("id", [movido.id, vizinho.id]);
        if (error) throw error;
        const posicoesAtuais = new Map(
          (data ?? []).map((exercicio) => [exercicio.id, exercicio.position]),
        );
        if (
          posicoesAtuais.get(movido.id) !== posicaoMovido ||
          posicoesAtuais.get(vizinho.id) !== posicaoVizinho
        ) {
          const baseTemporaria =
            Math.max(
              ...Array.from(posicoesAtuais.values()),
              posicaoMovido,
              posicaoVizinho,
              -1,
            ) + 1;
          await definirPosicao(movido, baseTemporaria);
          await definirPosicao(vizinho, baseTemporaria + 1);
          await definirPosicao(movido, posicaoMovido);
          await definirPosicao(vizinho, posicaoVizinho);
        }
      } catch (erro) {
        erroReversao = erro;
      }
      const mensagemErro = (valor: unknown, alternativa: string) =>
        valor instanceof Error
          ? valor.message
          : valor &&
              typeof valor === "object" &&
              "message" in valor &&
              typeof valor.message === "string"
            ? valor.message
            : alternativa;
      mostrarMensagem(
        "Não foi possível mudar a ordem",
        `${mensagemErro(erro, "O servidor recusou a alteração.")}${
          erroReversao
            ? ` A restauração também falhou: ${mensagemErro(erroReversao, "erro desconhecido")}. Reabra o treino para conferir a ordem atual.`
            : " A ordem anterior foi restaurada."
        }`,
      );
    } finally {
      reordenandoRef.current = false;
      setSalvando(false);
    }
  }

  function iniciarEdicao(exercicio: Exercicio) {
    scrollOrigemPainelRef.current = scrollYAtualRef.current;
    restaurarScrollRef.current = null;
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
      restaurarScrollRef.current = scrollOrigemPainelRef.current;
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
    setOrigemFotoAberta(exercicio);
  }

  function escolherFonteFoto(origem: "biblioteca" | "camera") {
    const exercicio = origemFotoAberta;
    if (!exercicio || Platform.OS === "web" || fotoEmEnvioRef.current) return;

    setOrigemFotoAberta(null);
    void adicionarOuTrocarFoto(exercicio, origem);
  }

  function liberarFotoWeb(imagem?: ImagePicker.ImagePickerAsset) {
    if (
      Platform.OS === "web" &&
      imagem?.uri.startsWith("blob:") &&
      typeof URL.revokeObjectURL === "function"
    )
      URL.revokeObjectURL(imagem.uri);
  }

  async function adicionarOuTrocarFoto(
    exercicio: Exercicio,
    origem: "biblioteca" | "camera",
    fotoCapturada?: ImagePicker.ImagePickerAsset,
  ) {
    if (fotoEmEnvioRef.current) {
      liberarFotoWeb(fotoCapturada);
      return;
    }

    fotoEmEnvioRef.current = true;
    setFotoCarregandoId(exercicio.id);
    try {
      if (!usuarioId) {
        mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
        return;
      }
      if (!fotoCapturada && Platform.OS === "web") return;
      if (!fotoCapturada && origem === "camera") {
        const permissao = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissao.granted) {
          mostrarMensagem(
            "Permissão necessária",
            "Permita o acesso à câmera nas configurações do aparelho.",
          );
          return;
        }
      }
      const opcoesImagem: ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
        base64: Platform.OS !== "web",
      };
      const resultado = fotoCapturada
        ? null
        : origem === "camera"
          ? await ImagePicker.launchCameraAsync(opcoesImagem)
          : await ImagePicker.launchImageLibraryAsync(opcoesImagem);
      if (resultado?.canceled || (!fotoCapturada && !resultado?.assets[0]))
        return;
      const imagem = fotoCapturada ?? resultado!.assets[0];
      const { arquivoImagem, contentType, extensao } =
        await prepararFotoExercicio(imagem);
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
      liberarFotoWeb(fotoCapturada);
      fotoEmEnvioRef.current = false;
      setFotoCarregandoId(null);
    }
  }

  async function abrirRegistroCarga(exercicio: Exercicio) {
    if (!usuarioId || !treinoSelecionado) {
      mostrarMensagem("Sessão inválida", "Entre novamente na sua conta.");
      return;
    }

    if (exercicioParaCarga?.id === exercicio.id) {
      cancelarCargas();
      return;
    }

    const pedidoId = ++cargasRequestIdRef.current;
    cargasAbortRef.current?.abort();
    const controlador = new AbortController();
    cargasAbortRef.current = controlador;
    scrollOrigemPainelRef.current = scrollYAtualRef.current;
    restaurarScrollRef.current = null;
    rolagemSolicitadaRef.current = {
      treinoId: treinoSelecionado.id,
      alvo: "cargas",
    };
    carregandoCargasRef.current = true;
    setExercicioEditando(null);
    setExercicioParaCarga(exercicio);
    setSeriesCarga([]);
    setRepetirCarga(false);
    setCarregandoCargas(true);

    const chaveCacheCargas = `meus-treinos-cargas:${exercicio.id}`;
    try {
      const cargasEmCache = lerCache<SerieCarga[]>(usuarioId, chaveCacheCargas);
      if (cargasEmCache) {
        setSeriesCarga(cargasEmCache);
        return;
      }

      const { data: referencias, error } = await supabase
        .from("exercise_load_defaults")
        .select("set_number, reps, weight_kg")
        .eq("user_id", usuarioId)
        .eq("exercise_id", exercicio.id)
        .order("set_number", { ascending: true })
        .abortSignal(controlador.signal);

      if (pedidoId !== cargasRequestIdRef.current) return;

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
      salvarCache(usuarioId, chaveCacheCargas, series, 20000);
      setSeriesCarga(series);
    } catch {
      if (pedidoId === cargasRequestIdRef.current)
        mostrarMensagem("Erro", "Não foi possível carregar as cargas salvas.");
    } finally {
      if (pedidoId === cargasRequestIdRef.current) {
        cargasAbortRef.current = null;
        carregandoCargasRef.current = false;
        setCarregandoCargas(false);
        alinharDestinoSolicitado();
      }
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
      restaurarScrollRef.current = scrollOrigemPainelRef.current;
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
        scrollEventThrottle={16}
        onScroll={(evento) => {
          scrollYAtualRef.current = evento.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          const destino = restaurarScrollRef.current;
          if (destino === null) return;
          restaurarScrollRef.current = null;
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              scrollViewRef.current?.scrollTo({ y: destino, animated: false }),
            ),
          );
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
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir treino ${treino.name}`}
                    style={estilos.conteudoCartaoTreino}
                    onPress={() => {
                      selecionarTreino(treino);
                      restaurarScrollRef.current = null;
                      rolagemSolicitadaRef.current = { treinoId: treino.id, alvo: "inicio" };
                      setMostrarFormularioExercicio(false);
                      alinharDestinoSolicitado();
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
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar exercício ao treino ${treino.name}`}
                      style={estilos.botaoAdicionarTreino}
                      onPress={() => abrirFormularioExercicio(treino)}
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
            <View
              key={treinoSelecionado.id}
              ref={(no) => { treinoRenderizadoRef.current = no ? treinoSelecionado.id : null; }}
              onLayout={alinharDestinoSolicitado}
            >
              <View ref={inicioTreinoRef} collapsable={false} onLayout={alinharDestinoSolicitado} testID="inicio-treino-com-cronometro">
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
              </View>
              {mostrarFormularioExercicio && (
                <View
                  ref={formularioExercicioRef}
                  collapsable={false}
                  testID="formulario-adicionar-exercicio"
                  style={estilos.formulario}
                  onLayout={alinharDestinoSolicitado}
                >
                  <View style={estilos.cabecalhoFormulario}>
                    <Text style={estilos.rotulo}>
                      Novo exercício para {treinoSelecionado.name}
                    </Text>
                    <TouchableOpacity
                      onPress={cancelarFormularioExercicio}
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
                        disabled={
                          Boolean(fotoCarregandoId) ||
                          (Platform.OS === "web" && !exercicio.photo_url)
                        }
                        activeOpacity={0.8}
                        accessibilityLabel={`Visualizar foto de ${exercicio.name}`}
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
                          {`${indice + 1}.${exercicio.name}`}
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
                      <View style={estilos.acoesOrdem}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Mover ${exercicio.name} para cima`}
                          disabled={salvando || indice === 0}
                          onPress={() => void moverExercicio(indice, -1)}
                          style={[
                            estilos.botaoOrdem,
                            (salvando || indice === 0) &&
                              estilos.botaoOrdemDesabilitado,
                          ]}
                        >
                          <Text style={estilos.textoOrdem}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={`Mover ${exercicio.name} para baixo`}
                          disabled={salvando || indice === exercicios.length - 1}
                          onPress={() => void moverExercicio(indice, 1)}
                          style={[
                            estilos.botaoOrdem,
                            (salvando || indice === exercicios.length - 1) &&
                              estilos.botaoOrdemDesabilitado,
                          ]}
                        >
                          <Text style={estilos.textoOrdem}>↓</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={estilos.acoesExercicio}>
                        <TouchableOpacity
                          style={estilos.botaoAcao}
                          onPress={() => iniciarEdicao(exercicio)}
                        >
                          <Text numberOfLines={1} style={estilos.textoAcao}>
                            Editar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={estilos.botaoAcao}
                          onPress={() => abrirRegistroCarga(exercicio)}
                        >
                          <Text numberOfLines={1} style={estilos.textoAcao}>
                            Cargas
                          </Text>
                        </TouchableOpacity>
                        {Platform.OS === "web" ? (
                          <EntradaGaleriaWeb
                            rotulo={`Escolher foto de ${exercicio.name}`}
                            texto={
                              fotoCarregandoId === exercicio.id
                                ? "…"
                                : "Foto"
                            }
                            corTema={corTema}
                            compacto
                            disabled={Boolean(fotoCarregandoId)}
                            onSelecionar={(imagem) => {
                              void adicionarOuTrocarFoto(
                                exercicio,
                                "biblioteca",
                                imagem,
                              );
                            }}
                            onErro={(erro) =>
                              mostrarMensagem(
                                "Não foi possível escolher a foto",
                                erro.message,
                              )
                            }
                          />
                        ) : (
                          <TouchableOpacity
                            style={estilos.botaoAcao}
                            onPress={() => escolherOrigemFoto(exercicio)}
                            disabled={Boolean(fotoCarregandoId)}
                            accessibilityRole="button"
                            accessibilityLabel="Escolher câmera ou fototeca"
                          >
                            <Text numberOfLines={1} style={estilos.textoAcao}>
                              {fotoCarregandoId === exercicio.id
                                ? "…"
                                : "Foto"}
                            </Text>
                          </TouchableOpacity>
                        )}
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
                              onPress={cancelarEdicao}
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
                          <TouchableOpacity
                            accessibilityRole="button"
                            style={estilos.botaoExcluirEditor}
                            onPress={() => void excluirExercicio(exercicio)}
                            disabled={salvando}
                          >
                            <Text style={estilos.textoExcluir}>
                              Excluir exercício
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {exercicioParaCarga?.id === exercicio.id && (
                        <View
                          ref={formularioCargaRef}
                          collapsable={false}
                          onLayout={alinharDestinoSolicitado}
                          style={estilos.formularioInterno}
                        >
                          {carregandoCargas && (
                            <ActivityIndicator
                              size="small"
                              color={corTema}
                              style={estilos.carregandoLista}
                            />
                          )}
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
                              onPress={cancelarCargas}
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
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(origemFotoAberta)}
        onRequestClose={() => setOrigemFotoAberta(null)}
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#000D",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              backgroundColor: "#191E1B",
              borderRadius: 18,
              padding: 16,
              gap: 14,
              borderWidth: 1,
              borderColor: "#303A33",
            }}
          >
            <Text
              style={{
                color: "#F0F3F1",
                fontSize: 20,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              Visualizar foto
            </Text>
            <Text
              style={{
                color: "#A4ADA7",
                fontSize: 14,
                textAlign: "center",
              }}
              numberOfLines={2}
            >
              {origemFotoAberta?.name ?? "Foto do exercício"}
            </Text>
            {origemFotoAberta?.photo_url ? (
              <Image
                accessibilityLabel={`Foto do exercício ${origemFotoAberta.name}`}
                source={{ uri: origemFotoAberta.photo_url }}
                resizeMode="contain"
                style={{
                  width: "100%",
                  height: 280,
                  maxHeight: "55%",
                  borderRadius: 12,
                  backgroundColor: "#0D110F",
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: 160,
                  borderRadius: 12,
                  backgroundColor: "#0D110F",
                  borderWidth: 1,
                  borderColor: "#303A33",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 18,
                }}
              >
                <Text
                  style={{
                    color: "#A4ADA7",
                    textAlign: "center",
                    lineHeight: 21,
                  }}
                >
                  Este exercício ainda não tem foto. Escolha uma imagem da
                  galeria para adicioná-la.
                </Text>
              </View>
            )}
            {Platform.OS !== "web" ? (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Escolher uma foto da galeria"
                  style={{
                    minHeight: 50,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: corTema,
                  }}
                  disabled={Boolean(fotoCarregandoId)}
                  onPress={() => escolherFonteFoto("biblioteca")}
                >
                  <Text style={{ color: "#101312", fontWeight: "800" }}>
                    Escolher foto da galeria
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => escolherFonteFoto("camera")}
                  disabled={Boolean(fotoCarregandoId)}
                  style={{
                    minHeight: 46,
                    justifyContent: "center",
                    padding: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: corTema,
                  }}
                >
                  <Text
                    style={{
                      color: corTema,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    Tirar foto com a câmera
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setOrigemFotoAberta(null)}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: "#A4ADA7", textAlign: "center" }}>
                Fechar visualização
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
