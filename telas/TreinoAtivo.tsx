import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsFocused } from "@react-navigation/native";

import {
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Alert } from "../servicos/alerta";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import {
  apagarRascunho,
  gravarRascunho,
  lerRascunho,
  mesclarSeries,
  novoIdSerie,
  copiarSeriesAnteriores,
  mesmaOperacao,
  assinarRascunhos,
  sessaoFoiEncerrada,
  guardarConclusao,
  listarCopiasTreino,
  excluirCopiaTreino,
  novaSessaoDaCopia,
  type CopiaTreino,
  type DescansoTreino,
  type FinalizacaoTreino,
  type SerieRascunho,
  type EsforcoPercebido,
  type TreinoRascunho,
  type PlanoExercicio,
} from "../servicos/treinoLocal";
import {
  metricasRegistroTreino,
  lerPerfilTreino,
  type PerfilCalculoTreino,
  type IntensidadeTreino,
  type SerieCalculoTreino,
} from "../servicos/caloriasTreino";

import {
  CronometroTreino,
  PainelDescanso,
  OPCOES_DESCANSO,
} from "../componentes/ContadoresTreino";
import { CartaoExercicioTreino } from "../componentes/CartaoExercicioTreino";
import {
  comFilaTreinoPausada,
  liberarTreinosEncerrados,
  recuperarConclusaoRemota,
  reenviarConclusaoLocal,
  sincronizarRascunho,
} from "../servicos/treinoSincronizacao";
import {
  carregarUltimasSeries,
  type UltimoExercicio,
} from "../servicos/ultimasSeriesTreino";
import EditorExercicioSessao, {
  type DadosEditorExercicio,
} from "../componentes/EditorExercicioSessao";
import ResumoRegistroTreino from "../componentes/ResumoRegistroTreino";
import ProgressoFinalizacao from "../componentes/ProgressoFinalizacao";
import { estimarTempoFinalizacao } from "../servicos/tempoFinalizacao";
import {
  criarExercicioSessao,
  acrescentarSerie,
  retirarSerie,
  prepararModeloTreino,
} from "../servicos/treinoAdaptavel";
import { useVoltarDoModal } from "../servicos/voltarModal";

const CHAVE_PREFERENCIA_DESCANSO = "@treino-familia:descanso-segundos:v1";

type PerfilTreino = PerfilCalculoTreino;

type Props = {
  route: { params: { planId: string; planName: string } };
  onVoltar: () => void;
  corTema?: string;
};
type ExercicioBase = PlanoExercicio;
type SerieAtiva = SerieRascunho;
type SessaoAtiva = { id: string; plan_id: string; started_at: string };
type RegistroSalvo = {
  id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
};

