import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIsFocused } from "@react-navigation/native";
import { registrarMudancaDeDados } from "../servicos/revisaoDados";
import {
  ActivityIndicator,
  Platform,
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
  listarRascunhos,
  mesmaOperacao,
  type DescansoTreino,
  type FinalizacaoTreino,
  type SerieRascunho,
  type EsforcoPercebido,
  type TreinoRascunho,
} from "../servicos/treinoLocal";
import {
  estimarCaloriasAtivasTreino,
  type DadosCalculoTreino,
  type IntensidadeTreino,
  type SerieCalculoTreino,
  type SexoTreino,
} from "../servicos/caloriasTreino";

const CHAVE_PREFERENCIA_DESCANSO = "@treino-familia:descanso-segundos:v1";
import { CronometroTreino, PainelDescanso, OPCOES_DESCANSO } from "../componentes/ContadoresTreino";
import { CartaoExercicioTreino } from "../componentes/CartaoExercicioTreino";
import { sincronizarRascunho } from "../servicos/treinoSincronizacao";
import { carregarUltimasSeries, type UltimoExercicio } from "../servicos/ultimasSeriesTreino";

type PerfilTreino = Pick<
  DadosCalculoTreino,
  "pesoKg" | "alturaCm" | "idade" | "sexo"
>;

type Props = {
  route: { params: { planId: string; planName: string } };
  onVoltar: () => void;
  corTema?: string;
};
type ExercicioBase = {
  id: string;
  name: string;
  sets_goal: number;
  reps_goal: string;
};
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
        text: "Continuar treinando",
        style: "cancel",
        onPress: () => resolver(false),
      },
      { text: "Finalizar", onPress: () => resolver(true) },
    ]);
  });
}

