import React, { useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useVoltarDoModal } from "../servicos/voltarModal";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { useFotoExercicio } from "../componentes/fotos/useFotoExercicio";
import ModalFotoExercicio from "../componentes/fotos/ModalFotoExercicio";
import { EntradaGaleriaWeb } from "../componentes/fotos/SeletorGaleriaWeb";
import { supabase } from "../supabase";
import { obterFotosAssinadas } from "../servicos/fotosAssinadas";
import {
  registrarMudancaDeDados,
  obterRevisaoDeDados,
  assinarMudancasDeDados,
} from "../servicos/revisaoDados";
import {
  lerCache,
  lerCacheParaExibicao,
  salvarCache,
} from "../servicos/cacheConsultas";
import { medir } from "../servicos/performance";
import { criarEstilos } from "./MeusTreinos.estilos";
import Acompanhamento from "../componentes/Acompanhamento";
import OrientacoesTreinador from "../componentes/OrientacoesTreinador";
import { renomearTreino } from "../servicos/acompanhamento";
import { criarEditorTreinosAluno, type ContextoTreinosAluno, type SnapshotTreinoAluno } from "../servicos/editorTreinosAluno";

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

type CacheExercicios = {
  lista: Exercicio[];
  cargas: Record<string, number>;
  completo?: boolean;
};

type SerieCarga = {
  repeticoes: string;
  carga: string;
};

type Props = {
  onVoltar: () => void;
  onIniciarTreino?: (treino: Treino) => void;
  corTema?: string;
  aluno?: ContextoTreinosAluno;
  registrarVoltar?: (fechar: (() => void) | null) => void;
};

function mensagemOperacaoTreino(erro: unknown) {
  if (erro && typeof erro === "object") {
    if ("code" in erro && erro.code === "PGRST202")
      return "A atualização do banco para esta operação ainda precisa ser aplicada.";
    if ("message" in erro && typeof erro.message === "string") return erro.message;
  }
  return "Não foi possível confirmar a operação. Reabra o treino para conferir.";
}

