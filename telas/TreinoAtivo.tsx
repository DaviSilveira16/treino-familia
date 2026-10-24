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
  TextInput,
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
const OPCOES_DESCANSO = [30, 60, 90, 120, 180] as const;

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
type SerieAtiva = {
  chave: string;
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  reps: string;
  weight_kg: string;
  concluida: boolean;
  registroId?: string;
  pendente?: "salvar" | "remover";
};
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

function formatarTempo(segundos: number) {
  const seguros = Math.max(0, Math.floor(segundos));
  const minutos = Math.floor(seguros / 60);
  return `${String(minutos).padStart(2, "0")}:${String(seguros % 60).padStart(2, "0")}`;
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
  const [duracaoDescanso, setDuracaoDescanso] = useState(90);
  const [fimDescanso, setFimDescanso] = useState<number | null>(null);
  const [descansoPausado, setDescansoPausado] = useState(false);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const [descansoConcluido, setDescansoConcluido] = useState(false);
  const [agora, setAgora] = useState(Date.now());
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

  /** A operação é gravada no aparelho antes de qualquer envio ao servidor. */
  const sincronizar = useCallback(
    async (permitirSobrescrever = false) => {
      if (sincronizandoRef.current || bloqueioSessao || !prontoRef.current)
        return;
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.onLine === false
      ) {
        setOnline(false);
        return;
      }
      const sessaoAtual = sessaoRef.current;
      const idUsuario = usuarioRef.current;
      if (
        !sessaoAtual ||
        sessaoAtual.plan_id !== planId ||
        !idUsuario ||
        !seriesRef.current.some((serie) => serie.pendente)
      )
        return;
      sincronizandoRef.current = true;
      setSincronizando(true);
      setErroSincronizacao("");
      if (!permitirSobrescrever) setConflitoRemoto(false);
      try {
        const { data: autenticado, error: erroAuth } =
          await supabase.auth.getUser();
        if (erroAuth || autenticado.user?.id !== idUsuario)
          throw new Error("Faça login novamente para sincronizar este treino.");
        const { data: situacao, error: erroSituacao } = await supabase
          .from("workout_sessions")
          .select("id, status, plan_id")
          .eq("id", sessaoAtual.id)
          .eq("user_id", idUsuario)
          .maybeSingle();
        if (erroSituacao) throw erroSituacao;
        if (
          !situacao ||
          situacao.status !== "em_andamento" ||
          situacao.plan_id !== planId
        ) {
          setBloqueioSessao(true);
          throw new Error(
            "Esta sessão foi encerrada ou alterada em outro aparelho. O rascunho local foi preservado; nenhuma série será sobrescrita automaticamente.",
          );
        }
        for (const item of seriesRef.current.filter(
          (serie) => serie.pendente,
        )) {
          const { data: existentes, error: erroBusca } = await supabase
            .from("workout_sets")
            .select("id, reps, weight_kg")
            .eq("user_id", idUsuario)
            .eq("session_id", sessaoAtual.id)
            .eq("exercise_id", item.exercise_id)
            .eq("set_number", item.set_number)
            .limit(2);
          if (erroBusca) throw erroBusca;
          if ((existentes ?? []).length > 1)
            throw new Error(
              "Existem séries duplicadas no servidor. A sincronização foi interrompida para preservar os dados.",
            );
          const existente = existentes?.[0];
          let registroId: string | undefined;
          if (item.pendente === "remover") {
            if (existente) {
              const { error } = await supabase
                .from("workout_sets")
                .delete()
                .eq("id", existente.id)
                .eq("session_id", sessaoAtual.id)
                .eq("user_id", idUsuario);
              if (error) throw error;
            }
          } else {
            const reps = Number(item.reps);
            const peso = Number(item.weight_kg.replace(",", "."));
            if (
              !Number.isInteger(reps) ||
              reps < 1 ||
              reps > 1000 ||
              !Number.isFinite(peso) ||
              peso < 0 ||
              peso > 2000
            ) {
              throw new Error(
                `Valores inválidos na série ${item.set_number} de ${item.exercise_name}.`,
              );
            }
            const dados = {
              user_id: idUsuario,
              session_id: sessaoAtual.id,
              exercise_id: item.exercise_id,
              exercise_name: item.exercise_name,
              set_number: item.set_number,
              reps,
              weight_kg: peso,
            };
            if (existente) {
              const iguais =
                Number(existente.reps) === reps &&
                Number(existente.weight_kg) === peso;
              if (!iguais && !permitirSobrescrever) {
                setConflitoRemoto(true);
                throw new Error(
                  `${item.exercise_name}, série ${item.set_number}: existem valores diferentes no Supabase. Escolha explicitamente se deseja enviar sua versão local.`,
                );
              }
              if (iguais) {
                // Uma resposta de sucesso pode ter se perdido: confirmar sem regravar.
                registroId = existente.id;
              } else {
                const { data, error } = await supabase
                  .from("workout_sets")
                  .update(dados)
                  .eq("id", existente.id)
                  .eq("user_id", idUsuario)
                  .select("id")
                  .single();
                if (error) throw error;
                registroId = data.id;
              }
            } else {
              // O UUID é persistido antes da tentativa: repetir o envio é idempotente por PK.
              const { data, error } = await supabase
                .from("workout_sets")
                .upsert({ id: item.registroId, ...dados }, { onConflict: "id" })
                .select("id")
                .single();
              if (error) throw error;
              registroId = data.id;
            }
          }
          // Não confirma uma operação se o usuário alterou a série durante o envio.
          const atuais = seriesRef.current.map((serie) =>
            serie.chave === item.chave &&
            serie.pendente === item.pendente &&
            serie.reps === item.reps &&
            serie.weight_kg === item.weight_kg
              ? {
                  ...serie,
                  registroId:
                    item.pendente === "remover" ? undefined : registroId,
                  pendente: undefined,
                }
              : serie,
          );
          seriesRef.current = atuais;
          setSeries(atuais);
          await salvarLocal(atuais);
        }
        setOnline(true);
        setConflitoRemoto(false);
        setMensagem("✓ Séries sincronizadas com o Supabase.");
      } catch (erro) {
        setErroSincronizacao(
          erro instanceof Error
            ? erro.message
            : "Falha ao sincronizar. Os dados locais foram preservados.",
        );
      } finally {
        sincronizandoRef.current = false;
        setSincronizando(false);
      }
    },
    [bloqueioSessao, planId, salvarLocal],
  );

  // Grava também mudanças de carga/repetições ainda não concluídas.
  useEffect(() => {
    if (!prontoRef.current || !sessao) return;
    salvarLocal().catch(() =>
      setErroSincronizacao(
        "Não foi possível salvar o rascunho no aparelho. Verifique o armazenamento.",
      ),
    );
  }, [series, sessao, exercicios, intensidade, esforco, salvarLocal]);

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
  useEffect(() => {
    if (sessao && series.some((serie) => serie.pendente)) void sincronizar();
  }, [sessao, series, sincronizar]);
  useEffect(() => {
    if (!sessao || !series.some((serie) => serie.pendente)) return;
    const intervalo = setInterval(() => {
      void sincronizar();
    }, 12000);
    return () => clearInterval(intervalo);
  }, [sessao, series, sincronizar]);

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
      const sessaoUsuario = { user: usuarioEmCache };
      setUsuarioId(idUsuario);
      setPerfil(
        lerPerfil(
          (sessaoUsuario.user.user_metadata ?? {}) as Record<string, unknown>,
        ),
      );

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
          setDuracaoDescanso(tempo);
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  useEffect(() => {
    // A tela inativa não precisa redesenhar centenas de controles a cada segundo.
    if (!sessao || !estaEmFoco) return;
    setAgora(Date.now());
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [sessao, estaEmFoco]);
  useEffect(() => {
    if (!estaEmFoco || fimDescanso === null || descansoPausado) return;
    const atualizar = () => {
      const faltam = Math.max(0, Math.ceil((fimDescanso - Date.now()) / 1000));
      setSegundosRestantes(faltam);
      if (faltam === 0) {
        setFimDescanso(null);
        setDescansoPausado(false);
        setDescansoConcluido(true);
        setMensagem("✓ Descanso concluído. Pode continuar o treino.");
      }
    };
    atualizar();
    const intervalo = setInterval(atualizar, 1000);
    return () => clearInterval(intervalo);
  }, [fimDescanso, descansoPausado, estaEmFoco]);

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
  const duracaoAtual = sessao
    ? Math.max(
        0,
        Math.floor((agora - new Date(sessao.started_at).getTime()) / 60000),
      )
    : 0;

  async function iniciarSessao() {
    if (!usuarioId || !exercicios.length) return;
    setSalvando(true);
    try {
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
      setAgora(Date.now());
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

  function atualizarCampo(
    chave: string,
    campo: "reps" | "weight_kg",
    valor: string,
  ) {
    setSeries((atuais) =>
      atuais.map((item) =>
        item.chave === chave ? { ...item, [campo]: valor } : item,
      ),
    );
  }

  function iniciarDescanso() {
    setDescansoConcluido(false);
    setSegundosRestantes(duracaoDescanso);
    setDescansoPausado(false);
    setFimDescanso(Date.now() + duracaoDescanso * 1000);
  }
  function pausarDescanso() {
    if (fimDescanso !== null)
      setSegundosRestantes(
        Math.max(0, Math.ceil((fimDescanso - Date.now()) / 1000)),
      );
    setFimDescanso(null);
    setDescansoPausado(true);
  }
  function continuarDescanso() {
    if (segundosRestantes > 0)
      setFimDescanso(Date.now() + segundosRestantes * 1000);
    setDescansoPausado(false);
  }
  function pularDescanso() {
    setDescansoConcluido(false);
    setFimDescanso(null);
    setSegundosRestantes(0);
    setDescansoPausado(false);
  }

  function mudarPreferenciaDescanso(valor: number) {
    setDuracaoDescanso(valor);
    setDescansoConcluido(false);
    if (fimDescanso !== null) {
      setFimDescanso(Date.now() + valor * 1000);
    }
    setSegundosRestantes(valor);
    AsyncStorage.setItem(CHAVE_PREFERENCIA_DESCANSO, String(valor)).catch(
      () => {},
    );
  }

  function ajustarNumero(
    serie: SerieAtiva,
    campo: "reps" | "weight_kg",
    delta: number,
  ) {
    if (serie.concluida || chaveEmSalvamento !== null || salvando) return;
    const valorAtual = Number(serie[campo].replace(",", "."));
    const base = Number.isFinite(valorAtual) ? valorAtual : 0;
    const minimo = campo === "reps" ? 1 : 0;
    const maximo = campo === "reps" ? 1000 : 2000;
    const proximo = Math.max(
      minimo,
      Math.min(maximo, Math.round((base + delta) * 10) / 10),
    );
    atualizarCampo(serie.chave, campo, String(proximo));
  }

  async function alternarSerie(serie: SerieAtiva) {
    if (!sessao || !usuarioId || bloqueioSessao) {
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
      setChaveEmSalvamento(null);
    }
    void sincronizar();
  }

  async function finalizarSessao() {
    if (!sessao || !usuarioId || bloqueioSessao) return;
    if (
      sincronizandoRef.current ||
      seriesRef.current.some((item) => item.pendente)
    ) {
      avisar(
        "Sincronização pendente",
        "Conecte-se à internet e toque em Sincronizar agora antes de finalizar. Nenhum dado local será descartado.",
      );
      return;
    }
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

      // Primeiro marca a sessão como concluída usando apenas colunas básicas.
      // Assim, a sessão não fica presa como "em_andamento" caso falte alguma
      // coluna opcional da migração de métricas/calorias.
      const { data: sessaoConcluida, error: erroConclusao } = await supabase
        .from("workout_sessions")
        .update({
          finished_at: final.toISOString(),
          status: "concluido",
          notes: `Treino concluído no modo ativo${esforco !== "nao_informado" ? `;esforco_percebido=${esforco}` : ""}`,
        })
        .eq("id", sessao.id)
        .eq("user_id", usuarioId)
        .select("id, status")
        .maybeSingle();

      if (erroConclusao) throw erroConclusao;
      if (!sessaoConcluida) {
        throw new Error(
          "O banco não confirmou a conclusão desta sessão. Confira se você está conectado e tente finalizar novamente.",
        );
      }
      // Uma gravação confirmada invalida o pequeno cache de navegação.
      registrarMudancaDeDados();

      let erroDetalhes: string | null = null;
      const { error: erroMetadados } = await supabase
        .from("workout_sessions")
        .update({
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
        })
        .eq("id", sessao.id)
        .eq("user_id", usuarioId);
      if (erroMetadados) erroDetalhes = erroMetadados.message;

      pularDescanso();
      prontoRef.current = false;
      await apagarRascunho(usuarioId, planId).catch(() => {});
      setSessao(null);
      const resumo = `Duração: ${duracaoMinutos.toLocaleString("pt-BR")} min\nExercícios: ${estimativa?.quantidadeExercicios ?? exerciciosFeitos.size}\nSéries concluídas: ${estimativa?.quantidadeSeries ?? totalSeriesConcluidas}\nRepetições: ${estimativa?.repeticoesTotais ?? seriesFeitas.reduce((soma, serie) => soma + (Number(serie.reps) || 0), 0)}\n${estimativa ? `Calorias ativas estimadas: ${estimativa.caloriasAtivas} kcal\nMET: ${estimativa.met}` : "Calorias não calculadas: confira os dados do perfil."}`;
      if (erroDetalhes) {
        avisar(
          "Treino concluído",
          `${resumo}\n\nO treino foi finalizado e já deve aparecer na Frequência. Alguns detalhes de duração/calorias não foram salvos. Execute a migração SQL atualizada.\n\nDetalhe: ${erroDetalhes}`,
        );
      } else {
        avisar(
          "Treino concluído",
          `${resumo}\n\nO registro foi salvo e deve aparecer na Frequência e na Evolução dos treinos. A estimativa não é uma medição exata.`,
        );
      }
      onVoltar();
    } catch (erro) {
      avisar(
        "Erro ao finalizar",
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar o fim da sessão.",
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
        (restaurado ||
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
                    : "Treino salvo e sincronizado."}
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
            series.some((s) => s.pendente) ? (
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
              <Text style={[estilos.cronometroGrande, { color: corTema }]}>
                {formatarTempo(
                  duracaoAtual * 60 +
                    (Math.floor(
                      (agora - new Date(sessao.started_at).getTime()) / 1000,
                    ) %
                      60),
                )}
              </Text>
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
            <View style={estilos.cartao}>
              <Text style={estilos.tituloCartao}>Cronômetro de descanso</Text>
              <Text style={[estilos.cronometroDescanso, { color: corTema }]}>
                {formatarTempo(segundosRestantes)}
              </Text>
              {descansoConcluido ? (
                <Text style={[estilos.descansoPronto, { color: corTema }]}>
                  ✓ Descanso concluído · pode continuar
                </Text>
              ) : null}
              <View style={estilos.opcoesDescanso}>
                {OPCOES_DESCANSO.map((valor) => (
                  <TouchableOpacity
                    key={valor}
                    accessibilityRole="button"
                    accessibilityLabel={`Descanso de ${valor} segundos`}
                    accessibilityState={{ selected: duracaoDescanso === valor }}
                    onPress={() => mudarPreferenciaDescanso(valor)}
                    style={[
                      estilos.opcaoDescanso,
                      duracaoDescanso === valor && {
                        borderColor: corTema,
                        backgroundColor: `${corTema}20`,
                      },
                    ]}
                  >
                    <Text style={estilos.textoOpcao}>{valor}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={estilos.linhaBotoes}>
                {descansoPausado ? (
                  <TouchableOpacity
                    style={estilos.botaoSecundario}
                    onPress={continuarDescanso}
                  >
                    <Text style={estilos.textoBotaoSecundario}>Continuar</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={estilos.botaoSecundario}
                    onPress={pausarDescanso}
                    disabled={fimDescanso === null}
                  >
                    <Text style={estilos.textoBotaoSecundario}>Pausar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={estilos.botaoSecundario}
                  onPress={iniciarDescanso}
                >
                  <Text style={estilos.textoBotaoSecundario}>Reiniciar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={estilos.botaoSecundario}
                  onPress={pularDescanso}
                >
                  <Text style={estilos.textoBotaoSecundario}>Pular</Text>
                </TouchableOpacity>
              </View>
              <Text style={estilos.secundario}>
                Ao concluir uma série, o descanso começa automaticamente. Seu
                tempo preferido fica salvo neste aparelho.
              </Text>
            </View>
            <Text style={estilos.tituloSecao}>Séries do treino</Text>
            {exercicios.map((exercicio) => (
              <View key={exercicio.id} style={estilos.cartaoExercicio}>
                <Text style={estilos.tituloCartao}>{exercicio.name}</Text>
                <Text style={estilos.secundario}>
                  {
                    series.filter(
                      (item) =>
                        item.exercise_id === exercicio.id && item.concluida,
                    ).length
                  }
                  /
                  {
                    series.filter((item) => item.exercise_id === exercicio.id)
                      .length
                  }{" "}
                  séries concluídas
                </Text>
                <Text style={estilos.secundario}>
                  {exercicio.sets_goal} séries previstas · {exercicio.reps_goal}{" "}
                  repetições
                </Text>
                {series
                  .filter((item) => item.exercise_id === exercicio.id)
                  .map((serie) => (
                    <View
                      key={serie.chave}
                      style={[
                        estilos.cartaoSerie,
                        serie.concluida && {
                          borderColor: corTema,
                          backgroundColor: `${corTema}12`,
                        },
                        !serie.concluida &&
                          proximaSerie?.chave === serie.chave && {
                            borderColor: `${corTema}80`,
                          },
                      ]}
                    >
                      <Text style={estilos.rotulo}>
                        Série {serie.set_number}
                      </Text>
                      <View style={estilos.linhaCampos}>
                        <View style={estilos.campo}>
                          <Text style={estilos.rotuloCampo}>
                            Repetições realizadas
                          </Text>
                          <TextInput
                            style={estilos.input}
                            value={serie.reps}
                            onChangeText={(v) =>
                              atualizarCampo(serie.chave, "reps", v)
                            }
                            keyboardType="number-pad"
                            editable={
                              !serie.concluida &&
                              !chaveEmSalvamento &&
                              !bloqueioSessao
                            }
                          />
                          <View style={estilos.controlesRapidos}>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Diminuir repetições da série ${serie.set_number}`}
                              disabled={
                                serie.concluida ||
                                chaveEmSalvamento !== null ||
                                salvando ||
                                bloqueioSessao
                              }
                              onPress={() => ajustarNumero(serie, "reps", -1)}
                              style={estilos.botaoAjuste}
                            >
                              <Text style={estilos.textoAjuste}>−1</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Aumentar repetições da série ${serie.set_number}`}
                              disabled={
                                serie.concluida ||
                                chaveEmSalvamento !== null ||
                                salvando ||
                                bloqueioSessao
                              }
                              onPress={() => ajustarNumero(serie, "reps", 1)}
                              style={estilos.botaoAjuste}
                            >
                              <Text style={estilos.textoAjuste}>+1</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={estilos.campo}>
                          <Text style={estilos.rotuloCampo}>Carga (kg)</Text>
                          <TextInput
                            style={estilos.input}
                            value={serie.weight_kg}
                            onChangeText={(v) =>
                              atualizarCampo(serie.chave, "weight_kg", v)
                            }
                            keyboardType="decimal-pad"
                            editable={
                              !serie.concluida &&
                              !chaveEmSalvamento &&
                              !bloqueioSessao
                            }
                          />
                          <View style={estilos.controlesRapidos}>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Diminuir carga da série ${serie.set_number} em 2,5 kg`}
                              disabled={
                                serie.concluida ||
                                chaveEmSalvamento !== null ||
                                salvando ||
                                bloqueioSessao
                              }
                              onPress={() =>
                                ajustarNumero(serie, "weight_kg", -2.5)
                              }
                              style={estilos.botaoAjuste}
                            >
                              <Text style={estilos.textoAjuste}>−2,5</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Aumentar carga da série ${serie.set_number} em 2,5 kg`}
                              disabled={
                                serie.concluida ||
                                chaveEmSalvamento !== null ||
                                salvando ||
                                bloqueioSessao
                              }
                              onPress={() =>
                                ajustarNumero(serie, "weight_kg", 2.5)
                              }
                              style={estilos.botaoAjuste}
                            >
                              <Text style={estilos.textoAjuste}>+2,5</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        disabled={
                          chaveEmSalvamento !== null ||
                          salvando ||
                          sincronizando ||
                          bloqueioSessao
                        }
                        onPress={() => alternarSerie(serie)}
                        style={[
                          estilos.botaoSerie,
                          {
                            backgroundColor: serie.concluida
                              ? "#26342B"
                              : corTema,
                          },
                        ]}
                      >
                        {chaveEmSalvamento === serie.chave ? (
                          <ActivityIndicator
                            color={serie.concluida ? corTema : "#101312"}
                          />
                        ) : (
                          <Text
                            style={[
                              estilos.textoPrimario,
                              serie.concluida && { color: corTema },
                            ]}
                          >
                            {serie.pendente
                              ? serie.pendente === "salvar"
                                ? "✓ Concluída · aguardando envio"
                                : "↻ Desmarcada · aguardando envio"
                              : serie.concluida
                                ? "✓ Série concluída · desfazer"
                                : "Marcar série concluída"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            ))}
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
                  series.some((serie) => serie.pendente)
                }
                onPress={finalizarSessao}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
              >
                <Text style={estilos.textoPrimario}>
                  {salvando
                    ? "Salvando..."
                    : series.some((serie) => serie.pendente)
                      ? "Sincronize as séries para finalizar"
                      : "Finalizar e salvar treino"}
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