function lerPerfil(metadados: Record<string, unknown>): PerfilTreino | null {
  const pesoKg = Number(metadados.peso_kg);
  const alturaCm = Number(metadados.altura_cm);
  const idade = Number(metadados.idade);
  const sexo = metadados.sexo;
  if (
    !Number.isFinite(pesoKg) ||
    pesoKg < 20 ||
    pesoKg > 400 ||
    !Number.isFinite(alturaCm) ||
    alturaCm < 100 ||
    alturaCm > 250 ||
    !Number.isInteger(idade) ||
    idade < 18 ||
    idade > 110 ||
    (sexo !== "masculino" && sexo !== "feminino")
  )
    return null;
  return { pesoKg, alturaCm, idade, sexo: sexo as SexoTreino };
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
  const [descanso, setDescanso] = useState<DescansoTreino>({ fimEm: null, pausado: false, segundosPausados: 0, duracao: 90 });
  const [finalizacao, setFinalizacao] = useState<FinalizacaoTreino | undefined>();
  const [ultimasSeries, setUltimasSeries] = useState<Record<string, UltimoExercicio>>({});
  const [erroReferencia, setErroReferencia] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [outroTreinoAtivo, setOutroTreinoAtivo] = useState(false);
  const [esforco, setEsforco] = useState<EsforcoPercebido>("nao_informado");
  const [restaurado, setRestaurado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSincronizacao, setErroSincronizacao] = useState("");
  const [conflitoRemoto, setConflitoRemoto] = useState(false);
  const [bloqueioSessao, setBloqueioSessao] = useState(false);
  const [online, setOnline] = useState(true);
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

  const sincronizar = useCallback(async (permitirSobrescrever = false) => {
    if (sincronizandoRef.current || bloqueioRef.current || !prontoRef.current) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false) {
      setOnline(false); return;
    }
    const id = usuarioRef.current;
    const atual = sessaoRef.current;
    if (!id || !atual || atual.plan_id !== planId) return;
    sincronizandoRef.current = true; setSincronizando(true);
    const antes = seriesRef.current;
    try {
      const resultado = await sincronizarRascunho(id, planId, permitirSobrescrever);
      if (resultado.concluido && !resultado.rascunho) {
        prontoRef.current = false; sessaoRef.current = null; finalizacaoRef.current = undefined;
        setFinalizacao(undefined); setSessao(null); setErroSincronizacao("");
        setMensagem("Treino concluído e sincronizado. O horário original foi preservado.");
        onVoltar(); return;
      }
      if (resultado.rascunho?.sessao.id === atual.id) {
        const porChave = new Map(resultado.rascunho.series.map((serie) => [serie.chave, serie]));
        const antesPorChave = new Map(antes.map((serie) => [serie.chave, serie]));
        const atualizadas = seriesRef.current.map((serie) => {
          const original = antesPorChave.get(serie.chave);
          const remota = porChave.get(serie.chave);
          return original && remota && mesmaOperacao(serie, original) ? remota : serie;
        });
        seriesRef.current = atualizadas; setSeries(atualizadas);
      }
      setConflitoRemoto(Boolean(resultado.conflito)); setErroSincronizacao(resultado.erro ?? "");
      if (!resultado.erro) { setOnline(true); setMensagem("Treino sincronizado."); }
    } catch {
      setErroSincronizacao("Não foi possível sincronizar. Seus dados continuam guardados neste aparelho.");
    } finally { sincronizandoRef.current = false; setSincronizando(false); }
  }, [onVoltar, planId]);

  // Grava também mudanças de carga/repetições ainda não concluídas.
  useEffect(() => {
    if (!prontoRef.current || !sessao) return;
    salvarLocal().catch(() =>
      setErroSincronizacao(
        "Não foi possível salvar o rascunho no aparelho. Verifique o armazenamento.",
      ),
    );
  }, [series, sessao, exercicios, intensidade, esforco, descanso, finalizacao, salvarLocal]);

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
  const operacoesPendentes = useMemo(() => JSON.stringify({
    series: series.filter((serie) => serie.pendente).map(({ chave, pendente, registroId, reps, weight_kg, concluida }) => ({ chave, pendente, registroId, reps, weight_kg, concluida })),
    finalizacao: finalizacao?.finishedAt,
  }), [series, finalizacao]);
  useEffect(() => {
    if (!sessao || (!finalizacao && !seriesRef.current.some((serie) => serie.pendente))) return;
    // Persist before sending. A failed attempt with unchanged operations must not
    // immediately trigger another render/send loop.
    void salvarLocal().then(() => sincronizar()).catch(() => setErroSincronizacao("Não foi possível proteger as alterações neste aparelho."));
  }, [sessao, operacoesPendentes, salvarLocal, sincronizar, finalizacao]);
  useEffect(() => {
    if (!sessao || (!finalizacao && !seriesRef.current.some((serie) => serie.pendente))) return;
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
      const local = await lerRascunho(idUsuario, planId);
      usuarioRef.current = idUsuario;
      const sessaoUsuario = { user: usuarioEmCache };
      setUsuarioId(idUsuario);
      setPerfil(
        lerPerfil(
          (sessaoUsuario.user.user_metadata ?? {}) as Record<string, unknown>,
        ),
      );

      if (local?.finalizacao) {
        setExercicios(local.exercicios); exerciciosRef.current = local.exercicios;
        setSeries(local.series); seriesRef.current = local.series;
        setSessao(local.sessao); sessaoRef.current = local.sessao;
        setIntensidade(local.intensidade); intensidadeRef.current = local.intensidade;
        setEsforco(local.esforco); esforcoRef.current = local.esforco;
        setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
        if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
        setRestaurado(true); prontoRef.current = true;
        setErroSincronizacao(local.erroSincronizacao ?? "");
        setConflitoRemoto(Boolean(local.conflitoSincronizacao));
        setMensagem("Treino encerrado neste aparelho. A conclusão aguarda confirmação do servidor.");
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
          if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
          setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
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
          if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
          setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
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
          if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
          setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
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
        listas,
        registros,
        local?.sessao.id === ativa.id ? local : null,
      );
      setSeries(mescladas);
      seriesRef.current = mescladas;
      if (local?.sessao.id === ativa.id) {
        setIntensidade(local.intensidade);
        setEsforco(local.esforco ?? "nao_informado");
          if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
          setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
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
          if (local.descanso) { setDescanso(local.descanso); descansoRef.current = local.descanso; }
          setFinalizacao(local.finalizacao); finalizacaoRef.current = local.finalizacao;
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
    let ativo = true; setErroReferencia("");
    carregarUltimasSeries(usuarioId, exercicios.map((exercicio) => exercicio.id))
      .then((referencias) => { if (ativo) setUltimasSeries(referencias); })
      .catch(() => { if (ativo) setErroReferencia("Não foi possível consultar a última sessão. Seus campos atuais continuam disponíveis."); });
    return () => { ativo = false; };
  }, [usuarioId, exercicios]);
  const seriesPorExercicio = useMemo(() => {
    const grupos = new Map<string, SerieAtiva[]>();
    for (const serie of series) {
      const grupo = grupos.get(serie.exercise_id);
      if (grupo) grupo.push(serie); else grupos.set(serie.exercise_id, [serie]);
    }
    return grupos;
  }, [series]);

  const proximaSerie = useMemo(
    () => series.find((item) => !item.concluida) ?? null,
    [series],
  );
  const totalSeriesConcluidas = useMemo(
    () => series.filter((item) => item.concluida).length,
    [series],
  );
  const progressoPercentual = series.length
    ? Math.round((totalSeriesConcluidas / series.length) * 100)
    : 0;
  const volumeTotal = useMemo(
    () =>
      series
        .filter((item) => item.concluida)
        .reduce(
          (total, item) =>
            total + Number(item.reps || 0) * Number(item.weight_kg || 0),
          0,
        ),
    [series],
  );
  async function iniciarSessao() {
    if (!usuarioId || !exercicios.length) return;
    setSalvando(true);
    try {
      const pendentes = await listarRascunhos(usuarioId);
      if (pendentes.some((rascunho) => rascunho.finalizacao || rascunho.series.some((serie) => serie.pendente))) {
        avisar("Treino aguardando sincronização", "Abra o treino pendente e confirme sua sincronização antes de iniciar outra sessão.");
        return;
      }
      const { data: ativas, error: erroAtivas } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, started_at")
        .eq("user_id", usuarioId)
        .eq("status", "em_andamento")
        .order("started_at", { ascending: false })
        .limit(1);
      if (erroAtivas) throw erroAtivas;
      if (ativas?.length) {
        await carregar();
        avisar(
          "Treino já em andamento",
          "Continue ou finalize a sessão em andamento antes de iniciar outra.",
        );
        return;
      }
      const agoraLocal = new Date();
      const inicioDia = new Date(
        agoraLocal.getFullYear(),
        agoraLocal.getMonth(),
        agoraLocal.getDate(),
      ).toISOString();
      const fimDia = new Date(
        agoraLocal.getFullYear(),
        agoraLocal.getMonth(),
        agoraLocal.getDate() + 1,
      ).toISOString();
      const { data: registrosHoje, error: erroRegistrosHoje } = await supabase
        .from("workout_sessions")
        .select("id, status")
        .eq("user_id", usuarioId)
        .not("plan_id", "is", null)
        .gte("started_at", inicioDia)
        .lt("started_at", fimDia);
      if (erroRegistrosHoje) throw erroRegistrosHoje;
      if (
        (registrosHoje ?? []).some(
          (registro) => registro.status !== "em_andamento",
        )
      ) {
        avisar(
          "Treino já registrado hoje",
          "Já existe um treino registrado nesta data. Para evitar duplicidade no histórico, remova o registro anterior na Frequência antes de iniciar uma nova sessão ativa.",
        );
        return;
      }
      const inicio = new Date().toISOString();
      const { data, error } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: usuarioId,
          plan_id: planId,
          started_at: inicio,
          finished_at: null,
          status: "em_andamento",
          notes: "Treino iniciado no modo ativo",
        })
        .select("id, plan_id, started_at")
        .single();
      if (error || !data)
        throw error ?? new Error("Não foi possível iniciar o treino.");
      setSessao(data as SessaoAtiva);
      sessaoRef.current = data as SessaoAtiva;
      prontoRef.current = true;
      // Persistir a sessão antes de permitir qualquer registro.
      await salvarLocal();

      setMensagem(
        "Treino iniciado. Marque cada série ao terminá-la; as cargas e repetições serão salvas como registro desta sessão.",
      );
    } catch (erro) {
      avisar(
        "Erro ao iniciar treino",
        erro instanceof Error
          ? erro.message
          : "Não foi possível iniciar a sessão. Confira se executou o SQL de atualização segura.",
      );
    } finally {
      setSalvando(false);
    }
  }

  const atualizarCampo = useCallback((chave: string, campo: "reps" | "weight_kg", valor: string) => {
    if (finalizacaoRef.current || bloqueioRef.current || salvandoRef.current || chaveSalvandoRef.current) return;
    const atualizadas = seriesRef.current.map((item) => item.chave === chave && !item.concluida && !item.pendente ? { ...item, [campo]: valor } : item);
    seriesRef.current = atualizadas; setSeries(atualizadas);
  }, []);
  const alterarDescanso = useCallback((valor: DescansoTreino) => {
    if (finalizacaoRef.current) return;
    descansoRef.current = valor; setDescanso(valor);
  }, []);
  const mudarPreferenciaDescanso = useCallback((valor: number) => {
    const atual = descansoRef.current;
    alterarDescanso({ ...atual, duracao: valor, fimEm: atual.fimEm === null ? null : Date.now() + valor * 1000,
      segundosPausados: atual.pausado ? valor : 0 });
    AsyncStorage.setItem(CHAVE_PREFERENCIA_DESCANSO, String(valor)).catch(() => {});
  }, [alterarDescanso]);
  const iniciarDescanso = useCallback(() => {
    const atual = descansoRef.current;
    alterarDescanso({ ...atual, fimEm: Date.now() + atual.duracao * 1000, pausado: false, segundosPausados: 0 });
  }, [alterarDescanso]);
  const copiarUltimaSessao = useCallback((id: string) => {
    if (finalizacaoRef.current || bloqueioRef.current || salvandoRef.current || chaveSalvandoRef.current || sincronizandoRef.current) return;
    const anterior = ultimasSeries[id]; if (!anterior) return;
    const atualizadas = copiarSeriesAnteriores(seriesRef.current, anterior.series, id);
    seriesRef.current = atualizadas; setSeries(atualizadas);
    setMensagem("Valores da última sessão copiados para as séries abertas deste rascunho. Confira antes de concluir.");
  }, [ultimasSeries]);

  const alternarSerie = useCallback(async (serie: SerieAtiva) => {
    if (finalizacaoRef.current || salvandoRef.current || chaveSalvandoRef.current) return;
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
      ? {
          ...serie,
          concluida: false,
          pendente: serie.registroId ? "remover" : undefined,
          registroId: serie.registroId,
        }
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
  }, [iniciarDescanso, salvarLocal, sincronizar]);

  async function finalizarSessao() {
    if (!sessao || !usuarioId || bloqueioSessao) return;
    if (sincronizandoRef.current || finalizacaoRef.current) return;
    if (totalSeriesConcluidas === 0) {
      avisar(
        "Nenhuma série concluída",
        "Marque ao menos uma série como concluída antes de finalizar o treino.",
      );
      return;
    }
    const confirmou = await confirmar(
      "Finalizar treino?",
      `Você concluiu ${totalSeriesConcluidas} série(s). Deseja salvar o encerramento da sessão?`,
    );
    if (!confirmou) return;

    setSalvando(true);
    try {
      const final = new Date();
      const duracaoMinutos = Math.max(
        0.5,
        Math.round(
          ((final.getTime() - new Date(sessao.started_at).getTime()) / 60000) *
            100,
        ) / 100,
      );
      const seriesFeitas = series.filter((item) => item.concluida);
      const exerciciosFeitos = new Set(
        seriesFeitas.map((item) => item.exercise_id),
      );
      const seriesCalculo: SerieCalculoTreino[] = seriesFeitas.map((serie) => ({
        exercise_id: serie.exercise_id,
        exercise_name: serie.exercise_name,
        set_number: serie.set_number,
        reps: Number(serie.reps),
        weight_kg: Number(serie.weight_kg.replace(",", ".")),
      }));
      const estimativa = perfil
        ? estimarCaloriasAtivasTreino({
            ...perfil,
            duracaoMinutos,
            intensidade,
            series: seriesCalculo,
          })
        : null;

      const conclusao: FinalizacaoTreino = {
        finishedAt: final.toISOString(),
        notes: "Treino concluído no modo ativo" + (esforco !== "nao_informado" ? ";esforco_percebido=" + esforco : ""),
        metricas: {
          duration_minutes: duracaoMinutos,
          intensity: intensidade,
          active_calories: estimativa?.caloriasAtivas ?? null,
          weight_kg_snapshot: perfil?.pesoKg ?? null,
          height_cm_snapshot: perfil?.alturaCm ?? null,
          age_snapshot: perfil?.idade ?? null,
          sex_snapshot: perfil?.sexo ?? null,
          met_value: estimativa?.met ?? null,
          volume_kg:
            estimativa?.volumeCargaKg ?? Math.round(volumeTotal * 100) / 100,
          exercises_count:
            estimativa?.quantidadeExercicios ?? exerciciosFeitos.size,
          sets_completed: estimativa?.quantidadeSeries ?? totalSeriesConcluidas,
          reps_completed:
            estimativa?.repeticoesTotais ??
            seriesFeitas.reduce(
              (soma, serie) => soma + (Number(serie.reps) || 0),
              0,
            ),
        },
      };
      const anterior = finalizacaoRef.current;
      finalizacaoRef.current = conclusao;
      const rascunho = montarRascunho();
      if (!rascunho) throw new Error("Não foi possível preparar a conclusão local.");
      try { await gravarRascunho(rascunho); }
      catch (erro) { finalizacaoRef.current = anterior; throw erro; }
      setFinalizacao(conclusao);
      setMensagem("Encerramento protegido no aparelho. O treino aguarda confirmação do servidor e manterá este horário, mesmo offline.");
      void sincronizar();
    } catch (erro) {
      avisar(
        "Erro ao finalizar",
        erro instanceof Error
          ? erro.message
          : "Não foi possível proteger o encerramento neste aparelho. Tente novamente.",
      );
    } finally {
      setSalvando(false);
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
        {sessao &&
        (finalizacao || restaurado ||
          !online ||
          erroSincronizacao ||
          series.some((s) => s.pendente)) ? (
          <View style={[estilos.cartao, { borderColor: "#547563" }]}>
            <Text style={[estilos.tituloCartao, { color: corTema }]}>
              ↻ {restaurado ? "Treino recuperado" : "Proteção do treino"}
            </Text>
            <Text style={estilos.secundario}>
              {totalSeriesConcluidas} de {series.length} séries concluídas ·{" "}
              {progressoPercentual}%
            </Text>
            <Text style={estilos.secundario}>
              {!online
                ? "Sem internet. Seus dados continuam guardados neste aparelho."
                : sincronizando
                  ? "Sincronizando com o Supabase..."
                  : series.some((s) => s.pendente)
                    ? `${series.filter((s) => s.pendente).length} alteração(ões) aguardando envio.`
                    : finalizacao ? "Encerramento aguardando confirmação. Você pode sair desta tela; os dados permanecem protegidos." : "Treino salvo e sincronizado."}
            </Text>
            {erroSincronizacao ? (
              <Text style={estilos.aviso}>{erroSincronizacao}</Text>
            ) : null}
            {conflitoRemoto && !bloqueioSessao ? (
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
              onPress={iniciarSessao}
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
              <CronometroTreino inicio={sessao.started_at} fim={finalizacao?.finishedAt} ativo={estaEmFoco} cor={corTema} />
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
            <PainelDescanso descanso={descanso} ativo={estaEmFoco} bloqueado={Boolean(finalizacao) || bloqueioSessao} cor={corTema} onAlterar={alterarDescanso} onPreferencia={mudarPreferenciaDescanso} />
            <Text style={estilos.tituloSecao}>Séries do treino</Text>
            {erroReferencia ? <Text style={estilos.secundario}>{erroReferencia}</Text> : null}
            {exercicios.map((exercicio) => <CartaoExercicioTreino key={exercicio.id} exercicio={exercicio}
              series={seriesPorExercicio.get(exercicio.id) ?? []} anterior={ultimasSeries[exercicio.id]}
              cor={corTema} proximaChave={proximaSerie?.chave} bloqueado={salvando || sincronizando || bloqueioSessao || Boolean(finalizacao)}
              chaveSalvando={chaveEmSalvamento} onCampo={atualizarCampo} onAlternar={alternarSerie} onCopiar={copiarUltimaSessao} />)}
            <View style={estilos.cartao}>
              <Text style={estilos.tituloCartao}>Intensidade da sessão</Text>
              <Text style={estilos.secundario}>
                A intensidade ajuda a escolher o MET para estimar calorias
                ativas. Não é uma medição exata.
              </Text>
              <View style={estilos.opcoesDescanso}>
                {(
                  [
                    ["leve", "Leve"],
                    ["moderada", "Moderada"],
                    ["intensa", "Intensa"],
                  ] as [IntensidadeTreino, string][]
                ).map(([valor, rotulo]) => (
                  <TouchableOpacity
                    key={valor}
                    disabled={Boolean(finalizacao)}
                    onPress={() => setIntensidade(valor)}
                    style={[
                      estilos.opcaoDescanso,
                      intensidade === valor && {
                        borderColor: corTema,
                        backgroundColor: `${corTema}20`,
                      },
                    ]}
                  >
                    <Text style={estilos.textoOpcao}>{rotulo}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!perfil ? (
                <Text style={estilos.aviso}>
                  Complete peso, altura, idade e sexo em Meu Perfil para estimar
                  as calorias. Você ainda poderá salvar o treino.
                </Text>
              ) : (
                <Text style={estilos.secundario}>
                  Perfil de cálculo disponível. As calorias serão calculadas ao
                  finalizar.
                </Text>
              )}
              <Text style={estilos.tituloCartao}>
                Como foi seu esforço? (opcional)
              </Text>
              <Text style={estilos.secundario}>
                Ajuda a personalizar sugestões futuras. Não há metas nem
                cobranças.
              </Text>
              <View style={estilos.opcoesDescanso}>
                {(
                  [
                    ["nao_informado", "Pular"],
                    ["leve", "Leve"],
                    ["adequado", "Adequado"],
                    ["intenso", "Intenso"],
                  ] as [EsforcoPercebido, string][]
                ).map(([valor, rotulo]) => (
                  <TouchableOpacity
                    key={valor}
                    disabled={Boolean(finalizacao)}
                    onPress={() => setEsforco(valor)}
                    style={[
                      estilos.opcaoDescanso,
                      esforco === valor && {
                        borderColor: corTema,
                        backgroundColor: `${corTema}20`,
                      },
                    ]}
                  >
                    <Text style={estilos.textoOpcao}>{rotulo}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                disabled={
                  salvando ||
                  chaveEmSalvamento !== null ||
                  sincronizando ||
                  bloqueioSessao ||
                  Boolean(finalizacao)
                }
                onPress={finalizarSessao}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
              >
                <Text style={estilos.textoPrimario}>
                  {salvando
                    ? "Salvando..."
                    : finalizacao ? "Encerramento aguardando confirmação" : "Finalizar e salvar treino"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
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
