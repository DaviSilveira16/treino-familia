import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";
import {
  estimarCaloriasAtivasTreino,
  type DadosCalculoTreino,
  type IntensidadeTreino,
  type SerieCalculoTreino,
  type SexoTreino,
} from "../servicos/caloriasTreino";

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
  const [agora, setAgora] = useState(Date.now());
  const [mensagem, setMensagem] = useState("");
  const [outroTreinoAtivo, setOutroTreinoAtivo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setMensagem("");
    try {
      const { data: sessaoUsuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !sessaoUsuario.user)
        throw new Error("Entre novamente na sua conta.");
      const idUsuario = sessaoUsuario.user.id;
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
        setExercicios([]);
        setSeries([]);
        setMensagem(
          "Este treino ainda não tem exercícios. Adicione exercícios em Meus treinos.",
        );
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
        setSessao(null);
        setSeries(listas);
        return;
      }

      setSessao(ativa);
      const { data: salvas, error: erroSalvas } = await supabase
        .from("workout_sets")
        .select("id, exercise_id, exercise_name, set_number, reps, weight_kg")
        .eq("user_id", idUsuario)
        .eq("session_id", ativa.id)
        .order("set_number", { ascending: true });
      if (erroSalvas) throw erroSalvas;
      const registros = (salvas ?? []) as RegistroSalvo[];
      setSeries(
        listas.map((serie) => {
          const salva = registros.find(
            (item) =>
              item.exercise_id === serie.exercise_id &&
              Number(item.set_number) === serie.set_number,
          );
          return salva
            ? {
                ...serie,
                reps: String(salva.reps),
                weight_kg: String(salva.weight_kg),
                concluida: true,
                registroId: salva.id,
              }
            : serie;
        }),
      );
      setMensagem(
        "Treino em andamento recuperado. Suas séries concluídas foram carregadas.",
      );
    } catch (erro) {
      setMensagem(
        erro instanceof Error
          ? erro.message
          : "Não foi possível carregar o treino.",
      );
    } finally {
      setCarregando(false);
    }
  }, [planId]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    if (!sessao) return;
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [sessao]);
  useEffect(() => {
    if (fimDescanso === null || descansoPausado) return;
    const atualizar = () => {
      const faltam = Math.max(0, Math.ceil((fimDescanso - Date.now()) / 1000));
      setSegundosRestantes(faltam);
      if (faltam === 0) {
        setFimDescanso(null);
        setDescansoPausado(false);
        setMensagem("Descanso concluído. Pode continuar o treino.");
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert("Descanso concluído\n\nPode continuar o treino.");
        } else {
          Alert.alert("Descanso concluído", "Pode continuar o treino.");
        }
      }
    };
    atualizar();
    const intervalo = setInterval(atualizar, 1000);
    return () => clearInterval(intervalo);
  }, [fimDescanso, descansoPausado]);

  const totalSeriesConcluidas = useMemo(
    () => series.filter((item) => item.concluida).length,
    [series],
  );
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
    setFimDescanso(null);
    setSegundosRestantes(0);
    setDescansoPausado(false);
  }

  async function alternarSerie(serie: SerieAtiva) {
    if (!sessao || !usuarioId) {
      avisar(
        "Inicie o treino",
        "Toque em Iniciar treino antes de marcar séries concluídas.",
      );
      return;
    }
    setChaveEmSalvamento(serie.chave);
    try {
      if (serie.concluida && serie.registroId) {
        const { error } = await supabase
          .from("workout_sets")
          .delete()
          .eq("id", serie.registroId)
          .eq("session_id", sessao.id)
          .eq("user_id", usuarioId);
        if (error) throw error;
        setSeries((atuais) =>
          atuais.map((item) =>
            item.chave === serie.chave
              ? { ...item, concluida: false, registroId: undefined }
              : item,
          ),
        );
        setMensagem("Série desmarcada e removida somente desta sessão.");
        return;
      }
      const reps = Number(serie.reps);
      const peso = Number(serie.weight_kg.replace(",", "."));
      if (
        !Number.isInteger(reps) ||
        reps < 1 ||
        reps > 1000 ||
        !Number.isFinite(peso) ||
        peso < 0 ||
        peso > 2000
      ) {
        avisar(
          "Dados inválidos",
          "Informe repetições inteiras positivas e uma carga entre 0 e 2.000 kg.",
        );
        return;
      }
      const { data, error } = await supabase
        .from("workout_sets")
        .insert({
          user_id: usuarioId,
          session_id: sessao.id,
          exercise_id: serie.exercise_id,
          exercise_name: serie.exercise_name,
          set_number: serie.set_number,
          reps,
          weight_kg: peso,
        })
        .select("id")
        .single();
      if (error || !data)
        throw error ?? new Error("Não foi possível salvar a série.");
      setSeries((atuais) =>
        atuais.map((item) =>
          item.chave === serie.chave
            ? {
                ...item,
                reps: String(reps),
                weight_kg: String(peso),
                concluida: true,
                registroId: data.id,
              }
            : item,
        ),
      );
      setMensagem(
        `${serie.exercise_name}: série ${serie.set_number} salva no registro deste treino.`,
      );
      const ultimaChave = series[series.length - 1]?.chave;
      if (serie.chave !== ultimaChave) iniciarDescanso();
    } catch (erro) {
      avisar(
        "Erro ao salvar série",
        erro instanceof Error ? erro.message : "Tente novamente.",
      );
    } finally {
      setChaveEmSalvamento(null);
    }
  }

  async function finalizarSessao() {
    if (!sessao || !usuarioId) return;
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
          notes: "Treino concluído no modo ativo",
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
              <View style={estilos.opcoesDescanso}>
                {[30, 60, 90, 120, 180].map((valor) => (
                  <TouchableOpacity
                    key={valor}
                    onPress={() => {
                      setDuracaoDescanso(valor);
                      if (fimDescanso !== null)
                        setFimDescanso(Date.now() + valor * 1000);
                      setSegundosRestantes(valor);
                    }}
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
                Ao concluir uma série, o descanso começa automaticamente.
              </Text>
            </View>
            <Text style={estilos.tituloSecao}>Séries do treino</Text>
            {exercicios.map((exercicio) => (
              <View key={exercicio.id} style={estilos.cartaoExercicio}>
                <Text style={estilos.tituloCartao}>{exercicio.name}</Text>
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
                            editable={!serie.concluida && !chaveEmSalvamento}
                          />
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
                            editable={!serie.concluida && !chaveEmSalvamento}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        disabled={chaveEmSalvamento !== null || salvando}
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
                            {serie.concluida
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
              <TouchableOpacity
                disabled={salvando}
                onPress={finalizarSessao}
                style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
              >
                <Text style={estilos.textoPrimario}>
                  {salvando ? "Salvando..." : "Finalizar e salvar treino"}
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
  campo: { flex: 1, gap: 6 },
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