export default function MeusTreinos({
  onVoltar,
  onIniciarTreino,
  corTema = "#0878D1",
  aluno,
  registrarVoltar,
}: Props) {
  const apiAluno = useMemo(() => aluno ? criarEditorTreinosAluno(aluno) : null, [aluno]);
  const snapshotAluno = useRef<SnapshotTreinoAluno | null>(null);
  const operacaoAluno = useRef(false);
  const leituraAluno = useRef(0);
  const [erroAluno, setErroAluno] = useState("");
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
  const [treinoRenomeando, setTreinoRenomeando] = useState<Treino | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const renomeandoRef = useRef(false);
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
  const [recarregar, setRecarregar] = useState(0);
  const [revisaoFotos, setRevisaoFotos] = useState(0);
  const [carregandoExercicios, setCarregandoExercicios] = useState(false);
  const [carregandoCargas, setCarregandoCargas] = useState(false);
  const prefetchTreinosRef = useRef(new Set<string>());
  const prefetchControllerRef = useRef<AbortController | null>(null);
  const carregandoCargasRef = useRef(false);
  const cargasRequestIdRef = useRef(0);
  const cargasAbortRef = useRef<AbortController | null>(null);
  const [salvando, setSalvando] = useState(false);
  const reordenandoRef = useRef(false);
  const [repetirCarga, setRepetirCarga] = useState(false);
  const cargasAntesDeRepetir = useRef<SerieCarga[]>([]);
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
  const { origemFotoAberta, setOrigemFotoAberta, fotoCarregandoId, fotoEmEnvioRef, adicionarOuTrocarFoto, escolherFonteFoto, confirmarExclusaoFoto } = useFotoExercicio<Exercicio>({
    usuarioId,
    avisar: mostrarMensagem,
    aoSalvar: (exercicio, caminho, url) => setExercicios((atuais) =>
      atuais.map((item) => item.id === exercicio.id ? { ...item, photo_path: caminho, photo_url: url } : item),
    ),
    salvarVinculo: apiAluno ? (exercicio, caminho) =>
      alterarTreinoAluno("set_photo", { exercise_id: exercicio.id, photo_path: caminho }, exercicio.plan_id) : undefined,
  });
  function selecionarTreino(treino: Treino | null) {
    rolagemSolicitadaRef.current = null;
    if (treinoSelecionado?.id !== treino?.id) {
      prefetchControllerRef.current?.abort();
      cargasRequestIdRef.current += 1;
      cargasAbortRef.current?.abort();
      carregandoCargasRef.current = false;
      setCarregandoCargas(false);
      setExercicios([]);
      setExercicioParaCarga(null);
    }
    setTreinoSelecionado(treino);
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

  useVoltarDoModal(Boolean(aluno), onVoltar);
  useVoltarDoModal(Boolean(treinoSelecionado), () => {
    selecionarTreino(null);
    setExercicioEditando(null);
    setExercicioParaCarga(null);
    setMostrarFormularioExercicio(false);
  });
  useVoltarDoModal(mostrarFormularioExercicio, () => cancelarFormularioExercicio());
  useVoltarDoModal(Boolean(exercicioEditando), () => cancelarEdicao());
  useVoltarDoModal(Boolean(exercicioParaCarga), () => cancelarCargas());
  useVoltarDoModal(Boolean(origemFotoAberta), () => setOrigemFotoAberta(null));
  useVoltarDoModal(Boolean(treinoRenomeando), () => { if (!renomeandoRef.current) setTreinoRenomeando(null); });
  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null,
  );

  useEffect(() => {
    if (!registrarVoltar) return;
    registrarVoltar(() => {
      if (operacaoAluno.current || fotoEmEnvioRef.current) return;
      if (treinoRenomeando) setTreinoRenomeando(null);
      else if (origemFotoAberta) setOrigemFotoAberta(null);
      else if (exercicioParaCarga) cancelarCargas();
      else if (exercicioEditando) cancelarEdicao();
      else if (mostrarFormularioExercicio) cancelarFormularioExercicio();
      else if (treinoSelecionado) selecionarTreino(null);
      else onVoltar();
    });
    return () => registrarVoltar(null);
  });

  function aplicarSnapshotAluno(snapshot: SnapshotTreinoAluno) {
    snapshotAluno.current = snapshot;
    setTreinos(atuais => [...atuais.filter(p => p.id !== snapshot.plan.id), snapshot.plan].sort((a, b) => a.name.localeCompare(b.name)));
    setTreinoSelecionado(snapshot.plan);
    setExercicios(snapshot.exercises);
    setMaioresCargas(Object.fromEntries(snapshot.exercises.map(ex => [ex.id, Math.max(0, ...ex.loads.map(c => Number(c.weight_kg)))])));
  }

  async function alterarTreinoAluno(acao: string, dados: Record<string, unknown>, planoId?: string): Promise<boolean> {
    if (!apiAluno || operacaoAluno.current) return false;
    leituraAluno.current += 1;
    operacaoAluno.current = true; setSalvando(true); setErroAluno("");
    try {
      let atual = snapshotAluno.current;
      if (planoId && atual?.plan.id !== planoId) atual = await apiAluno.ler(planoId);
      const resultado = await apiAluno.alterar(acao, { ...dados, ...(planoId ? { plan_id: planoId, version: atual?.version } : {}) });
      if (resultado.snapshot) aplicarSnapshotAluno(resultado.snapshot);
      else {
        snapshotAluno.current = null;
        setTreinos(atuais => atuais.filter(p => p.id !== resultado.plan_id));
        selecionarTreino(null);
      }
      return true;
    } catch (erro) {
      mostrarMensagem("Não foi possível salvar", erro instanceof Error ? erro.message : "Confira a conexão e tente novamente.");
      return false;
    } finally { operacaoAluno.current = false; setSalvando(false); setCarregandoExercicios(false); }
  }

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
        scroll.getNativeScrollRef()?.measureInWindow((_sx: number, yScroll: number) => {
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

  useEffect(() => {
    if (!focado || apiAluno) return;
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
  }, [focado, recarregar, apiAluno]);

  useEffect(() => {
    if (!focado || !apiAluno || !aluno) return;
    let ativo = true;
    void apiAluno.listar().then(resultado => {
      if (!ativo) return;
      setUsuarioId(aluno.alunoId); setTreinos(resultado.plans); setErroAluno("");
    }).catch(erro => {
      if (ativo) { setTreinos([]); setExercicios([]); setErroAluno(erro instanceof Error ? erro.message : "Não foi possível consultar os treinos."); }
    }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [focado, apiAluno, aluno, recarregar]);

  useEffect(() => {
    if (!focado || !apiAluno || !treinoSelecionado) return;
    const id = treinoSelecionado.id;
    let ativo = true;
    const pedido = ++leituraAluno.current;
    setCarregandoExercicios(true);
    void apiAluno.ler(id).then(async snapshot => {
      if (!ativo || pedido !== leituraAluno.current) return;
      setErroAluno("");
      snapshotAluno.current = snapshot;
      setExercicios(snapshot.exercises);
      setMaioresCargas(Object.fromEntries(snapshot.exercises.map(ex => [ex.id, Math.max(0, ...ex.loads.map(c => Number(c.weight_kg)))])));
      const fotos = await obterFotosAssinadas("exercise-photos", snapshot.exercises.map(ex => ex.photo_path), 60, aluno?.usuarioId ?? "");
      if (ativo && pedido === leituraAluno.current) setExercicios(snapshot.exercises.map(ex => ({ ...ex, photo_url: ex.photo_path ? fotos.get(ex.photo_path) : null })));
    }).catch(erro => {
      if (ativo && pedido === leituraAluno.current) { setExercicios([]); snapshotAluno.current = null; setErroAluno(erro instanceof Error ? erro.message : "Não foi possível abrir o treino."); }
    }).finally(() => { if (ativo && pedido === leituraAluno.current) setCarregandoExercicios(false); });
    return () => { ativo = false; };
  }, [focado, apiAluno, treinoSelecionado, recarregar, aluno?.usuarioId]);

  useEffect(() => {
    if (!focado || apiAluno || !usuarioId || treinos.length === 0) return;
    const planosPendentes = treinos.filter((plano) =>
      !lerCacheParaExibicao<CacheExercicios>(
        usuarioId,
        `meus-treinos-exercicios:${plano.id}`,
      ),
    );
    if (planosPendentes.length === 0) return;
    const identificador = `${usuarioId}:${planosPendentes.map((plano) => plano.id).join(",")}`;
    const prefetchTreinos = prefetchTreinosRef.current;
    if (prefetchTreinos.has(identificador)) return;
    prefetchTreinos.add(identificador);
    const controlador = new AbortController();
    prefetchControllerRef.current = controlador;
    const revisaoPrefetch = obterRevisaoDeDados();

    void medir("meusTreinos.exerciciosPrefetch", () =>
      supabase
        .from("exercises")
        .select("id, plan_id, name, sets_goal, reps_goal, position, photo_path")
        .eq("user_id", usuarioId)
        .in("plan_id", planosPendentes.map((plano) => plano.id))
        .order("position")
        .abortSignal(controlador.signal),
    ).then((resposta) => {
      if (
        controlador.signal.aborted ||
        resposta.error ||
        revisaoPrefetch !== obterRevisaoDeDados()
      ) return;
      const porTreino = new Map<string, Exercicio[]>();
      for (const exercicio of (resposta.data ?? []) as Exercicio[]) {
        const lista = porTreino.get(exercicio.plan_id) ?? [];
        lista.push(exercicio);
        porTreino.set(exercicio.plan_id, lista);
      }
      for (const plano of planosPendentes) {
        const chaveExercicios = `meus-treinos-exercicios:${plano.id}`;
        if (lerCacheParaExibicao<CacheExercicios>(usuarioId, chaveExercicios))
          continue;
        salvarCache(usuarioId, chaveExercicios, {
          lista: porTreino.get(plano.id) ?? [],
          cargas: {},
          completo: false,
        }, 20000);
      }
    }).catch(() => {
      // O pré-carregamento é opcional; a consulta do treino continua disponível.
    });

    return () => {
      controlador.abort();
      if (prefetchControllerRef.current === controlador)
        prefetchControllerRef.current = null;
      prefetchTreinos.delete(identificador);
    };
  }, [focado, treinos, usuarioId, apiAluno]);

  useEffect(() => {
    if (!focado || apiAluno || !treinoSelecionado?.id) return;
    return assinarMudancasDeDados((planId, origem) => {
      if (origem === "foto" && planId === treinoSelecionado.id)
        setRevisaoFotos((valor) => valor + 1);
    });
  }, [focado, apiAluno, treinoSelecionado?.id]);

  useEffect(() => {
    if (!focado || apiAluno) return;
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
        if (anterior.completo !== false) return;
      }
      if (!exibicao && !anterior) setCarregandoExercicios(true);
      let revisaoInicial = obterRevisaoDeDados();
      try {
        const listaPrefetch = anterior?.completo === false
          ? anterior.lista
          : undefined;
        let listaBase: Exercicio[];
        if (listaPrefetch !== undefined) {
          listaBase = listaPrefetch;
        } else {
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
          listaBase = (data ?? []) as Exercicio[];
        }
        if (!ativo || controlador.signal.aborted) return;
        // A lista principal não espera fotos nem sincronização das cargas.
        setExercicios(listaBase);
        setCarregandoExercicios(false);
        if (listaBase.length === 0) {
          salvarCache(usuarioId, chave, { lista: [], cargas: {}, completo: true }, 20000);
          return;
        }
        const carregarReferencias = () => medir("meusTreinos.cargasReferencia", async () => {
          const referencias = [];
          const tamanho = 500;
          for (let inicio = 0; ; inicio += tamanho) {
            const { data, error } = await supabase.from("exercise_load_defaults")
              .select("exercise_id, set_number, reps, weight_kg")
              .eq("user_id", usuarioId).in("exercise_id", listaBase.map((e) => e.id))
              .order("exercise_id").order("set_number").range(inicio, inicio + tamanho - 1)
              .abortSignal(controlador.signal);
            if (error) throw error;
            referencias.push(...(data ?? []));
            if ((data?.length ?? 0) < tamanho) return referencias;
          }
        });
        const [urlsFotos, cargasSalvas] = await Promise.all([
          medir("meusTreinos.fotos", () => obterFotosAssinadas(
            "exercise-photos", listaBase.map((e) => e.photo_path), 604800, usuarioId,
          )),
          carregarReferencias(),
        ]);
        if (!ativo || controlador.signal.aborted) return;
        const listaComFotos = listaBase.map((e) => ({
          ...e, photo_url: e.photo_path ? (urlsFotos.get(e.photo_path) ?? null) : null,
        }));
        setExercicios(listaComFotos);
        let referencias = cargasSalvas;
        const comReferencia = new Set(referencias.map((c) => c.exercise_id));
        const semReferencia = listaBase.filter((e) => !comReferencia.has(e.id)).map((e) => e.id);
        // Só consulta o histórico de planos legados com referências ausentes.
        const ultimaSessao = semReferencia.length ? await medir("meusTreinos.ultimaSessao", async () => {
          const { data, error } = await supabase.from("workout_sessions").select("id")
            .eq("plan_id", treinoId).eq("user_id", usuarioId).eq("status", "concluido")
            .not("finished_at", "is", null).order("finished_at", { ascending: false })
            .limit(1).abortSignal(controlador.signal).maybeSingle();
          if (error) throw error;
          return data;
        }) : null;
        if (!ativo || controlador.signal.aborted) return;
        if (ultimaSessao) {
          const { data: seriesHistoricas, error: erroSeriesHistoricas } =
            await medir("meusTreinos.historicoCargas", () => supabase
              .from("workout_sets")
              .select("exercise_id, set_number, reps, weight_kg")
              .eq("session_id", ultimaSessao.id)
              .eq("user_id", usuarioId)
              .in("exercise_id", semReferencia)
              .gt("set_number", 0)
              .gt("reps", 0)
              .gte("weight_kg", 0)
              .lte("weight_kg", 2000)
              .order("set_number", { ascending: true })
              .abortSignal(controlador.signal));
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
            if (!serie.exercise_id || comReferencia.has(serie.exercise_id)) continue;
            const lista = exerciciosHistoricos.get(serie.exercise_id) ?? [];
            lista.push({
              reps: Number(serie.reps),
              weight_kg: Number(serie.weight_kg),
            });
            exerciciosHistoricos.set(serie.exercise_id, lista);
          }
          const referenciasHistoricas = [...exerciciosHistoricos].flatMap(
            ([exerciseId, series]) => series.map((serie, indice) => ({
              user_id: usuarioId,
              exercise_id: exerciseId,
              set_number: indice + 1,
              reps: serie.reps,
              weight_kg: serie.weight_kg,
              updated_at: new Date().toISOString(),
            })),
          );
          if (referenciasHistoricas.length > 0) {
            const { error: erroSalvar } = await medir(
              "meusTreinos.sincronizarCargas",
              () => supabase
                .from("exercise_load_defaults")
                .upsert(referenciasHistoricas, {
                  ignoreDuplicates: true,
                  onConflict: "user_id,exercise_id,set_number",
                })
                .abortSignal(controlador.signal),
            );
            if (!ativo || controlador.signal.aborted) return;
            if (erroSalvar) {
              mostrarMensagem("Erro ao sincronizar cargas", erroSalvar.message);
              return;
            }

          }
          if (referenciasHistoricas.length) {
            registrarMudancaDeDados(treinoId, "plano");
            revisaoInicial = obterRevisaoDeDados();
            referencias = await carregarReferencias();
          }
        }
        if (!ativo || controlador.signal.aborted) return;
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
        salvarCache(usuarioId, chave, { lista: listaComFotos, cargas, completo: true }, 20000);
        setExercicios(listaComFotos);
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
  }, [focado, treinoSelecionado, usuarioId, apiAluno, recarregar, revisaoFotos]);

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

    if (apiAluno) {
      if (await alterarTreinoAluno("create_plan", { name: nome })) { setNomeNovoTreino(""); setMostrarFormularioExercicio(false); }
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

  async function salvarNomeTreino() {
    if (!treinoRenomeando || renomeandoRef.current) return;
    if (apiAluno) {
      if (await alterarTreinoAluno("rename_plan", { name: novoNome.trim() }, treinoRenomeando.id)) setTreinoRenomeando(null);
      return;
    }
    renomeandoRef.current = true;
    setSalvando(true);
    try {
      const atualizado = await renomearTreino(usuarioId, treinoRenomeando.id, novoNome);
      setTreinos(atuais => atuais.map(t => t.id === atualizado.id ? atualizado : t).sort((a, b) => a.name.localeCompare(b.name)));
      setTreinoSelecionado(atual => atual?.id === atualizado.id ? atualizado : atual);
      setTreinoRenomeando(null);
      mostrarMensagem("Nome atualizado", "O treino foi renomeado. Seus exercícios, cargas e registros foram mantidos.");
    } catch (erro) {
      mostrarMensagem("Não foi possível renomear", erro instanceof Error ? erro.message : "Confira a conexão e tente novamente.");
    } finally { renomeandoRef.current = false; setSalvando(false); }
  }

  async function excluirTreino(treino: Treino) {
    const confirmado = await confirmarExclusao(
      "Excluir treino inteiro?",
      `Tem certeza de que deseja excluir o treino "${treino.name}" inteiro? Todos os exercícios cadastrados nele também serão excluídos. O histórico de cargas será preservado, mas ficará sem vínculo com esse treino.`,
    );

    if (!confirmado) return;

    if (apiAluno) {
      if (await alterarTreinoAluno("delete_plan", {}, treino.id)) {
        setMostrarFormularioExercicio(false); setExercicioEditando(null); setExercicioParaCarga(null);
      }
      return;
    }
    setSalvando(true);

    try {
      const { error } = await supabase.rpc("tf_delete_own_workout_plan", { p_plan_id: treino.id });
      if (error) {
        mostrarMensagem("Erro ao excluir treino", mensagemOperacaoTreino(error));
        return;
      }

      registrarMudancaDeDados(treino.id);
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

    if (apiAluno) {
      if (await alterarTreinoAluno("create_exercise", { name: nome, sets_goal: series, reps_goal: reps }, treinoSelecionado.id)) {
        setNomeExercicio(""); setQuantidadeSeries("3"); setRepeticoes("8-12");
      }
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

      registrarMudancaDeDados(treinoSelecionado.id);
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
    if (apiAluno) {
      await alterarTreinoAluno("move_exercise", { exercise_id: movido.id, other_id: vizinho.id }, treino.id);
      return;
    }
    const posicaoMovido = movido.position;
    const posicaoVizinho = vizinho.position;
    reordenandoRef.current = true;
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("tf_move_own_exercise", {
        p_plan_id: treino.id,
        p_exercise_id: movido.id,
        p_other_id: vizinho.id,
        p_position: posicaoMovido,
        p_other_position: posicaoVizinho,
      });
      if (error) throw error;
      setExercicios(
        ordem.map((exercicio) =>
          exercicio.id === movido.id
            ? { ...exercicio, position: posicaoVizinho }
            : exercicio.id === vizinho.id
              ? { ...exercicio, position: posicaoMovido }
              : exercicio,
        ),
      );
      registrarMudancaDeDados(treino.id);
    } catch (erro) {
      mostrarMensagem("Não foi possível mudar a ordem", mensagemOperacaoTreino(erro));
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

    if (apiAluno) {
      if (await alterarTreinoAluno("update_exercise", { exercise_id: exercicioEditando.id, name: nome, sets_goal: series, reps_goal: reps }, exercicioEditando.plan_id)) cancelarEdicao();
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

      registrarMudancaDeDados(exercicioEditando.plan_id);
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

    if (apiAluno) {
      if (await alterarTreinoAluno("delete_exercise", { exercise_id: exercicio.id }, exercicio.plan_id)) {
        if (exercicioEditando?.id === exercicio.id) setExercicioEditando(null);
        if (exercicioParaCarga?.id === exercicio.id) setExercicioParaCarga(null);
      }
      return;
    }
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

      registrarMudancaDeDados(exercicio.plan_id);
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
      if (apiAluno) {
        const snapshot = await apiAluno.ler(exercicio.plan_id);
        if (pedidoId !== cargasRequestIdRef.current) return;
        snapshotAluno.current = snapshot;
        const atual = snapshot.exercises.find(e => e.id === exercicio.id);
        if (!atual) throw new Error("Exercício não encontrado.");
        setSeriesCarga(Array.from({ length: Math.max(atual.sets_goal, atual.loads.length, 1) }, (_, indice) => {
          const salva = atual.loads.find(c => c.set_number === indice + 1);
          return { repeticoes: salva ? String(salva.reps) : atual.reps_goal.match(/\d+/)?.[0] ?? "8", carga: salva ? String(salva.weight_kg) : "" };
        }));
        return;
      }
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

    if (apiAluno) {
      if (await alterarTreinoAluno("save_loads", { exercise_id: exercicioParaCarga.id, loads: seriesValidadas }, treinoSelecionado.id)) {
        cancelarCargas(); mostrarMensagem("Cargas salvas", "As cargas de referência foram atualizadas. O histórico realizado foi mantido.");
      }
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

      registrarMudancaDeDados(treinoSelecionado.id);
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

  const botaoAtualizarTreinos = (
    <TouchableOpacity
      accessibilityRole="button"
      style={{ alignSelf: "flex-start", paddingVertical: 14 }}
      onPress={() => {
        registrarMudancaDeDados(treinoSelecionado?.id);
        setRecarregar((valor) => valor + 1);
      }}
    >
      <Text style={estilos.textoCancelarFormulario}>Atualizar meus treinos</Text>
    </TouchableOpacity>
  );

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
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar} disabled={salvando || Boolean(fotoCarregandoId)}>
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>{aluno ? `Treinos de ${aluno.nomeAluno}` : "Meus treinos"}</Text>
        <Text style={estilos.subtitulo}>
          Crie quantos treinos quiser e acompanhe suas cargas.
        </Text>

        {!!usuarioId && !aluno && <Acompanhamento usuarioId={usuarioId} corTema={corTema} onFechar={() => {
          registrarMudancaDeDados(); setRecarregar(valor => valor + 1);
        }} />}
        {!treinoSelecionado ? botaoAtualizarTreinos : null}

        {!!erroAluno && <Text accessibilityRole="alert" style={estilos.textoSecundario}>{erroAluno}</Text>}
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
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editar nome do treino ${treino.name}`}
                      style={estilos.botaoAdicionarTreino} disabled={salvando}
                      onPress={() => { setTreinoRenomeando(treino); setNovoNome(treino.name); }}>
                      <Text style={estilos.textoBotaoAdicionarTreino}>Editar nome</Text>
                    </TouchableOpacity>
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
              {!aluno && <OrientacoesTreinador usuarioId={usuarioId} planId={treinoSelecionado.id} cor={corTema} />}
              {exercicios.length > 0 && onIniciarTreino && !aluno &&
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
                    onPress={() => onIniciarTreino?.(treinoSelecionado)}
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
                {!mostrarFormularioExercicio && !exercicioEditando && !exercicioParaCarga ? botaoAtualizarTreinos : null}
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
                            accessibilityLabel="Editar nome do exercício"
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
                                accessibilityLabel="Editar quantidade de séries"
                                onChangeText={setSeriesEdicao}
                                keyboardType="number-pad"
                              />
                            </View>
                            <View style={estilos.campoGrande}>
                              <Text style={estilos.rotulo}>Repetições</Text>
                              <TextInput
                                style={estilos.input}
                                value={repeticoesEdicao}
                                accessibilityLabel="Editar repetições"
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
                                  accessibilityLabel={`Repetições da série ${serieIndice + 1}`}
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
                                  accessibilityLabel={`Carga da série ${serieIndice + 1}`}
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
      <Modal transparent animationType="fade" visible={Boolean(treinoRenomeando)}
        onRequestClose={() => { if (!renomeandoRef.current) setTreinoRenomeando(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: "#000D", justifyContent: "center", padding: 22 }}>
          <View style={estilos.formulario}>
            <Text style={estilos.tituloSecao}>Editar nome do treino</Text>
            <TextInput accessibilityLabel="Novo nome do treino" style={estilos.input} value={novoNome}
              onChangeText={setNovoNome} maxLength={100} autoFocus editable={!salvando}
              onSubmitEditing={() => void salvarNomeTreino()} />
            <TouchableOpacity accessibilityRole="button" style={estilos.botaoAdicionar} disabled={salvando}
              onPress={() => void salvarNomeTreino()}>
              <Text style={estilos.textoBotaoAdicionar}>{salvando ? "Salvando…" : "Salvar nome"}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={{ padding: 14 }} disabled={salvando} onPress={() => setTreinoRenomeando(null)}>
              <Text style={estilos.textoCancelarFormulario}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ModalFotoExercicio
        origemFotoAberta={origemFotoAberta}
        fotoCarregandoId={fotoCarregandoId}
        corTema={corTema}
        escolherFonteFoto={escolherFonteFoto}
        onExcluir={apiAluno ? undefined : confirmarExclusaoFoto}
        onFechar={() => setOrigemFotoAberta(null)}
      />
    </View>
  );
}