function avisar(titulo: string, mensagem: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${titulo}\n\n${mensagem}`);
    return;
  }
  Alert.alert(titulo, mensagem);
}

function confirmar(titulo: string, mensagem: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  }
  return new Promise((resolver) => {
    Alert.alert(titulo, mensagem, [
      {
        text: "Cancelar",
        style: "cancel",
        onPress: () => resolver(false),
      },
      { text: "Confirmar", onPress: () => resolver(true) },
    ]);
  });
}

export default function TreinoAtivo({
  route,
  onVoltar,
  corTema = "#35D07F",
}: Props) {
  const { planId, planName } = route.params;
  const estaEmFoco = useIsFocused();
  const [usuarioId, setUsuarioId] = useState("");
  const [perfil, setPerfil] = useState<PerfilTreino | null>(null);
  const [exercicios, setExercicios] = useState<ExercicioBase[]>([]);
  const [series, setSeries] = useState<SerieAtiva[]>([]);
  const [sessao, setSessao] = useState<SessaoAtiva | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [chaveEmSalvamento, setChaveEmSalvamento] = useState<string | null>(
    null,
  );
  const [intensidade, setIntensidade] = useState<IntensidadeTreino>("moderada");
  const [descanso, setDescanso] = useState<DescansoTreino>({
    fimEm: null,
    pausado: false,
    segundosPausados: 0,
    duracao: 90,
  });
  const [finalizacao, setFinalizacao] = useState<
    FinalizacaoTreino | undefined
  >();
  const [ultimasSeries, setUltimasSeries] = useState<
    Record<string, UltimoExercicio>
  >({});
  const [erroReferencia, setErroReferencia] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [outroTreinoAtivo, setOutroTreinoAtivo] = useState(false);
  const [esforco, setEsforco] = useState<EsforcoPercebido>("nao_informado");
  const [restaurado, setRestaurado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [recuperacaoEmCurso, setRecuperacaoEmCurso] = useState<
    "remota" | "local"
  >();
  const [erroSincronizacao, setErroSincronizacao] = useState("");
  const [conflitoRemoto, setConflitoRemoto] = useState(false);
  const [conflitoSessao, setConflitoSessao] = useState(false);
  const [copias, setCopias] = useState<
    Awaited<ReturnType<typeof listarCopiasTreino>>
  >([]);
  const [mostrarCopias, setMostrarCopias] = useState(false);
  const [bloqueioSessao, setBloqueioSessao] = useState(false);
  const [online, setOnline] = useState(true);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [revisaoFim, setRevisaoFim] = useState<string | null>(null);
  const [duracaoFinal, setDuracaoFinal] = useState("");
  const [destinoModelo, setDestinoModelo] = useState<
    "sessao" | "novo" | "adicionar"
  >("sessao");
  const [nomeNovoPlano, setNomeNovoPlano] = useState("");
  const [erroConclusao, setErroConclusao] = useState("");
  const [inicioFinalizacao, setInicioFinalizacao] = useState<number | null>(
    null,
  );
  const [estimativaFinalizacao, setEstimativaFinalizacao] = useState<
    number | null
  >(null);
  const [encerramentoConfirmado, setEncerramentoConfirmado] = useState<
    string | null
  >(null);
  const navegacaoEncerradaRef = useRef<string | null>(null);
  const criacaoPendenteRef = useRef(false);
  const novaSessaoAtivaRef = useRef(false);
  useEffect(() => {
    let ativo = true;
    if (usuarioId)
      void estimarTempoFinalizacao(usuarioId).then((valor) => {
        if (ativo) setEstimativaFinalizacao(valor);
      });
    return () => {
      ativo = false;
    };
  }, [usuarioId]);
  useVoltarDoModal(editorId !== null, () => setEditorId(null));
  useVoltarDoModal(revisaoFim !== null, () => {
    if (!salvando) setRevisaoFim(null);
  });
  useVoltarDoModal(mostrarCopias, () => setMostrarCopias(false));
  const prontoRef = useRef(false);
  const sincronizandoRef = useRef(false);
  const seriesRef = useRef(series);
  const sessaoRef = useRef(sessao);
  const exerciciosRef = useRef(exercicios);
  const usuarioRef = useRef(usuarioId);
  const intensidadeRef = useRef(intensidade);
  const esforcoRef = useRef(esforco);
  const descansoRef = useRef(descanso);
  const finalizacaoRef = useRef(finalizacao);
  const bloqueioRef = useRef(false);
  const salvandoRef = useRef(false);
  const chaveSalvandoRef = useRef<string | null>(null);
  descansoRef.current = descanso;
  finalizacaoRef.current = finalizacao;
  bloqueioRef.current = bloqueioSessao;
  salvandoRef.current = salvando;
  chaveSalvandoRef.current = chaveEmSalvamento;
  seriesRef.current = series;
  sessaoRef.current = sessao;
  exerciciosRef.current = exercicios;
  usuarioRef.current = usuarioId;
  intensidadeRef.current = intensidade;
  esforcoRef.current = esforco;

  const retirarSessaoDaTela = useCallback((sessaoId: string) => {
    if (sessaoRef.current?.id !== sessaoId) return;
    prontoRef.current = false;
    sessaoRef.current = null;
    finalizacaoRef.current = undefined;
    setSessao(null);
    setFinalizacao(undefined);
    setRestaurado(false);
    setEditorId(null);
    setRevisaoFim(null);
    setMostrarCopias(false);
    setConflitoRemoto(false);
    setConflitoSessao(false);
    setErroSincronizacao("");
    setDescanso((atual) => ({
      ...atual,
      fimEm: null,
      pausado: false,
      segundosPausados: 0,
    }));
    setMensagem(
      "Treino concluído no servidor. Detalhes pendentes continuam protegidos no aparelho.",
    );
    setEncerramentoConfirmado(sessaoId);
  }, []);

  // Fecha modais primeiro. Navega só se esta ainda for a tela que o usuário usa.
  // Respostas atrasadas de uma tela oculta nunca devem fazê-lo voltar de outra tela.
  useEffect(() => {
    if (
      !encerramentoConfirmado ||
      navegacaoEncerradaRef.current === encerramentoConfirmado
    )
      return;
    navegacaoEncerradaRef.current = encerramentoConfirmado;
    if (estaEmFoco) onVoltar();
  }, [encerramentoConfirmado, estaEmFoco, onVoltar]);

  useEffect(() => {
    let ativo = true;
    const conferir = async () => {
      const atual = sessaoRef.current,
        id = usuarioRef.current;
      if (!atual || !id || !prontoRef.current) return;
      try {
        const local = await lerRascunho(id, planId);
        const encerrada =
          local?.sessao.id === atual.id
            ? Boolean(local.encerradaNoServidor || local.exclusaoSolicitada) ||
              (await sessaoFoiEncerrada(id, atual.id))
            : await sessaoFoiEncerrada(id, atual.id);
        if (ativo && encerrada) retirarSessaoDaTela(atual.id);
      } catch {
        /* Falha de leitura não é prova de conclusão. */
      }
    };
    const aoMudar = () => {
      void conferir();
    };
    const cancelar = assinarRascunhos(aoMudar);
    aoMudar(); // Também cobre confirmação ocorrida durante o carregamento da tela.
    if (typeof window !== "undefined")
      window.addEventListener("storage", aoMudar);
    return () => {
      ativo = false;
      cancelar();
      if (typeof window !== "undefined")
        window.removeEventListener("storage", aoMudar);
    };
  }, [planId, retirarSessaoDaTela, sessao?.id]);

  const montarRascunho = useCallback(
    (novasSeries?: SerieAtiva[]): TreinoRascunho | null => {
      const sessaoAtual = sessaoRef.current;
      if (
        !prontoRef.current ||
        !sessaoAtual ||
        sessaoAtual.plan_id !== planId ||
        !usuarioRef.current
      )
        return null;
      return {
        versao: 1,
        usuarioId: usuarioRef.current,
        planId,
        planName,
        sessao: sessaoAtual,
        exercicios: exerciciosRef.current,
        series: novasSeries ?? seriesRef.current,
        intensidade: intensidadeRef.current,
        esforco: esforcoRef.current,
        descanso: descansoRef.current,
        finalizacao: finalizacaoRef.current,
        criacaoPendente: criacaoPendenteRef.current,
        novaSessaoAtiva: novaSessaoAtivaRef.current,
        salvoEm: new Date().toISOString(),
      };
    },
    [planId, planName],
  );

  const salvarLocal = useCallback(
    async (novasSeries?: SerieAtiva[]) => {
      const rascunho = montarRascunho(novasSeries);
      if (rascunho) await gravarRascunho(rascunho);
    },
    [montarRascunho],
  );

  const sincronizar = useCallback(
    async (permitirSobrescrever = false, recuperar?: "remota" | "local") => {
      if (sincronizandoRef.current || bloqueioRef.current || !prontoRef.current)
        return;
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false
      ) {
        setOnline(false);
        return;
      }
      const id = usuarioRef.current;
      const atual = sessaoRef.current;
      if (!id || !atual || atual.plan_id !== planId) return;
      sincronizandoRef.current = true;
      setSincronizando(true);
      setRecuperacaoEmCurso(recuperar);
      const antes = seriesRef.current;
      try {
        const resultado =
          recuperar === "local"
            ? await reenviarConclusaoLocal(id, planId)
            : recuperar === "remota"
              ? await recuperarConclusaoRemota(id, planId)
              : await sincronizarRascunho(id, planId, permitirSobrescrever);
        if (resultado.adiado) return;
        if (
          resultado.encerrado ||
          (resultado.concluido && !resultado.rascunho)
        ) {
          retirarSessaoDaTela(atual.id);
          return;
        }
        if (sessaoRef.current?.id !== atual.id) return;
        if (resultado.rascunho?.sessao.id === atual.id) {
          const porChave = new Map(
            resultado.rascunho.series.map((serie) => [serie.chave, serie]),
          );
          const antesPorChave = new Map(
            antes.map((serie) => [serie.chave, serie]),
          );
          const atualizadas = seriesRef.current.map((serie) => {
            const original = antesPorChave.get(serie.chave);
            const remota = porChave.get(serie.chave);
            return original && remota && mesmaOperacao(serie, original)
              ? remota
              : serie;
          });
          seriesRef.current = atualizadas;
          setSeries(atualizadas);
        }
        setConflitoRemoto(Boolean(resultado.conflito));
        setErroSincronizacao(resultado.erro ?? "");
        setConflitoSessao(Boolean(resultado.conflitoSessao));
        if (recuperar)
          void listarCopiasTreino(id, planId)
            .then(setCopias)
            .catch(() => {});
        if (!resultado.erro) {
          setOnline(true);
          setMensagem("Treino sincronizado.");
        }
      } catch {
        setErroSincronizacao(
          "Não foi possível sincronizar. Seus dados continuam guardados neste aparelho.",
        );
      } finally {
        sincronizandoRef.current = false;
        setSincronizando(false);
        setRecuperacaoEmCurso(undefined);
      }
    },
    [planId, retirarSessaoDaTela],
  );

  // Grava também mudanças de carga/repetições ainda não concluídas.
  useEffect(() => {
    if (!prontoRef.current || !sessao) return;
    salvarLocal().catch(() =>
      setErroSincronizacao(
        "Não foi possível salvar o rascunho no aparelho. Verifique o armazenamento.",
      ),
    );
  }, [
    series,
    sessao,
    exercicios,
    intensidade,
    esforco,
    descanso,
    finalizacao,
    salvarLocal,
  ]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const aoVoltar = () => {
      setOnline(navigator.onLine !== false);
      if (navigator.onLine !== false) void sincronizar();
    };
    setOnline(navigator.onLine !== false);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("offline", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("offline", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [sincronizar]);
  const operacoesPendentes = useMemo(
    () =>
      JSON.stringify({
        series: series
          .filter((serie) => serie.pendente)
          .map(
            ({ chave, pendente, registroId, reps, weight_kg, concluida }) => ({
              chave,
              pendente,
              registroId,
              reps,
              weight_kg,
              concluida,
            }),
          ),
        finalizacao: finalizacao?.finishedAt,
      }),
    [series, finalizacao],
  );
  useEffect(() => {
    if (!sessao) return;
    // Persist before sending. A failed attempt with unchanged operations must not
    // immediately trigger another render/send loop.
    void salvarLocal()
      .then(() => sincronizar())
      .catch(() =>
        setErroSincronizacao(
          "Não foi possível proteger as alterações neste aparelho.",
        ),
      );
  }, [sessao, operacoesPendentes, salvarLocal, sincronizar, finalizacao]);
  useEffect(() => {
    if (!sessao) return;
    const intervalo = setInterval(() => {
      void sincronizar();
    }, 12000);
    return () => clearInterval(intervalo);
  }, [sessao, operacoesPendentes, finalizacao, sincronizar]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setMensagem("");
    try {
      // A sessão autenticada em cache permite recuperar o rascunho mesmo offline.
      const { data: sessaoCache } = await supabase.auth.getSession();
      const usuarioEmCache = sessaoCache.session?.user;
      if (!usuarioEmCache)
        throw new Error(
          "Entre novamente na sua conta para recuperar seu treino.",
        );
      const idUsuario = usuarioEmCache.id;
      let local = await lerRascunho(idUsuario, planId);
      criacaoPendenteRef.current = Boolean(local?.criacaoPendente);
      novaSessaoAtivaRef.current = Boolean(local?.novaSessaoAtiva);
      usuarioRef.current = idUsuario;
      const sessaoUsuario = { user: usuarioEmCache };
      setUsuarioId(idUsuario);
      setCopias(await listarCopiasTreino(idUsuario, planId));
      if (local?.encerradaNoServidor) {
        sessaoRef.current = null;
        finalizacaoRef.current = undefined;
        setSessao(null);
        setFinalizacao(undefined);
        setBloqueioSessao(false);
        local = null; // Continua carregando exercícios e cargas do plano.
        setMensagem(
          "Treino anterior concluído. Você pode iniciar outro ou usar uma cópia.",
        );
      }
      setPerfil(
        lerPerfilTreino(
          (sessaoUsuario.user.user_metadata ?? {}) as Record<string, unknown>,
        ),
      );

      if (
        local?.finalizacao ||
        (local?.criacaoPendente && local.novaSessaoAtiva)
      ) {
        setExercicios(local.exercicios);
        exerciciosRef.current = local.exercicios;
        setSeries(local.series);
        seriesRef.current = local.series;
        setSessao(local.sessao);
        sessaoRef.current = local.sessao;
        setIntensidade(local.intensidade);
        intensidadeRef.current = local.intensidade;
        setEsforco(local.esforco);
        esforcoRef.current = local.esforco;
        setFinalizacao(local.finalizacao);
        finalizacaoRef.current = local.finalizacao;
        if (local.descanso) {
          setDescanso(local.descanso);
          descansoRef.current = local.descanso;
        }
        setRestaurado(true);
        prontoRef.current = true;
        setErroSincronizacao(local.erroSincronizacao ?? "");
        setConflitoRemoto(Boolean(local.conflitoSincronizacao));
        setConflitoSessao(
          Boolean(local.finalizacao) && local.conflitoSessao !== false,
        );
        setMensagem(
          local.finalizacao
            ? "Treino encerrado neste aparelho. A conclusão aguarda confirmação do servidor."
            : "Novo treino recuperado do aparelho. A criação será enviada quando houver conexão.",
        );
        return;
      }
      const { data: listaExercicios, error: erroExercicios } = await supabase
        .from("exercises")
        .select("id, name, sets_goal, reps_goal")
        .eq("user_id", idUsuario)
        .eq("plan_id", planId)
        .order("position", { ascending: true });
      if (erroExercicios) throw erroExercicios;
      const base = (listaExercicios ?? []) as ExercicioBase[];
      if (base.length === 0) {
        if (local) {
          // Exercícios removidos remotamente: preservar o rascunho para conferência.
          setExercicios(local.exercicios);
          setSeries(local.series);
          setSessao(local.sessao);
          setIntensidade(local.intensidade);
          setEsforco(local.esforco ?? "nao_informado");
          if (local.descanso) {
            setDescanso(local.descanso);
            descansoRef.current = local.descanso;
          }
          setFinalizacao(local.finalizacao);
          finalizacaoRef.current = local.finalizacao;
          setRestaurado(true);
          setBloqueioSessao(true);
          setMensagem(
            "Os exercícios deste plano não estão mais disponíveis no servidor. Seu rascunho local foi preservado sem enviar alterações.",
          );
        } else {
          setExercicios([]);
          setSeries([]);
          setMensagem(
            "Este treino ainda não tem exercícios. Adicione exercícios em Meus treinos.",
          );
        }
        return;
      }

      const ids = base.map((exercicio) => exercicio.id);
      const { data: padroes, error: erroPadroes } = await supabase
        .from("exercise_load_defaults")
        .select("exercise_id, set_number, reps, weight_kg")
        .eq("user_id", idUsuario)
        .in("exercise_id", ids)
        .order("set_number", { ascending: true });
      if (erroPadroes) throw erroPadroes;

      const listas = base.flatMap((exercicio) => {
        const referencia = (padroes ?? []).filter(
          (item) => item.exercise_id === exercicio.id,
        );
        const quantidade = Math.min(
          20,
          Math.max(Number(exercicio.sets_goal) || 1, referencia.length, 1),
        );
        const repeticoesPadrao =
          String(exercicio.reps_goal || "8").match(/\d+/)?.[0] ?? "8";
        return Array.from({ length: quantidade }, (_, indice) => {
          const existente = referencia.find(
            (item) => Number(item.set_number) === indice + 1,
          );
          return {
            chave: `${exercicio.id}:${indice + 1}`,
            exercise_id: exercicio.id,
            exercise_name: exercicio.name,
            set_number: indice + 1,
            reps: existente ? String(existente.reps) : repeticoesPadrao,
            weight_kg: existente ? String(existente.weight_kg) : "0",
            concluida: false,
          } as SerieAtiva;
        });
      });
      setExercicios(base);
      exerciciosRef.current = base;

      const { data: sessoesAtivas, error: erroSessoesAtivas } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, started_at")
        .eq("user_id", idUsuario)
        .eq("status", "em_andamento")
        .order("started_at", { ascending: false })
        .limit(1);
      if (erroSessoesAtivas) throw erroSessoesAtivas;
      const ativa = sessoesAtivas?.[0] as SessaoAtiva | undefined;
      if (ativa && ativa.plan_id !== planId) {
        setOutroTreinoAtivo(true);
        setSessao(ativa);
        setSeries(listas);
        setMensagem(
          "Você já tem outro treino em andamento. Volte para Meus treinos e abra o treino que iniciou para continuar ou finalizá-lo.",
        );
        return;
      }

      setOutroTreinoAtivo(false);
      if (!ativa) {
        if (local && !local.series.some((item) => item.pendente)) {
          // Tudo já foi transmitido. A sessão remota terminou; limpar só o cache.
          await apagarRascunho(idUsuario, planId);
        } else if (local) {
          // Não reabre uma sessão encerrada no servidor. O rascunho fica intacto.
          setExercicios(local.exercicios);
          exerciciosRef.current = local.exercicios;
          setSeries(local.series);
          seriesRef.current = local.series;
          setSessao(local.sessao);
          sessaoRef.current = local.sessao;
          setIntensidade(local.intensidade);
          setEsforco(local.esforco ?? "nao_informado");
          if (local.descanso) {
            setDescanso(local.descanso);
            descansoRef.current = local.descanso;
          }
          setFinalizacao(local.finalizacao);
          finalizacaoRef.current = local.finalizacao;
          setRestaurado(true);
          setBloqueioSessao(true);
          setMensagem(
            "O servidor não mostra esta sessão como ativa. Seu rascunho está preservado, mas foi bloqueado para evitar misturar treinos. Confira o histórico.",
          );
          prontoRef.current = true;
          return;
        }
        setSessao(null);
        setSeries(listas);
        prontoRef.current = true;
        return;
      }

      if (
        local &&
        local.sessao.id !== ativa.id &&
        local.series.some((item) => item.pendente)
      ) {
        // Não trocar o cache da sessão antiga enquanto houver dados não enviados.
        setExercicios(local.exercicios);
        setSeries(local.series);
        setSessao(local.sessao);
        setIntensidade(local.intensidade);
        setEsforco(local.esforco ?? "nao_informado");
        if (local.descanso) {
          setDescanso(local.descanso);
          descansoRef.current = local.descanso;
        }
        setFinalizacao(local.finalizacao);
        finalizacaoRef.current = local.finalizacao;
        setRestaurado(true);
        setBloqueioSessao(true);
        setMensagem(
          "Outra sessão está ativa no Supabase e este aparelho possui alterações pendentes de uma sessão antiga. Os dados foram preservados para revisão.",
        );
        return;
      }
      setSessao(ativa);
      sessaoRef.current = ativa;
      const { data: salvas, error: erroSalvas } = await supabase
        .from("workout_sets")
        .select("id, exercise_id, exercise_name, set_number, reps, weight_kg")
        .eq("user_id", idUsuario)
        .eq("session_id", ativa.id)
        .order("set_number", { ascending: true });
      if (erroSalvas) throw erroSalvas;
      const registros = (salvas ?? []) as RegistroSalvo[];
      const mescladas = mesclarSeries(
        local?.sessao.id === ativa.id ? local.series : listas,
        registros,
        local?.sessao.id === ativa.id ? local : null,
      );
      setSeries(mescladas);
      seriesRef.current = mescladas;
      if (local?.sessao.id === ativa.id) {
        setExercicios(local.exercicios);
        exerciciosRef.current = local.exercicios;
        setIntensidade(local.intensidade);
        setEsforco(local.esforco ?? "nao_informado");
        if (local.descanso) {
          setDescanso(local.descanso);
          descansoRef.current = local.descanso;
        }
        setFinalizacao(local.finalizacao);
        finalizacaoRef.current = local.finalizacao;
        setRestaurado(true);
        setMensagem(
          "Treino recuperado. Seus ajustes e séries pendentes estão protegidos no aparelho.",
        );
      } else {
        setMensagem("Treino em andamento recuperado do Supabase.");
      }
      prontoRef.current = true;
    } catch (erro) {
      // Fallback offline: não substitui o servidor, apenas restaura a última cópia.
      try {
        const { data } = await supabase.auth.getSession();
        const id = data.session?.user.id;
        const local = id ? await lerRascunho(id, planId) : null;
        if (id && local) {
          if (local.encerradaNoServidor) {
            setUsuarioId(id);
            usuarioRef.current = id;
            prontoRef.current = false;
            setCopias(await listarCopiasTreino(id, planId));
            setMensagem(
              "Treino concluído no servidor. Os detalhes pendentes continuam neste aparelho.",
            );
            return;
          }
          criacaoPendenteRef.current = Boolean(local.criacaoPendente);
          novaSessaoAtivaRef.current = Boolean(local.novaSessaoAtiva);
          setUsuarioId(id);
          usuarioRef.current = id;
          setExercicios(local.exercicios);
          exerciciosRef.current = local.exercicios;
          setSeries(local.series);
          seriesRef.current = local.series;
          setSessao(local.sessao);
          sessaoRef.current = local.sessao;
          setIntensidade(local.intensidade);
          setEsforco(local.esforco ?? "nao_informado");
          if (local.descanso) {
            setDescanso(local.descanso);
            descansoRef.current = local.descanso;
          }
          setFinalizacao(local.finalizacao);
          finalizacaoRef.current = local.finalizacao;
          setRestaurado(true);
          prontoRef.current = true;
          setMensagem(
            "Treino recuperado do aparelho. Sem conexão, as séries ficarão pendentes até sincronizar.",
          );
        } else {
          prontoRef.current = false;
          setSessao(null);
          setSeries([]);
          setMensagem(
            erro instanceof Error
              ? erro.message
              : "Não foi possível carregar o treino.",
          );
        }
      } catch {
        setMensagem(
          "Não foi possível recuperar o treino. Verifique sua conexão e entre novamente.",
        );
      }
    } finally {
      setCarregando(false);
    }
  }, [planId]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    let ativo = true;
    AsyncStorage.getItem(CHAVE_PREFERENCIA_DESCANSO)
      .then((valor) => {
        const tempo = Number(valor);
        if (ativo && OPCOES_DESCANSO.some((opcao) => opcao === tempo)) {
          setDescanso((atual) => ({ ...atual, duracao: tempo }));
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  useEffect(() => {
    if (!usuarioId || !exercicios.length) return;
    let ativo = true;
    setErroReferencia("");
    carregarUltimasSeries(
      usuarioId,
      exercicios
        .filter((e) => !e.avulso && !e.removido)
        .map((exercicio) => exercicio.id),
    )
      .then((referencias) => {
        if (ativo) setUltimasSeries(referencias);
      })
      .catch(() => {
        if (ativo)
          setErroReferencia(
            "Não foi possível consultar a última sessão. Seus campos atuais continuam disponíveis.",
          );
      });
    return () => {
      ativo = false;
    };
  }, [usuarioId, exercicios]);
  const seriesPorExercicio = useMemo(() => {
    const grupos = new Map<string, SerieAtiva[]>();
    for (const serie of series) {
      if (serie.excluida) continue;
      const grupo = grupos.get(serie.exercise_id);
      if (grupo) grupo.push(serie);
      else grupos.set(serie.exercise_id, [serie]);
    }
    return grupos;
  }, [series]);

  const proximaSerie = useMemo(
    () => series.find((item) => !item.excluida && !item.concluida) ?? null,
    [series],
  );
  const totalSeriesConcluidas = useMemo(
    () => series.filter((item) => item.concluida).length,
    [series],
  );
  const totalSeriesVisiveis = series.filter((s) => !s.excluida).length;
  const progressoPercentual = totalSeriesVisiveis
    ? Math.round((totalSeriesConcluidas / totalSeriesVisiveis) * 100)
    : 0;
  const volumeTotal = useMemo(
    () =>
      series
        .filter((item) => item.concluida)
        .reduce(
          (total, item) =>
            total +
            Number(item.reps || 0) *
              Number((item.weight_kg || "0").replace(",", ".")),
          0,
        ),
    [series],
  );
  async function iniciarSessao(copia?: CopiaTreino) {
    if (!usuarioId || salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    try {
      await comFilaTreinoPausada(usuarioId, async () => {
        const { data: auth, error: erroAuth } = await supabase.auth.getUser();
        if (erroAuth || auth.user?.id !== usuarioId)
          throw new Error("Entre novamente na sua conta.");
        const { data: ativas, error: erroAtivas } = await supabase
          .from("workout_sessions")
          .select("id")
          .eq("user_id", usuarioId)
          .eq("status", "em_andamento")
          .limit(1);
        if (erroAtivas) throw erroAtivas;
        if (ativas?.length)
          throw new Error(
            "Conclua a sessão em andamento antes de iniciar outra.",
          );
        const { data: plano, error: erroPlano } = await supabase
          .from("workout_plans")
          .select("id")
          .eq("id", planId)
          .eq("user_id", usuarioId)
          .maybeSingle();
        if (erroPlano) throw erroPlano;
        if (!plano) throw new Error("O plano não foi encontrado na sua conta.");
        const agora = new Date().toISOString();
        const novo: TreinoRascunho = copia
          ? novaSessaoDaCopia(
              copia,
              usuarioId,
              planId,
              planName,
              exerciciosRef.current,
            )
          : {
              versao: 1,
              usuarioId,
              planId,
              planName,
              sessao: { id: novoIdSerie(), plan_id: planId, started_at: agora },
              exercicios: exerciciosRef.current.filter((e) => !e.removido),
              series: seriesRef.current
                .filter((s) => !s.excluida)
                .map((s) => ({
                  chave: s.chave,
                  exercise_id: s.exercise_id,
                  exercise_name: s.exercise_name,
                  set_number: s.set_number,
                  reps: s.reps,
                  weight_kg: s.weight_kg,
                  concluida: false,
                  avulsa: s.avulsa,
                })),
              intensidade: intensidadeRef.current,
              esforco: "nao_informado",
              salvoEm: agora,
              criacaoPendente: true,
              novaSessaoAtiva: true,
            };
        if (!novo.exercicios.length || !novo.series.length)
          throw new Error(
            "Adicione exercícios ao plano ou escolha uma cópia com exercícios.",
          );
        await liberarTreinosEncerrados(usuarioId);
        novo.descanso = {
          fimEm: null,
          pausado: false,
          segundosPausados: 0,
          duracao: descansoRef.current.duracao,
        };
        await gravarRascunho(novo); // Protege a nova sessão antes de enviar ao servidor.
        criacaoPendenteRef.current = true;
        novaSessaoAtivaRef.current = true;
        sessaoRef.current = novo.sessao;
        seriesRef.current = novo.series;
        exerciciosRef.current = novo.exercicios;
        intensidadeRef.current = novo.intensidade;
        esforcoRef.current = novo.esforco;
        descansoRef.current = novo.descanso;
        finalizacaoRef.current = undefined;
        bloqueioRef.current = false;
        setSessao(novo.sessao);
        setSeries(novo.series);
        setExercicios(novo.exercicios);
        setIntensidade(novo.intensidade);
        setEsforco(novo.esforco);
        setDescanso(novo.descanso);
        setFinalizacao(undefined);
        setRestaurado(false);
        setBloqueioSessao(false);
        setOutroTreinoAtivo(false);
        setConflitoRemoto(false);
        setConflitoSessao(false);
        setErroSincronizacao("");
        setErroConclusao("");
        setEncerramentoConfirmado(null);
        setMostrarCopias(false);
        setEditorId(null);
        setRevisaoFim(null);
        setInicioFinalizacao(null);
        setMensagem(
          copia
            ? "Cópia carregada em uma nova sessão. As séries estão abertas para você treinar."
            : "Novo treino iniciado. As sessões anteriores foram preservadas.",
        );
        prontoRef.current = true;
      });
      setCopias(await listarCopiasTreino(usuarioId, planId));
      void sincronizar();
    } catch (erro) {
      const detalhe =
        erro &&
        typeof erro === "object" &&
        "message" in erro &&
        typeof erro.message === "string"
          ? erro.message
          : "Confira a conexão e tente novamente.";
      setMensagem(`Não foi possível iniciar: ${detalhe}`);
      avisar("Não foi possível iniciar", detalhe);
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  async function apagarCopia(copia: CopiaTreino) {
    if (salvandoRef.current) return;
    if (
      !(await confirmar(
        "Excluir cópia local?",
        "Remove esta cópia e eventuais detalhes locais pendentes dessa sessão. O histórico salvo no Supabase não será apagado.",
      ))
    )
      return;
    salvandoRef.current = true;
    setSalvando(true);
    try {
      await comFilaTreinoPausada(usuarioId, () =>
        excluirCopiaTreino(usuarioId, planId, copia),
      );
      const restantes = await listarCopiasTreino(usuarioId, planId);
      setCopias(restantes);
      if (!restantes.length) setMostrarCopias(false);
      if (!sessaoRef.current) await carregar();
    } catch (erro) {
      avisar(
        "Não foi possível excluir",
        erro instanceof Error ? erro.message : "Tente novamente.",
      );
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  const atualizarCampo = useCallback(
    (chave: string, campo: "reps" | "weight_kg", valor: string) => {
      if (
        finalizacaoRef.current ||
        bloqueioRef.current ||
        salvandoRef.current ||
        chaveSalvandoRef.current
      )
        return;
      const atualizadas = seriesRef.current.map((item) =>
        item.chave === chave &&
        !item.excluida &&
        !item.concluida &&
        item.pendente !== "salvar"
          ? { ...item, [campo]: valor }
          : item,
      );
      seriesRef.current = atualizadas;
      setSeries(atualizadas);
    },
    [],
  );
  const alterarDescanso = useCallback((valor: DescansoTreino) => {
    if (finalizacaoRef.current) return;
    descansoRef.current = valor;
    setDescanso(valor);
  }, []);
  const mudarPreferenciaDescanso = useCallback(
    (valor: number) => {
      const atual = descansoRef.current;
      alterarDescanso({
        ...atual,
        duracao: valor,
        fimEm: atual.fimEm === null ? null : Date.now() + valor * 1000,
        segundosPausados: atual.pausado ? valor : 0,
      });
      AsyncStorage.setItem(CHAVE_PREFERENCIA_DESCANSO, String(valor)).catch(
        () => {},
      );
    },
    [alterarDescanso],
  );
  const iniciarDescanso = useCallback(() => {
    const atual = descansoRef.current;
    alterarDescanso({
      ...atual,
      fimEm: Date.now() + atual.duracao * 1000,
      pausado: false,
      segundosPausados: 0,
    });
  }, [alterarDescanso]);
  const copiarUltimaSessao = useCallback(
    (id: string) => {
      if (
        finalizacaoRef.current ||
        bloqueioRef.current ||
        salvandoRef.current ||
        chaveSalvandoRef.current ||
        sincronizandoRef.current
      )
        return;
      const anterior = ultimasSeries[id];
      if (!anterior) return;
      const atualizadas = copiarSeriesAnteriores(
        seriesRef.current,
        anterior.series,
        id,
      );
      seriesRef.current = atualizadas;
      setSeries(atualizadas);
      setMensagem(
        "Valores da última sessão copiados para as séries abertas deste rascunho. Confira antes de concluir.",
      );
    },
    [ultimasSeries],
  );

  const alternarSerie = useCallback(
    async (serie: SerieAtiva) => {
      if (
        serie.excluida ||
        finalizacaoRef.current ||
        salvandoRef.current ||
        chaveSalvandoRef.current
      )
        return;
      if (!sessaoRef.current || !usuarioRef.current || bloqueioRef.current) {
        avisar(
          "Treino indisponível",
          "Inicie o treino ou confira a situação da sessão antes de registrar séries.",
        );
        return;
      }
      if (sincronizandoRef.current) return;
      const reps = Number(serie.reps);
      const peso = Number(serie.weight_kg.replace(",", "."));
      if (
        !serie.concluida &&
        (!Number.isInteger(reps) ||
          reps < 1 ||
          reps > 1000 ||
          !Number.isFinite(peso) ||
          peso < 0 ||
          peso > 2000)
      ) {
        avisar(
          "Dados inválidos",
          "Informe repetições inteiras positivas e carga entre 0 e 2.000 kg.",
        );
        return;
      }
      chaveSalvandoRef.current = serie.chave;
      setChaveEmSalvamento(serie.chave);
      const proximo: SerieAtiva = serie.concluida
        ? { ...retirarSerie(serie), excluida: false }
        : {
            ...serie,
            reps: String(reps),
            weight_kg: String(peso),
            concluida: true,
            registroId: serie.registroId ?? novoIdSerie(),
            pendente: "salvar",
          };
      const atualizadas = seriesRef.current.map((item) =>
        item.chave === serie.chave ? proximo : item,
      );
      try {
        // Primeiro disco; só depois inicia a transmissão. Se falhar, não promete proteção.
        await salvarLocal(atualizadas);
        seriesRef.current = atualizadas;
        setSeries(atualizadas);
        setMensagem(
          serie.concluida
            ? "Série desmarcada. Alteração guardada e aguardando sincronização."
            : "✓ Série protegida no aparelho. Sincronização automática ativada.",
        );
        if (
          !serie.concluida &&
          serie.chave !== seriesRef.current[seriesRef.current.length - 1]?.chave
        )
          iniciarDescanso();
      } catch {
        avisar(
          "Não foi possível proteger a série",
          "O armazenamento local falhou. Verifique o espaço disponível antes de continuar.",
        );
      } finally {
        chaveSalvandoRef.current = null;
        setChaveEmSalvamento(null);
      }
      void sincronizar();
    },
    [iniciarDescanso, salvarLocal, sincronizar],
  );

  const podeAdaptar = () =>
    !finalizacaoRef.current &&
    !bloqueioRef.current &&
    !salvandoRef.current &&
    !chaveSalvandoRef.current &&
    !sincronizandoRef.current &&
    !!sessaoRef.current;
  async function guardarAdaptacao(
    novosExercicios: PlanoExercicio[],
    novasSeries: SerieAtiva[],
  ) {
    salvandoRef.current = true;
    setSalvando(true);
    const antigosExercicios = exerciciosRef.current,
      antigasSeries = seriesRef.current;
    exerciciosRef.current = novosExercicios;
    seriesRef.current = novasSeries;
    try {
      await salvarLocal(novasSeries);
    } catch (erro) {
      exerciciosRef.current = antigosExercicios;
      seriesRef.current = antigasSeries;
      throw erro;
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
    // A render caused by the saving indicator may have restored the previous refs.
    exerciciosRef.current = novosExercicios;
    seriesRef.current = novasSeries;
    setExercicios(novosExercicios);
    setSeries(novasSeries);
    setMensagem(
      "Adaptação guardada nesta sessão. O plano original permanece salvo.",
    );
    void sincronizar();
  }
  async function salvarExercicio(dados: DadosEditorExercicio) {
    if (!podeAdaptar())
      throw new Error("Aguarde o envio atual antes de editar o exercício.");
    const novo = criarExercicioSessao(
      dados.nome,
      Number(dados.series),
      Number(dados.repeticoes),
      dados.peso.trim() ? Number(dados.peso.replace(",", ".")) : Number.NaN,
    );
    const anterior = exerciciosRef.current.find((e) => e.id === editorId);
    if (!anterior) {
      if (exerciciosRef.current.filter((e) => !e.removido).length >= 60)
        throw new Error("Use no máximo 60 exercícios nesta sessão.");
      await guardarAdaptacao(
        [...exerciciosRef.current, novo.exercicio],
        [...seriesRef.current, ...novo.series],
      );
    } else {
      const atuais = seriesRef.current.filter(
        (s) => s.exercise_id === anterior.id && !s.excluida,
      );
      if (anterior.name !== novo.exercicio.name) {
        if (atuais.some((s) => s.concluida || s.pendente))
          throw new Error(
            "Mantenha as séries já registradas e adicione outro exercício para trocar o aparelho.",
          );
        await guardarAdaptacao(
          exerciciosRef.current
            .map((e) => (e.id === anterior.id ? { ...e, removido: true } : e))
            .concat(novo.exercicio),
          seriesRef.current
            .map((s) => (s.exercise_id === anterior.id ? retirarSerie(s) : s))
            .concat(novo.series),
        );
      } else {
        const quantidade = novo.series.length;
        if (atuais.slice(quantidade).some((s) => s.concluida || s.pendente))
          throw new Error(
            "Para retirar séries já registradas, use Retirar esta série e confirme a alteração.",
          );
        const retirar = new Set(atuais.slice(quantidade).map((s) => s.chave));
        let novas = seriesRef.current.map((s) =>
          retirar.has(s.chave)
            ? retirarSerie(s)
            : s.exercise_id === anterior.id &&
                !s.excluida &&
                !s.concluida &&
                !s.pendente
              ? { ...s, reps: dados.repeticoes, weight_kg: dados.peso }
              : s,
        );
        for (let i = atuais.length; i < quantidade; i++)
          novas = [...novas, acrescentarSerie(anterior, novas)];
        await guardarAdaptacao(
          exerciciosRef.current.map((e) =>
            e.id === anterior.id
              ? { ...e, sets_goal: quantidade, reps_goal: dados.repeticoes }
              : e,
          ),
          novas,
        );
      }
    }
    setEditorId(null);
  }
  const editarExercicio = (id: string) => {
    if (podeAdaptar()) setEditorId(id);
  };
  const removerExercicio = async (id: string) => {
    if (!podeAdaptar()) return;
    const exercicio = exerciciosRef.current.find((e) => e.id === id);
    if (!exercicio) return;
    const feitas = seriesRef.current.filter(
      (s) => s.exercise_id === id && s.concluida,
    ).length;
    if (
      !(await confirmar(
        "Retirar exercício desta sessão?",
        exercicio.name +
          (feitas
            ? ": as " +
              feitas +
              " séries já concluídas também serão retiradas deste registro."
            : ": retirar os campos deste treino?") +
          " O plano original não será excluído.",
      ))
    )
      return;
    if (!podeAdaptar()) return;
    try {
      await guardarAdaptacao(
        exerciciosRef.current.map((e) =>
          e.id === id ? { ...e, removido: true } : e,
        ),
        seriesRef.current.map((s) =>
          s.exercise_id === id ? retirarSerie(s) : s,
        ),
      );
    } catch {
      avisar(
        "Não foi possível retirar",
        "Confira o armazenamento e tente novamente.",
      );
    }
  };
  const adicionarSerie = async (id: string) => {
    if (!podeAdaptar()) return;
    const exercicio = exerciciosRef.current.find(
      (e) => e.id === id && !e.removido,
    );
    if (!exercicio) return;
    try {
      await guardarAdaptacao(exerciciosRef.current, [
        ...seriesRef.current,
        acrescentarSerie(exercicio, seriesRef.current),
      ]);
    } catch (erro) {
      avisar(
        "Série",
        erro instanceof Error ? erro.message : "Não foi possível adicionar.",
      );
    }
  };
  const removerSerie = async (serie: SerieAtiva) => {
    if (
      !podeAdaptar() ||
      seriesRef.current.filter(
        (s) => s.exercise_id === serie.exercise_id && !s.excluida,
      ).length <= 1
    )
      return;
    if (
      (serie.concluida || serie.registroId) &&
      !(await confirmar(
        "Retirar série já registrada?",
        "Esta série será removida somente desta sessão. As outras séries e o plano original serão preservados.",
      ))
    )
      return;
    if (!podeAdaptar()) return;
    try {
      await guardarAdaptacao(
        exerciciosRef.current,
        seriesRef.current.map((s) =>
          s.chave === serie.chave ? retirarSerie(s) : s,
        ),
      );
    } catch {
      avisar(
        "Não foi possível retirar",
        "Confira o armazenamento e tente novamente.",
      );
    }
  };
  const seriesDoResumo: SerieCalculoTreino[] = series
    .filter((s) => s.concluida && !s.excluida)
    .map((s) => ({
      exercise_id: s.exercise_id,
      exercise_name: s.exercise_name,
      set_number: s.set_number,
      reps: Number(s.reps),
      weight_kg: Number(s.weight_kg.replace(",", ".")),
    }));
  function finalizarSessao() {
    // Encerrar localmente não depende da rede nem da fila de envio.
    if (
      finalizacaoRef.current ||
      bloqueioRef.current ||
      salvandoRef.current ||
      chaveSalvandoRef.current ||
      !sessaoRef.current
    )
      return;
    if (!seriesDoResumo.length) {
      avisar(
        "Nenhuma série concluída",
        "Marque ao menos uma série como concluída antes de finalizar o treino.",
      );
      return;
    }
    const fim = new Date().toISOString();
    setDuracaoFinal(
      String(
        Math.max(
          0.5,
          Math.round(
            (Date.parse(fim) - Date.parse(sessaoRef.current!.started_at)) / 600,
          ) / 100,
        ),
      ),
    );
    setRevisaoFim(fim);
    setDestinoModelo("sessao");
    setNomeNovoPlano("");
    setErroConclusao("");
  }
  async function confirmarConclusao() {
    if (
      !sessao ||
      !usuarioId ||
      !revisaoFim ||
      finalizacaoRef.current ||
      salvandoRef.current
    )
      return;
    setSalvando(true);
    salvandoRef.current = true;
    setErroConclusao("");
    setInicioFinalizacao(Date.now());
    try {
      const metricas = metricasRegistroTreino(
        perfil,
        Number(duracaoFinal.replace(",", ".")),
        intensidade,
        seriesDoResumo,
      );
      const modelo =
        destinoModelo === "sessao"
          ? undefined
          : prepararModeloTreino(
              destinoModelo,
              destinoModelo === "novo" ? nomeNovoPlano : planName,
              planId,
              exerciciosRef.current,
              seriesRef.current,
            );
      const conclusao: FinalizacaoTreino = {
        finishedAt: revisaoFim,
        envioIniciadoEm: new Date().toISOString(),
        notes:
          "Treino concluído no modo ativo;esforco_percebido=" +
          esforco +
          ";modelo=" +
          destinoModelo,
        metricas,
        modelo,
      };
      // Não grava um snapshot da UI sobre confirmações recebidas durante a revisão.
      const salvo = await guardarConclusao(
        usuarioId,
        planId,
        sessao.id,
        conclusao,
      );
      if (sessaoRef.current?.id !== sessao.id) return;
      finalizacaoRef.current = salvo.finalizacao;
      setFinalizacao(salvo.finalizacao);
      setRevisaoFim(null);
      setMensagem(
        "Encerramento e escolha de treino guardados. O horário real será preservado, mesmo sem internet.",
      );
      void sincronizar();
    } catch (erro) {
      finalizacaoRef.current = undefined;
      setInicioFinalizacao(null);
      setErroConclusao(
        erro instanceof Error
          ? erro.message
          : "Não foi possível guardar a conclusão.",
      );
    } finally {
      setSalvando(false);
      salvandoRef.current = false;
    }
  }

  if (carregando)
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.secundario}>Preparando treino...</Text>
      </View>
    );

  return (
    <View style={estilos.container}>
      <StatusBar hidden={true} barStyle="light-content" />
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity onPress={onVoltar} style={estilos.voltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>{planName}</Text>
        <Text style={estilos.subtitulo}>
          Modo de treino ativo · registre as séries que realmente concluiu.
        </Text>
        {mensagem ? <Text style={estilos.mensagem}>{mensagem}</Text> : null}
        {sessao && finalizacao ? (
          <ProgressoFinalizacao
            inicio={
              inicioFinalizacao ??
              Date.parse(finalizacao.envioIniciadoEm ?? finalizacao.finishedAt)
            }
            estimativa={estimativaFinalizacao}
            salvando={false}
            online={online}
            erro={Boolean(erroSincronizacao || conflitoRemoto)}
            cor={corTema}
          />
        ) : null}
        {sessao &&
        (finalizacao ||
          restaurado ||
          !online ||
          erroSincronizacao ||
          series.some((s) => s.pendente)) ? (
          <View style={[estilos.cartao, { borderColor: "#547563" }]}>
            <Text style={[estilos.tituloCartao, { color: corTema }]}>
              ↻ {restaurado ? "Treino recuperado" : "Proteção do treino"}
            </Text>
            <Text style={estilos.secundario}>
              {totalSeriesConcluidas} de {totalSeriesVisiveis} séries concluídas
              · {progressoPercentual}%
            </Text>
            <Text style={estilos.secundario}>
              {!online
                ? "Sem internet. Seus dados continuam guardados neste aparelho."
                : sincronizando
                  ? "Sincronizando com o Supabase..."
                  : series.some((s) => s.pendente)
                    ? `${series.filter((s) => s.pendente).length} alteração(ões) aguardando envio.`
                    : finalizacao
                      ? "Encerramento aguardando confirmação. Você pode sair desta tela; os dados permanecem protegidos."
                      : "Treino salvo e sincronizado."}
            </Text>
            {erroSincronizacao ? (
              <Text style={estilos.aviso}>{erroSincronizacao}</Text>
            ) : null}
            {conflitoRemoto && !bloqueioSessao && !conflitoSessao ? (
              <TouchableOpacity
                style={estilos.botaoSecundario}
                onPress={() => {
                  const mensagemConflito =
                    "Existe um registro diferente no Supabase. Enviar os valores deste aparelho irá substituir o registro remoto dessa série. Deseja continuar?";
                  if (Platform.OS === "web" && typeof window !== "undefined") {
                    if (window.confirm(mensagemConflito))
                      void sincronizar(true);
                  } else {
                    Alert.alert("Conflito entre aparelhos", mensagemConflito, [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Enviar minha versão",
                        onPress: () => {
                          void sincronizar(true);
                        },
                      },
                    ]);
                  }
                }}
              >
                <Text style={estilos.textoBotaoSecundario}>
                  Enviar minha versão (substituir no servidor)
                </Text>
              </TouchableOpacity>
            ) : null}
            {finalizacao && !bloqueioSessao ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Enviar treino salvo neste aparelho"
                disabled={sincronizando || salvando}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
                onPress={() => {
                  void confirmar(
                    "Enviar treino salvo neste aparelho?",
                    "Vamos guardar uma cópia de segurança e enviar as séries concluídas com o horário original. Se a sessão não existir, ela será restaurada. Se estiver incompleta, o envio será retomado. Uma conclusão diferente já existente não será substituída.",
                  ).then((aceitou) => {
                    if (aceitou) void sincronizar(false, "local");
                  });
                }}
              >
                <Text style={estilos.textoPrimario}>
                  {recuperacaoEmCurso === "local"
                    ? "Enviando..."
                    : "Enviar treino salvo neste aparelho"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {conflitoRemoto && !bloqueioSessao ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Usar conclusão do servidor e guardar cópia local"
                disabled={sincronizando || salvando}
                style={estilos.botaoSecundario}
                onPress={() => {
                  void confirmar(
                    "Recuperar conclusão do servidor?",
                    "Vamos conferir se esta sessão está concluída no servidor, sem alterar seus dados. Todas as séries, horários e escolhas deste aparelho ficarão numa cópia de segurança, acessível ao abrir este treino. Diferenças locais não serão enviadas ao histórico nem ao plano. Deseja continuar?",
                  ).then((aceitou) => {
                    if (aceitou) void sincronizar(false, "remota");
                  });
                }}
              >
                <Text style={estilos.textoBotaoSecundario}>
                  {recuperacaoEmCurso === "remota"
                    ? "Conferindo..."
                    : "Usar conclusão do servidor e guardar cópia local"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {bloqueioSessao ? (
              <>
                <Text style={estilos.aviso}>
                  Sessão alterada ou encerrada em outro dispositivo. Não faremos
                  alterações automáticas.
                </Text>
                <TouchableOpacity
                  style={estilos.botaoSecundario}
                  onPress={() => {
                    const texto =
                      "Descartar a cópia deste aparelho? Dados locais pendentes que não estiverem no Supabase serão perdidos. Faça isso somente se já conferiu o histórico.";
                    const descartar = async () => {
                      try {
                        prontoRef.current = false;
                        await apagarRascunho(usuarioId, planId);
                        setBloqueioSessao(false);
                        setSessao(null);
                        setSeries([]);
                        onVoltar();
                      } catch {
                        avisar("Falha", "Não foi possível remover o rascunho.");
                      }
                    };
                    if (
                      Platform.OS === "web" &&
                      typeof window !== "undefined"
                    ) {
                      if (window.confirm(texto)) void descartar();
                    } else
                      Alert.alert("Descartar rascunho?", texto, [
                        { text: "Cancelar", style: "cancel" },
                        {
                          text: "Descartar",
                          style: "destructive",
                          onPress: () => {
                            void descartar();
                          },
                        },
                      ]);
                  }}
                >
                  <Text style={estilos.textoBotaoSecundario}>
                    Descartar rascunho deste aparelho
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            {!bloqueioSessao &&
            !conflitoRemoto &&
            (finalizacao || series.some((s) => s.pendente)) ? (
              <TouchableOpacity
                disabled={sincronizando}
                style={estilos.botaoSecundario}
                onPress={() => void sincronizar()}
              >
                <Text style={estilos.textoBotaoSecundario}>
                  {sincronizando ? "Sincronizando..." : "↻ Sincronizar agora"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {outroTreinoAtivo ? (
          <TouchableOpacity
            onPress={onVoltar}
            style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
          >
            <Text style={estilos.textoPrimario}>Voltar aos meus treinos</Text>
          </TouchableOpacity>
        ) : !sessao ? (
          <View style={estilos.cartao}>
            <Text style={estilos.tituloCartao}>Pronto para começar?</Text>
            <Text style={estilos.secundario}>
              O tempo começa quando você iniciar. Suas séries concluídas serão
              salvas como cópia desta sessão, sem alterar as cargas de
              referência.
            </Text>
            <TouchableOpacity
              onPress={() => void iniciarSessao()}
              disabled={salvando}
              style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
            >
              <Text style={estilos.textoPrimario}>
                {salvando ? "Iniciando..." : "▶ Iniciar treino"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[estilos.cartaoResumo, { borderColor: corTema }]}>
              <Text style={estilos.rotulo}>TEMPO DE TREINO</Text>
              <CronometroTreino
                inicio={sessao.started_at}
                fim={finalizacao?.finishedAt ?? revisaoFim ?? undefined}
                ativo={estaEmFoco}
                cor={corTema}
              />
              <Text style={estilos.progressoTexto}>
                {totalSeriesConcluidas} de {series.length} séries ·{" "}
                {progressoPercentual}% concluído
              </Text>
              <View
                style={estilos.trilhaProgresso}
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: progressoPercentual,
                }}
              >
                <View
                  style={[
                    estilos.preenchimentoProgresso,
                    {
                      width: `${progressoPercentual}%`,
                      backgroundColor: corTema,
                    },
                  ]}
                />
              </View>
              {proximaSerie ? (
                <Text style={estilos.proximaSerie}>
                  Próxima: {proximaSerie.exercise_name} · série{" "}
                  {proximaSerie.set_number}
                </Text>
              ) : (
                <Text style={estilos.proximaSerie}>
                  Todas as séries foram concluídas! 🎉
                </Text>
              )}
              <View style={estilos.linhaIndicadores}>
                <View style={estilos.indicador}>
                  <Text style={estilos.indicadorNumero}>
                    {totalSeriesConcluidas}
                  </Text>
                  <Text style={estilos.secundario}>séries</Text>
                </View>
                <View style={estilos.indicador}>
                  <Text style={estilos.indicadorNumero}>
                    {Math.round(volumeTotal).toLocaleString("pt-BR")}
                  </Text>
                  <Text style={estilos.secundario}>kg × reps</Text>
                </View>
              </View>
            </View>
            <PainelDescanso
              descanso={descanso}
              ativo={estaEmFoco}
              bloqueado={Boolean(finalizacao) || bloqueioSessao}
              cor={corTema}
              onAlterar={alterarDescanso}
              onPreferencia={mudarPreferenciaDescanso}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Adicionar exercício durante o treino"
              disabled={
                salvando ||
                sincronizando ||
                bloqueioSessao ||
                Boolean(finalizacao)
              }
              style={[estilos.botaoSecundario, { borderColor: corTema }]}
              onPress={() => setEditorId("novo")}
            >
              <Text style={{ color: corTema, fontWeight: "800" }}>
                + Adicionar exercício
              </Text>
            </TouchableOpacity>
            <Text style={estilos.tituloSecao}>Séries do treino</Text>
            {erroReferencia ? (
              <Text style={estilos.secundario}>{erroReferencia}</Text>
            ) : null}
            {exercicios
              .filter((e) => !e.removido)
              .map((exercicio) => (
                <CartaoExercicioTreino
                  key={exercicio.id}
                  exercicio={exercicio}
                  series={seriesPorExercicio.get(exercicio.id) ?? []}
                  anterior={ultimasSeries[exercicio.id]}
                  cor={corTema}
                  proximaChave={proximaSerie?.chave}
                  bloqueado={
                    salvando ||
                    sincronizando ||
                    bloqueioSessao ||
                    Boolean(finalizacao)
                  }
                  chaveSalvando={chaveEmSalvamento}
                  onCampo={atualizarCampo}
                  onAlternar={alternarSerie}
                  onCopiar={copiarUltimaSessao}
                  onEditar={editarExercicio}
                  onRetirar={(id) => void removerExercicio(id)}
                  onAdicionarSerie={(id) => void adicionarSerie(id)}
                  onRetirarSerie={(s) => void removerSerie(s)}
                />
              ))}
            <View style={estilos.cartao}>
              <Text style={estilos.tituloCartao}>Encerrar e revisar</Text>
              <Text style={estilos.secundario}>
                Confira duração, intensidade, calorias estimadas e escolha se
                deseja salvar esta adaptação como treino.
              </Text>
              <TouchableOpacity
                disabled={
                  salvando ||
                  chaveEmSalvamento !== null ||
                  bloqueioSessao ||
                  Boolean(finalizacao)
                }
                onPress={finalizarSessao}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
              >
                <Text style={estilos.textoPrimario}>
                  {salvando
                    ? "Salvando..."
                    : finalizacao
                      ? "Encerramento aguardando confirmação"
                      : "Finalizar e salvar treino"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {copias.length ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Ver cópias de segurança deste treino"
            style={estilos.botaoSecundario}
            onPress={() => setMostrarCopias(true)}
          >
            <Text style={estilos.textoBotaoSecundario}>
              Ver cópias de segurança deste treino ({copias.length})
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={mostrarCopias}
        onRequestClose={() => setMostrarCopias(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#000B" }}>
          <ScrollView
            contentContainerStyle={{ padding: 18, paddingTop: 50, gap: 16 }}
          >
            <View style={estilos.cartao}>
              <Text style={estilos.tituloCartao}>
                Cópias locais preservadas
              </Text>
              <Text style={estilos.secundario}>
                Estas cópias ficam neste aparelho e preservam os dados
                anteriores à recuperação. Consulte o histórico para conferir o
                que foi enviado ao servidor.
              </Text>
              {copias.map((copia) => (
                <View key={copia.id} style={{ gap: 8 }}>
                  <Text style={estilos.textoOpcao}>
                    {copia.rascunho.planName} ·{" "}
                    {new Date(copia.arquivadoEm).toLocaleString()}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Usar cópia em novo treino"
                    disabled={salvando || Boolean(sessao)}
                    onPress={() => void iniciarSessao(copia)}
                    style={[
                      estilos.botaoPrimario,
                      { backgroundColor: corTema },
                    ]}
                  >
                    <Text style={estilos.textoPrimario}>
                      Usar cópia em novo treino
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Excluir cópia local"
                    disabled={salvando}
                    onPress={() => void apagarCopia(copia)}
                    style={estilos.botaoSecundario}
                  >
                    <Text style={estilos.textoBotaoSecundario}>
                      Excluir cópia local
                    </Text>
                  </TouchableOpacity>
                  <Text style={estilos.secundario}>
                    Início: {copia.rascunho.sessao.started_at}
                    {"\n"}Conclusão local:{" "}
                    {copia.rascunho.finalizacao?.finishedAt ?? "Não registrada"}
                    {"\n"}Conclusão no servidor ao guardar a cópia:{" "}
                    {copia.remota?.finished_at ?? "Não encontrada"}
                    {"\n"}Escolha de plano:{" "}
                    {copia.rascunho.finalizacao?.modelo?.nome ??
                      "Só nesta sessão"}
                  </Text>
                  {copia.rascunho.series.map((serie) => (
                    <Text key={serie.chave} style={estilos.secundario}>
                      {serie.exercise_name} · série {serie.set_number}:{" "}
                      {serie.reps} × {serie.weight_kg} kg ·{" "}
                      {serie.excluida
                        ? "retirada"
                        : serie.concluida
                          ? "concluída"
                          : "aberta"}
                      {serie.pendente ? " · envio pendente na cópia" : ""}
                    </Text>
                  ))}
                </View>
              ))}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fechar cópias de segurança"
                onPress={() => setMostrarCopias(false)}
                style={estilos.botaoSecundario}
              >
                <Text style={estilos.textoBotaoSecundario}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      {editorId !== null ? (
        <EditorExercicioSessao
          key={editorId}
          editando={editorId !== "novo"}
          nomeBloqueado={series.some(
            (s) => s.exercise_id === editorId && (s.concluida || s.pendente),
          )}
          cor={corTema}
          onFechar={() => setEditorId(null)}
          onSalvar={salvarExercicio}
          inicial={(() => {
            const exercicio = exercicios.find((e) => e.id === editorId),
              abertas = series.filter(
                (s) => s.exercise_id === editorId && !s.excluida,
              );
            return {
              nome: exercicio?.name ?? "",
              series: String(abertas.length || 3),
              repeticoes: abertas[0]?.reps ?? "10",
              peso: abertas[0]?.weight_kg ?? "0",
            };
          })()}
        />
      ) : null}
      <Modal
        transparent
        animationType="fade"
        visible={revisaoFim !== null}
        onRequestClose={() => {
          if (!salvando) setRevisaoFim(null);
        }}
      >
        <View style={{ flex: 1, backgroundColor: "#000B" }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              padding: 18,
            }}
          >
            <View
              style={[
                estilos.cartao,
                { width: "100%", maxWidth: 560, alignSelf: "center", gap: 16 },
              ]}
            >
              <Text style={estilos.tituloCartao}>
                Revisar e concluir treino
              </Text>
              {salvando && inicioFinalizacao !== null ? (
                <ProgressoFinalizacao
                  inicio={inicioFinalizacao}
                  estimativa={estimativaFinalizacao}
                  salvando
                  online={online}
                  erro={false}
                  cor={corTema}
                />
              ) : (
                <Text style={estilos.secundario}>
                  {estimativaFinalizacao === null
                    ? "Ao confirmar, a conclusão será salva neste aparelho e enviada ao servidor. O tempo depende da conexão."
                    : `Previsão de envio após confirmar: cerca de ${estimativaFinalizacao} s, com base nos envios anteriores deste aparelho. Pode variar conforme a conexão.`}
                </Text>
              )}
              <ResumoRegistroTreino
                perfil={perfil}
                series={seriesDoResumo}
                duracao={duracaoFinal}
                onDuracao={setDuracaoFinal}
                intensidade={intensidade}
                onIntensidade={setIntensidade}
                esforco={esforco}
                onEsforco={setEsforco}
                cor={corTema}
                bloqueado={salvando}
              />
              <Text style={estilos.tituloCartao}>
                Como guardar este treino?
              </Text>
              {(
                [
                  ["novo", "Criar novo treino"],
                  ["adicionar", "Adicionar novos exercícios ao original"],
                  ["sessao", "Usar só nesta sessão"],
                ] as const
              ).map(([modo, titulo]) => (
                <TouchableOpacity
                  key={modo}
                  accessibilityRole="button"
                  accessibilityLabel={titulo}
                  accessibilityState={{ selected: destinoModelo === modo }}
                  disabled={
                    salvando ||
                    (modo === "adicionar" &&
                      !exercicios.some((e) => e.avulso && !e.removido))
                  }
                  onPress={() => setDestinoModelo(modo)}
                  style={[
                    estilos.botaoSecundario,
                    {
                      borderColor: destinoModelo === modo ? corTema : "#45544A",
                    },
                  ]}
                >
                  <Text style={estilos.textoOpcao}>
                    {destinoModelo === modo ? "✓ " : ""}
                    {titulo}
                  </Text>
                </TouchableOpacity>
              ))}
              {destinoModelo === "novo" ? (
                <TextInput
                  accessibilityLabel="Nome do novo treino"
                  placeholder="Ex.: Treino academia da viagem"
                  placeholderTextColor="#828A85"
                  value={nomeNovoPlano}
                  onChangeText={setNomeNovoPlano}
                  maxLength={100}
                  editable={!salvando}
                  style={{
                    borderWidth: 1,
                    borderColor: corTema,
                    borderRadius: 10,
                    padding: 12,
                    color: "#F0F4F1",
                  }}
                />
              ) : null}
              <Text style={estilos.secundario}>
                {destinoModelo === "novo"
                  ? "Cria um plano com os exercícios e cargas desta sessão e vincula esta conclusão a ele. O original é preservado."
                  : destinoModelo === "adicionar"
                    ? "Acrescenta somente exercícios novos. Não exclui exercícios nem troca as cargas de referência que já existiam no original."
                    : "Guarda o que você realizou no histórico, sem mudar nenhum plano."}
              </Text>
              {erroConclusao ? (
                <Text accessibilityRole="alert" style={estilos.aviso}>
                  {erroConclusao}
                </Text>
              ) : null}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Confirmar conclusão do treino"
                disabled={salvando}
                onPress={() => void confirmarConclusao()}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
              >
                <Text style={estilos.textoPrimario}>
                  {salvando ? "Guardando..." : "Confirmar conclusão do treino"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={salvando}
                onPress={() => setRevisaoFim(null)}
                style={estilos.botaoSecundario}
              >
                <Text style={estilos.textoOpcao}>Continuar treinando</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101312" },
  conteudo: {
    padding: 20,
    paddingTop: Platform.OS === "web" ? 8 : 20,
    paddingBottom: 44,
    gap: 14,
    maxWidth: 820,
    width: "100%",
    alignSelf: "center",
  },
  centro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#101312",
    gap: 12,
  },
  voltar: { alignSelf: "flex-start", paddingVertical: 6, paddingRight: 16 },
  textoVoltar: { fontSize: 16, fontWeight: "700" },
  marca: { fontSize: 12, letterSpacing: 2, fontWeight: "800" },
  titulo: { color: "#F1F5F2", fontSize: 28, fontWeight: "800" },
  subtitulo: { color: "#A4ADA7", fontSize: 14, lineHeight: 20 },
  mensagem: {
    backgroundColor: "#1A211D",
    color: "#D9E2DC",
    padding: 12,
    borderRadius: 10,
    lineHeight: 20,
  },
  cartao: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cartaoResumo: {
    backgroundColor: "#151A17",
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  cartaoExercicio: {
    backgroundColor: "#151A17",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cartaoSerie: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  tituloCartao: { color: "#F0F4F1", fontWeight: "800", fontSize: 17 },
  tituloSecao: {
    color: "#F0F4F1",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 5,
  },
  rotulo: {
    color: "#8F9A92",
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  cronometroGrande: {
    fontSize: 42,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  trilhaProgresso: {
    width: "100%",
    height: 9,
    borderRadius: 10,
    backgroundColor: "#303832",
    overflow: "hidden",
  },
  preenchimentoProgresso: { height: "100%", borderRadius: 10 },
  progressoTexto: { color: "#E8F0EA", fontSize: 13, fontWeight: "800" },
  proximaSerie: { color: "#C0CFC4", fontSize: 12, textAlign: "center" },
  descansoPronto: { fontSize: 13, textAlign: "center", fontWeight: "800" },
  cronometroDescanso: {
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  linhaIndicadores: { flexDirection: "row", gap: 30, justifyContent: "center" },
  indicador: { alignItems: "center", minWidth: 70, gap: 2 },
  indicadorNumero: { color: "#F2F6F3", fontSize: 22, fontWeight: "800" },
  secundario: { color: "#A4ADA7", fontSize: 13, lineHeight: 19 },
  opcoesDescanso: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opcaoDescanso: {
    borderWidth: 1,
    borderColor: "#38423B",
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  textoOpcao: { color: "#F0F4F1", fontWeight: "700" },
  linhaBotoes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  botaoSecundario: {
    borderWidth: 1,
    borderColor: "#3A443D",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textoBotaoSecundario: { color: "#E3EAE5", fontWeight: "700" },
  linhaCampos: { flexDirection: "row", gap: 10 },
  campo: { flex: 1, minWidth: 0, gap: 6 },
  controlesRapidos: { flexDirection: "row", gap: 6 },
  botaoAjuste: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    borderColor: "#45544A",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#202922",
  },
  textoAjuste: { color: "#E8EFE9", fontSize: 13, fontWeight: "800" },
  rotuloCampo: { color: "#9CA69F", fontSize: 12 },
  input: {
    color: "#F0F4F1",
    backgroundColor: "#101312",
    borderColor: "#38423B",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minWidth: 0,
  },
  botaoSerie: { borderRadius: 9, padding: 11, alignItems: "center" },
  botaoPrimario: {
    borderRadius: 11,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  textoPrimario: { color: "#101312", fontWeight: "800", textAlign: "center" },
  aviso: { color: "#F8C976", lineHeight: 20, fontSize: 13 },
});
