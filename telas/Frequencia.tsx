import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { supabase } from "../supabase";
import {
  estimarCaloriasAtivas,
  type IntensidadeCardio,
} from "../servicos/caloriasCardio";

type Treino = {
  id: string;
  name: string;
};

type Sessao = {
  id: string;
  plan_id: string | null;
  started_at: string;
  notes: string | null;
};

type CardioModelo = {
  id: string;
  nome: string;
  tipo: string;
  duracao_min: number | null;
  distancia_km: number | null;
  calorias: number | null;
  observacoes: string | null;
};
type SessaoCardio = {
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
  cadence_rpm?: number | null;
  weight_kg_snapshot?: number | null;
  met_value?: number | null;
  notes: string | null;
};
type Props = {
  onVoltar: () => void;
  corTema?: string;
};

const nomesMeses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];

function dataLocal(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
function dataDaSessao(valor: string) {
  return dataLocal(new Date(valor));
}

function lerNumero(valor: string): number | null {
  if (!valor.trim()) return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function textoTipo(tipo: string) {
  return tipo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function Frequencia({ onVoltar, corTema = "#35D07F" }: Props) {
  const hoje = new Date();
  const [usuarioId, setUsuarioId] = useState("");
  const [mesAtual, setMesAtual] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1),
  );
  const [dataSelecionada, setDataSelecionada] = useState(dataLocal(hoje));
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [modelosCardio, setModelosCardio] = useState<CardioModelo[]>([]);
  const [sessoesCardio, setSessoesCardio] = useState<SessaoCardio[]>([]);
  const [treinoSelecionado, setTreinoSelecionado] = useState("");
  const [cardioSelecionado, setCardioSelecionado] = useState("");
  const [pesoUsuario, setPesoUsuario] = useState<number | null>(null);
  const [duracaoCardio, setDuracaoCardio] = useState("");
  const [distanciaCardio, setDistanciaCardio] = useState("");
  const [intensidadeCardio, setIntensidadeCardio] =
    useState<IntensidadeCardio | null>(null);
  const [inclinacaoCardio, setInclinacaoCardio] = useState("");
  const [frequenciaCardiaca, setFrequenciaCardiaca] = useState("");
  const [velocidadeCardio, setVelocidadeCardio] = useState("");
  const [cadenciaBicicleta, setCadenciaBicicleta] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [mensagemStatus, setMensagemStatus] = useState("");
  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: usuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !usuario.user) {
        Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
        return;
      }
      setUsuarioId(usuario.user.id);
      const pesoPerfil = Number(usuario.user.user_metadata?.peso_kg);
      setPesoUsuario(
        Number.isFinite(pesoPerfil) && pesoPerfil >= 20 && pesoPerfil <= 400
          ? pesoPerfil
          : null,
      );
      const [
        resultadoTreinos,
        resultadoSessoes,
        resultadoModelosCardio,
        resultadoSessoesCardio,
      ] = await Promise.all([
        supabase
          .from("workout_plans")
          .select("id, name")
          .eq("user_id", usuario.user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("workout_sessions")
          .select("id, plan_id, started_at, notes")
          .eq("user_id", usuario.user.id)
          .order("started_at", { ascending: false }),
        supabase
          .from("cardio_activities")
          .select(
            "id, nome, tipo, duracao_min, distancia_km, calorias, observacoes",
          )
          .eq("user_id", usuario.user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("cardio_sessions")
          .select(
            "id, activity_name, activity_type, started_at, duration_minutes, distance_km, calories, active_calories, intensity, incline_percent, heart_rate_avg, speed_kmh, cadence_rpm, weight_kg_snapshot, met_value, notes",
          )
          .eq("user_id", usuario.user.id)
          .order("started_at", { ascending: false }),
      ]);
      if (resultadoTreinos.error) {
        Alert.alert("Erro", resultadoTreinos.error.message);
        return;
      }
      if (resultadoSessoes.error) {
        Alert.alert("Erro", resultadoSessoes.error.message);
        return;
      }
      if (resultadoModelosCardio.error) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar os cardios. Execute o SQL de integração: ${resultadoModelosCardio.error.message}`,
        );
        return;
      }
      if (resultadoSessoesCardio.error) {
        Alert.alert(
          "Erro",
          `Não foi possível carregar o histórico de cardio: ${resultadoSessoesCardio.error.message}`,
        );
        return;
      }
      setTreinos((resultadoTreinos.data ?? []) as Treino[]);
      setSessoes((resultadoSessoes.data ?? []) as Sessao[]);
      setModelosCardio((resultadoModelosCardio.data ?? []) as CardioModelo[]);
      setSessoesCardio((resultadoSessoesCardio.data ?? []) as SessaoCardio[]);
    } catch {
      Alert.alert("Erro", "Não foi possível carregar o calendário.");
    } finally {
      setCarregando(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      carregarDados();
    }, [carregarDados]),
  );
  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const quantidadeDias = new Date(ano, mes + 1, 0).getDate();
  const diasDoCalendario = [
    ...Array.from({ length: primeiroDia }, () => null),
    ...Array.from({ length: quantidadeDias }, (_, indice) => indice + 1),
  ];
  const sessoesDoDia = sessoes.filter(
    (sessao) => dataDaSessao(sessao.started_at) === dataSelecionada,
  );
  const cardiosDoDia = sessoesCardio.filter(
    (sessao) => dataDaSessao(sessao.started_at) === dataSelecionada,
  );
  const modeloCardioSelecionado = modelosCardio.find(
    (item) => item.id === cardioSelecionado,
  );
  const duracaoNumerica = lerNumero(duracaoCardio);
  const distanciaNumerica = lerNumero(distanciaCardio);
  const inclinacaoNumerica = lerNumero(inclinacaoCardio);
  const velocidadeNumerica = lerNumero(velocidadeCardio);
  const estimativaCalorias =
    modeloCardioSelecionado &&
    pesoUsuario !== null &&
    duracaoNumerica !== null &&
    intensidadeCardio !== null
      ? estimarCaloriasAtivas({
          tipo: modeloCardioSelecionado.tipo,
          intensidade: intensidadeCardio,
          pesoKg: pesoUsuario,
          duracaoMinutos: duracaoNumerica,
          velocidadeKmh:
            velocidadeNumerica !== null && Number.isFinite(velocidadeNumerica)
              ? velocidadeNumerica
              : null,
          inclinacaoPercentual:
            inclinacaoNumerica !== null && Number.isFinite(inclinacaoNumerica)
              ? inclinacaoNumerica
              : null,
        })
      : null;
  const diasTreinados = new Set([
    ...sessoes
      .filter((sessao) => sessao.plan_id !== null)
      .map((sessao) => dataDaSessao(sessao.started_at)),
    ...sessoesCardio.map((sessao) => dataDaSessao(sessao.started_at)),
  ]);
  const datasDoMes = [
    ...sessoes
      .filter((sessao) => {
        const data = new Date(sessao.started_at);
        return (
          sessao.plan_id !== null &&
          data.getFullYear() === ano &&
          data.getMonth() === mes
        );
      })
      .map((sessao) => dataDaSessao(sessao.started_at)),
    ...sessoesCardio
      .filter((sessao) => {
        const data = new Date(sessao.started_at);
        return data.getFullYear() === ano && data.getMonth() === mes;
      })
      .map((sessao) => dataDaSessao(sessao.started_at)),
  ];
  const frequenciaMensal = new Set(datasDoMes).size;
  function mudarMes(direcao: number) {
    setMesAtual(new Date(ano, mes + direcao, 1));
  }
  async function registrarTreino() {
    if (!usuarioId || !treinoSelecionado || !dataSelecionada) {
      Alert.alert("Atenção", "Selecione um treino para registrar.");
      return;
    }
    if (dataSelecionada > dataLocal(new Date())) {
      Alert.alert(
        "Data inválida",
        "Você não pode registrar um treino em uma data futura.",
      );
      return;
    }
    setSalvando(true);
    try {
      const [anoSelecionado, mesSelecionado, diaSelecionado] = dataSelecionada
        .split("-")
        .map(Number);
      const inicioDia = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado,
        0,
        0,
        0,
        0,
      ).toISOString();
      const fimDia = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado + 1,
        0,
        0,
        0,
        0,
      ).toISOString();
      const { data: sessoesExistentes, error: erroConsulta } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, started_at")
        .eq("user_id", usuarioId)
        .gte("started_at", inicioDia)
        .lt("started_at", fimDia);
      if (erroConsulta) {
        Alert.alert(
          "Erro ao verificar treino",
          "Não foi possível confirmar se esse treino já foi registrado. Tente novamente.",
        );
        return;
      }
      const existeTreinoNoDia = (sessoesExistentes ?? []).some(
        (sessao) => sessao.plan_id !== null,
      );

      if (existeTreinoNoDia) {
        await carregarDados();
        Alert.alert(
          "Treino já registrado",
          "Já existe um treino registrado nessa data. Para escolher outro, use o botão Excluir registro do dia.",
        );
        return;
      }
      const dataRegistro = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado,
        12,
        0,
        0,
        0,
      ).toISOString();
      const { data: novaSessao, error } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: usuarioId,
          plan_id: treinoSelecionado,
          started_at: dataRegistro,
          finished_at: dataRegistro,
          notes: "Treino registrado pelo calendário",
        })
        .select("id")
        .single();
      if (error || !novaSessao) {
        Alert.alert(
          "Erro ao registrar",
          error?.message ?? "Não foi possível criar a sessão.",
        );
        return;
      }

      const { data: exercicios, error: erroExercicios } = await supabase
        .from("exercises")
        .select("id, name, sets_goal, reps_goal")
        .eq("user_id", usuarioId)
        .eq("plan_id", treinoSelecionado)
        .order("position", { ascending: true });
      if (erroExercicios) {
        await supabase
          .from("workout_sessions")
          .delete()
          .eq("id", novaSessao.id)
          .eq("user_id", usuarioId);
        Alert.alert(
          "Erro ao registrar",
          `Não foi possível carregar os exercícios do treino: ${erroExercicios.message}`,
        );
        return;
      }

      const listaExercicios = exercicios ?? [];
      const { data: referencias, error: erroReferencias } =
        listaExercicios.length > 0
          ? await supabase
              .from("exercise_load_defaults")
              .select("exercise_id, set_number, reps, weight_kg")
              .eq("user_id", usuarioId)
              .in(
                "exercise_id",
                listaExercicios.map((exercicio) => exercicio.id),
              )
              .order("set_number", { ascending: true })
          : { data: [], error: null };
      if (erroReferencias) {
        await supabase
          .from("workout_sessions")
          .delete()
          .eq("id", novaSessao.id)
          .eq("user_id", usuarioId);
        Alert.alert(
          "Erro ao registrar",
          `Não foi possível carregar as cargas salvas: ${erroReferencias.message}`,
        );
        return;
      }

      const seriesDaSessao = listaExercicios.flatMap((exercicio) => {
        const seriesSalvas = (referencias ?? []).filter(
          (item) => item.exercise_id === exercicio.id,
        );
        const quantidade = Math.max(
          Number(exercicio.sets_goal) || 1,
          seriesSalvas.length,
          1,
        );
        const repeticoesPadrao =
          Number(String(exercicio.reps_goal ?? "8").match(/\d+/)?.[0] ?? 8) ||
          8;
        return Array.from({ length: quantidade }, (_, indice) => {
          const serie = seriesSalvas.find(
            (item) => Number(item.set_number) === indice + 1,
          );
          return {
            user_id: usuarioId,
            session_id: novaSessao.id,
            exercise_id: exercicio.id,
            exercise_name: exercicio.name,
            set_number: indice + 1,
            reps: Number(serie?.reps ?? repeticoesPadrao),
            weight_kg: Number(serie?.weight_kg ?? 0),
          };
        });
      });

      if (seriesDaSessao.length > 0) {
        const { error: erroSnapshot } = await supabase
          .from("workout_sets")
          .insert(seriesDaSessao);
        if (erroSnapshot) {
          await supabase
            .from("workout_sessions")
            .delete()
            .eq("id", novaSessao.id)
            .eq("user_id", usuarioId);
          Alert.alert(
            "Erro ao registrar",
            `O treino não foi concluído porque não foi possível salvar as cargas no histórico: ${erroSnapshot.message}`,
          );
          return;
        }
      }

      await carregarDados();
      setTreinoSelecionado("");
      Alert.alert(
        "Treino registrado",
        "O treino e uma cópia das cargas e exercícios foram salvos no histórico.",
      );
    } catch {
      Alert.alert("Erro", "Não foi possível registrar o treino.");
    } finally {
      setSalvando(false);
    }
  }
  function selecionarCardio(modelo: CardioModelo) {
    setCardioSelecionado(modelo.id);
    setDuracaoCardio(
      modelo.duracao_min == null ? "" : String(modelo.duracao_min),
    );
    setDistanciaCardio(
      modelo.distancia_km == null ? "" : String(modelo.distancia_km),
    );
    setIntensidadeCardio(null);
    setInclinacaoCardio("");
    setFrequenciaCardiaca("");
    setVelocidadeCardio("");
    setCadenciaBicicleta("");
  }

  async function registrarCardio() {
    if (!usuarioId || !cardioSelecionado || !dataSelecionada) {
      Alert.alert("Atenção", "Selecione um cardio para registrar.");
      return;
    }
    if (dataSelecionada > dataLocal(new Date())) {
      Alert.alert(
        "Data inválida",
        "Você não pode registrar cardio em uma data futura.",
      );
      return;
    }
    if (pesoUsuario === null) {
      Alert.alert(
        "Complete seu perfil",
        "Informe seu peso atual em Meu Perfil para calcular as calorias estimadas antes de registrar o cardio.",
      );
      return;
    }
    const modelo = modelosCardio.find((item) => item.id === cardioSelecionado);
    if (!modelo) {
      Alert.alert("Erro", "O cardio selecionado não foi encontrado.");
      return;
    }

    const duracao = lerNumero(duracaoCardio);
    const distancia = lerNumero(distanciaCardio);
    const inclinacao = lerNumero(inclinacaoCardio);
    const frequencia = lerNumero(frequenciaCardiaca);
    const velocidade = lerNumero(velocidadeCardio);
    const cadencia = lerNumero(cadenciaBicicleta);
    const nomeTipo = textoTipo(modelo.tipo);
    const eBicicleta = nomeTipo.includes("bicicleta");
    const eEsteira = nomeTipo.includes("esteira");
    const aceitaVelocidade =
      eEsteira ||
      nomeTipo.includes("caminhada") ||
      nomeTipo.includes("corrida");

    if (duracao === null || !Number.isFinite(duracao) || duracao <= 0) {
      Alert.alert(
        "Duração necessária",
        "Informe a duração do cardio em minutos.",
      );
      return;
    }
    if (intensidadeCardio === null) {
      Alert.alert(
        "Intensidade necessária",
        "Selecione a intensidade do cardio.",
      );
      return;
    }
    const camposNumericos = [
      ["distância", distancia, 0, 1000],
      ["inclinação", inclinacao, 0, 25],
      ["frequência cardíaca", frequencia, 30, 240],
      ["velocidade", velocidade, 0.1, 18],
      ["cadência", cadencia, 0.1, 250],
    ] as const;
    for (const [nomeCampo, valor, minimo, maximo] of camposNumericos) {
      if (
        valor !== null &&
        (!Number.isFinite(valor) || valor < minimo || valor > maximo)
      ) {
        Alert.alert(
          "Valor inválido",
          `Confira o campo ${nomeCampo}. Informe um valor entre ${minimo} e ${maximo}.`,
        );
        return;
      }
    }
    if (eEsteira && inclinacao !== null && inclinacao > 25) {
      Alert.alert("Inclinação inválida", "Use uma inclinação entre 0% e 25%.");
      return;
    }

    const estimativa = estimarCaloriasAtivas({
      tipo: modelo.tipo,
      intensidade: intensidadeCardio,
      pesoKg: pesoUsuario,
      duracaoMinutos: duracao,
      velocidadeKmh:
        aceitaVelocidade && velocidade !== null ? velocidade : null,
      inclinacaoPercentual: eEsteira && inclinacao !== null ? inclinacao : null,
    });
    if (!estimativa) {
      Alert.alert(
        "Não foi possível calcular",
        "Confira o peso no perfil e a duração do cardio.",
      );
      return;
    }

    setSalvando(true);
    try {
      const [anoSelecionado, mesSelecionado, diaSelecionado] = dataSelecionada
        .split("-")
        .map(Number);
      const dataRegistro = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado,
        12,
        0,
        0,
        0,
      ).toISOString();
      const { error } = await supabase.from("cardio_sessions").insert({
        user_id: usuarioId,
        activity_id: modelo.id,
        activity_name: modelo.nome,
        activity_type: modelo.tipo,
        started_at: dataRegistro,
        duration_minutes: duracao,
        distance_km: distancia,
        calories: estimativa.caloriasAtivas,
        active_calories: estimativa.caloriasAtivas,
        intensity: intensidadeCardio,
        incline_percent: eEsteira ? inclinacao : null,
        heart_rate_avg: frequencia,
        speed_kmh: aceitaVelocidade ? velocidade : null,
        cadence_rpm: eBicicleta ? cadencia : null,
        weight_kg_snapshot: pesoUsuario,
        met_value: estimativa.met,
        notes: modelo.observacoes,
      });
      if (error) throw error;
      setCardioSelecionado("");
      setDuracaoCardio("");
      setDistanciaCardio("");
      setInclinacaoCardio("");
      setFrequenciaCardiaca("");
      setVelocidadeCardio("");
      setCadenciaBicicleta("");
      await carregarDados();
      Alert.alert(
        "Cardio registrado",
        `Sessão salva com aproximadamente ${estimativa.caloriasAtivas} kcal ativas estimadas. O peso e o MET usados ficaram guardados neste registro; atualizar seu perfil não mudará esta estimativa.`,
      );
    } catch (erro) {
      Alert.alert(
        "Erro ao registrar cardio",
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar o cardio.",
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRegistroDoDia() {
    if (!usuarioId || sessoesDoDia.length === 0) {
      setMensagemStatus("Não há registro para excluir nesta data.");
      return;
    }

    setSalvando(true);
    setMensagemStatus("");

    try {
      const [anoSelecionado, mesSelecionado, diaSelecionado] = dataSelecionada
        .split("-")
        .map(Number);
      const inicioDia = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado,
        0,
        0,
        0,
        0,
      ).toISOString();
      const fimDia = new Date(
        anoSelecionado,
        mesSelecionado - 1,
        diaSelecionado + 1,
        0,
        0,
        0,
        0,
      ).toISOString();

      const { error } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("user_id", usuarioId)
        .gte("started_at", inicioDia)
        .lt("started_at", fimDia);

      if (error) {
        setMensagemStatus(
          `Não foi possível excluir o treino. Detalhes: ${error.message}`,
        );
        return;
      }
      const { error: erroCardios } = await supabase
        .from("cardio_sessions")
        .delete()
        .eq("user_id", usuarioId)
        .gte("started_at", inicioDia)
        .lt("started_at", fimDia);
      if (erroCardios) {
        setMensagemStatus(
          `O treino foi excluído, mas não foi possível excluir os cardios: ${erroCardios.message}`,
        );
        await carregarDados();
        return;
      }

      setTreinoSelecionado("");
      setCardioSelecionado("");
      setConfirmandoExclusao(false);
      await carregarDados();
      setMensagemStatus(
        "Registro do dia excluído. Agora você pode selecionar outro treino.",
      );
    } catch {
      setMensagemStatus("Ocorreu um erro ao excluir o registro do dia.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.textoSecundario}>Carregando calendário...</Text>
      </View>
    );
  }
  return (
    <View style={estilos.container}>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={estilos.conteudo}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Frequência</Text>
        <Text style={estilos.subtitulo}>
          Registre a musculação e o cardio que realmente realizou em cada data.
          Você pode registrar os dois no mesmo dia.
        </Text>
        <View style={estilos.cartaoResumo}>
          <Text style={[estilos.resumoNumero, { color: corTema }]}>
            {frequenciaMensal}
          </Text>
          <Text style={estilos.resumoTexto}>
            {frequenciaMensal === 1
              ? "dia treinado neste mês"
              : "dias treinados neste mês"}
          </Text>
        </View>
        <View style={estilos.cartaoCalendario}>
          <View style={estilos.navegacaoMes}>
            <TouchableOpacity
              style={estilos.botaoMes}
              onPress={() => mudarMes(-1)}
            >
              <Text style={[estilos.textoBotaoMes, { color: corTema }]}>‹</Text>
            </TouchableOpacity>
            <Text style={estilos.tituloMes}>
              {nomesMeses[mes]} {ano}
            </Text>
            <TouchableOpacity
              style={estilos.botaoMes}
              onPress={() => mudarMes(1)}
              disabled={ano === hoje.getFullYear() && mes >= hoje.getMonth()}
            >
              <Text
                style={[
                  estilos.textoBotaoMes,
                  {
                    color:
                      ano === hoje.getFullYear() && mes >= hoje.getMonth()
                        ? "#536057"
                        : corTema,
                  },
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>
          <View style={estilos.gradeCalendario}>
            {diasSemana.map((dia, indice) => (
              <View key={`${dia}-${indice}`} style={estilos.celula}>
                <Text style={estilos.nomeDiaSemana}>{dia}</Text>
              </View>
            ))}
            {diasDoCalendario.map((dia, indice) => {
              if (dia === null) {
                return <View key={`vazio-${indice}`} style={estilos.celula} />;
              }
              const data = dataLocal(new Date(ano, mes, dia));
              const treinado = diasTreinados.has(data);
              const selecionado = data === dataSelecionada;
              const eHoje = data === dataLocal(hoje);
              return (
                <View key={data} style={estilos.celula}>
                  <TouchableOpacity
                    style={[
                      estilos.diaCalendario,
                      treinado && estilos.diaTreinado,
                      selecionado && {
                        borderColor: corTema,
                        borderWidth: 2,
                      },
                      eHoje && !selecionado && estilos.diaHoje,
                    ]}
                    onPress={() => {
                      setDataSelecionada(data);
                      setTreinoSelecionado("");
                    }}
                  >
                    <Text
                      style={[
                        estilos.numeroDia,
                        treinado && { color: "#FFFFFF" },
                        selecionado && estilos.numeroSelecionado,
                      ]}
                    >
                      {dia}
                    </Text>
                    {treinado ? (
                      <View
                        style={[
                          estilos.indicadorTreino,
                          { backgroundColor: corTema },
                        ]}
                      />
                    ) : null}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          <View style={estilos.legenda}>
            <View
              style={[estilos.indicadorTreino, { backgroundColor: corTema }]}
            />
            <Text style={estilos.textoLegenda}>Dia com treino registrado</Text>
          </View>
        </View>
        <View style={estilos.cartaoRegistro}>
          <Text style={estilos.tituloRegistro}>Registrar treino</Text>
          <Text style={[estilos.dataRegistro, { color: corTema }]}>
            {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString(
              "pt-BR",
              {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              },
            )}
          </Text>
          {sessoesDoDia.some((sessao) => sessao.plan_id !== null) ? (
            <Text style={estilos.textoSecundario}>
              Já existe um treino registrado neste dia. Para escolher outro,
              exclua primeiro o registro abaixo.
            </Text>
          ) : treinos.length === 0 ? (
            <Text style={estilos.textoSecundario}>
              Você ainda não cadastrou treinos. Acesse Meus treinos para criar o
              primeiro.
            </Text>
          ) : (
            <>
              <Text style={estilos.rotulo}>Qual treino você realizou?</Text>
              {treinos.map((treino) => {
                const selecionado = treinoSelecionado === treino.id;
                return (
                  <TouchableOpacity
                    key={treino.id}
                    style={[
                      estilos.opcaoTreino,
                      selecionado && {
                        backgroundColor: `${corTema}20`,
                        borderColor: corTema,
                      },
                    ]}
                    onPress={() => setTreinoSelecionado(treino.id)}
                  >
                    <Text
                      style={[
                        estilos.textoOpcao,
                        selecionado && estilos.textoOpcaoSelecionada,
                      ]}
                    >
                      {selecionado ? "✓  " : ""}
                      {treino.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[
                  estilos.botaoSalvar,
                  { backgroundColor: corTema },
                  (salvando || !treinoSelecionado) && estilos.botaoDesabilitado,
                ]}
                onPress={registrarTreino}
                disabled={salvando || !treinoSelecionado}
              >
                {salvando ? (
                  <ActivityIndicator color="#101312" />
                ) : (
                  <Text style={estilos.textoBotaoSalvar}>Confirmar treino</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          {sessoesDoDia.filter((sessao) => sessao.plan_id !== null).length >
          0 ? (
            <View style={estilos.treinosDoDia}>
              <Text style={estilos.rotulo}>Treinos registrados neste dia</Text>
              {sessoesDoDia
                .filter((sessao) => sessao.plan_id !== null)
                .map((sessao) => {
                  const treino = treinos.find(
                    (item) => item.id === sessao.plan_id,
                  );
                  return (
                    <Text
                      key={sessao.id}
                      style={[estilos.textoTreinoDoDia, { color: corTema }]}
                    >
                      ✓ {treino?.name ?? "Treino registrado"}
                    </Text>
                  );
                })}
            </View>
          ) : null}
          {cardiosDoDia.length > 0 ? (
            <View style={estilos.treinosDoDia}>
              <Text style={estilos.rotulo}>Cardios registrados neste dia</Text>
              {cardiosDoDia.map((cardio) => (
                <Text
                  key={cardio.id}
                  style={[estilos.textoTreinoDoDia, { color: corTema }]}
                >
                  ✓ {cardio.activity_name}
                  {cardio.duration_minutes != null
                    ? ` · ${cardio.duration_minutes} min`
                    : ""}
                  {cardio.distance_km != null
                    ? ` · ${cardio.distance_km} km`
                    : ""}
                  {(cardio.active_calories ?? cardio.calories) != null
                    ? ` · ${cardio.active_calories ?? cardio.calories} ${cardio.active_calories != null ? "kcal ativas estimadas" : "kcal"}`
                    : ""}
                  {cardio.cadence_rpm != null
                    ? ` · ${cardio.cadence_rpm} RPM`
                    : ""}
                  {cardio.speed_kmh != null
                    ? ` · ${cardio.speed_kmh} km/h`
                    : ""}
                  {cardio.intensity ? ` · ${cardio.intensity}` : ""}
                  {cardio.incline_percent != null
                    ? ` · ${cardio.incline_percent}% inclinação`
                    : ""}
                  {cardio.heart_rate_avg != null
                    ? ` · FC ${cardio.heart_rate_avg} bpm`
                    : ""}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={[estilos.cartaoRegistro, { marginTop: 16 }]}>
            <Text style={estilos.tituloRegistro}>Registrar cardio</Text>
            <Text style={[estilos.dataRegistro, { color: corTema }]}>
              {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString(
                "pt-BR",
                {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              )}
            </Text>
            {modelosCardio.length === 0 ? (
              <Text style={estilos.textoSecundario}>
                Você ainda não cadastrou cardios. Acesse Meus Cardios para criar
                um modelo.
              </Text>
            ) : (
              <>
                <Text style={estilos.rotulo}>Qual cardio você realizou?</Text>
                {modelosCardio.map((cardio) => {
                  const selecionado = cardioSelecionado === cardio.id;
                  return (
                    <TouchableOpacity
                      key={cardio.id}
                      style={[
                        estilos.opcaoTreino,
                        selecionado && {
                          backgroundColor: `${corTema}20`,
                          borderColor: corTema,
                        },
                      ]}
                      onPress={() => selecionarCardio(cardio)}
                    >
                      <Text
                        style={[
                          estilos.textoOpcao,
                          selecionado && estilos.textoOpcaoSelecionada,
                        ]}
                      >
                        {selecionado ? "✓  " : ""}
                        {cardio.nome} · {cardio.tipo}
                        {cardio.duracao_min != null
                          ? ` · ${cardio.duracao_min} min`
                          : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {modeloCardioSelecionado ? (
                  <View style={{ marginTop: 10 }}>
                    {pesoUsuario === null ? (
                      <Text style={estilos.avisoCalorias}>
                        Para estimar calorias, primeiro informe seu peso em Meu
                        Perfil.
                      </Text>
                    ) : null}
                    <Text style={estilos.rotulo}>Duração (minutos) *</Text>
                    <TextInput
                      style={estilos.inputCardio}
                      value={duracaoCardio}
                      onChangeText={setDuracaoCardio}
                      placeholder="Ex.: 25"
                      placeholderTextColor="#828A85"
                      keyboardType="decimal-pad"
                    />
                    <Text style={estilos.rotulo}>Intensidade</Text>
                    <View style={estilos.opcoesIntensidade}>
                      {(
                        [
                          ["leve", "Leve"],
                          ["moderada", "Moderada"],
                          ["intensa", "Intensa"],
                        ] as const
                      ).map(([valor, rotulo]) => (
                        <TouchableOpacity
                          key={valor}
                          style={[
                            estilos.botaoIntensidade,
                            intensidadeCardio === valor && {
                              borderColor: corTema,
                              backgroundColor: `${corTema}22`,
                            },
                          ]}
                          onPress={() => setIntensidadeCardio(valor)}
                        >
                          <Text
                            style={[
                              estilos.textoIntensidade,
                              intensidadeCardio === valor && { color: corTema },
                            ]}
                          >
                            {rotulo}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={estilos.rotulo}>Distância (km, opcional)</Text>
                    <TextInput
                      style={estilos.inputCardio}
                      value={distanciaCardio}
                      onChangeText={setDistanciaCardio}
                      placeholder="Ex.: 3,5"
                      placeholderTextColor="#828A85"
                      keyboardType="decimal-pad"
                    />
                    {textoTipo(modeloCardioSelecionado.tipo).includes(
                      "esteira",
                    ) ? (
                      <>
                        <Text style={estilos.rotulo}>
                          Velocidade (km/h, opcional)
                        </Text>
                        <TextInput
                          style={estilos.inputCardio}
                          value={velocidadeCardio}
                          onChangeText={setVelocidadeCardio}
                          placeholder="Ex.: 6,0"
                          placeholderTextColor="#828A85"
                          keyboardType="decimal-pad"
                        />
                        <Text style={estilos.rotulo}>
                          Inclinação da esteira (%, opcional)
                        </Text>
                        <TextInput
                          style={estilos.inputCardio}
                          value={inclinacaoCardio}
                          onChangeText={setInclinacaoCardio}
                          placeholder="Ex.: 5"
                          placeholderTextColor="#828A85"
                          keyboardType="decimal-pad"
                        />
                      </>
                    ) : null}
                    {textoTipo(modeloCardioSelecionado.tipo).includes(
                      "bicicleta",
                    ) ? (
                      <>
                        <Text style={estilos.rotulo}>
                          Velocidade de pedalada da bicicleta (cadência em RPM,
                          opcional)
                        </Text>
                        <TextInput
                          style={estilos.inputCardio}
                          value={cadenciaBicicleta}
                          onChangeText={setCadenciaBicicleta}
                          placeholder="Pedaladas por minuto; ex.: 80"
                          placeholderTextColor="#828A85"
                          keyboardType="decimal-pad"
                        />
                      </>
                    ) : null}
                    {["caminhada", "corrida"].some((tipo) =>
                      textoTipo(modeloCardioSelecionado.tipo).includes(tipo),
                    ) ? (
                      <>
                        <Text style={estilos.rotulo}>
                          Velocidade (km/h, opcional)
                        </Text>
                        <TextInput
                          style={estilos.inputCardio}
                          value={velocidadeCardio}
                          onChangeText={setVelocidadeCardio}
                          placeholder="Ex.: 8,0"
                          placeholderTextColor="#828A85"
                          keyboardType="decimal-pad"
                        />
                      </>
                    ) : null}
                    <Text style={estilos.rotulo}>
                      Frequência cardíaca média (bpm, opcional)
                    </Text>
                    <TextInput
                      style={estilos.inputCardio}
                      value={frequenciaCardiaca}
                      onChangeText={setFrequenciaCardiaca}
                      placeholder="Ex.: 145"
                      placeholderTextColor="#828A85"
                      keyboardType="number-pad"
                    />
                    <View style={estilos.resumoCalorias}>
                      <Text style={estilos.textoResumoCalorias}>
                        Calorias ativas estimadas
                      </Text>
                      <Text style={[estilos.valorCalorias, { color: corTema }]}>
                        {estimativaCalorias
                          ? `${estimativaCalorias.caloriasAtivas} kcal`
                          : pesoUsuario === null
                            ? "Informe seu peso no perfil"
                            : duracaoNumerica === null ||
                                !Number.isFinite(duracaoNumerica) ||
                                duracaoNumerica <= 0
                              ? "Informe a duração"
                              : "Selecione a intensidade"}
                      </Text>
                      {estimativaCalorias ? (
                        <Text style={estilos.detalheCalorias}>
                          Estimativa por MET {estimativaCalorias.met}. RPM e
                          frequência cardíaca são registrados, mas não
                          determinam sozinhos o gasto energético.
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[
                    estilos.botaoSalvar,
                    { backgroundColor: corTema },
                    (salvando || !cardioSelecionado) &&
                      estilos.botaoDesabilitado,
                  ]}
                  onPress={registrarCardio}
                  disabled={salvando || !cardioSelecionado}
                >
                  {salvando ? (
                    <ActivityIndicator color="#101312" />
                  ) : (
                    <Text style={estilos.textoBotaoSalvar}>
                      {estimativaCalorias
                        ? `Confirmar cardio · ${estimativaCalorias.caloriasAtivas} kcal`
                        : "Confirmar cardio"}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
          {sessoesDoDia.some((sessao) => sessao.plan_id !== null) ||
          cardiosDoDia.length > 0 ? (
            <View style={estilos.treinosDoDia}>
              <TouchableOpacity
                style={[
                  estilos.botaoExcluirRegistro,
                  salvando && estilos.botaoDesabilitado,
                ]}
                onPress={() => {
                  setMensagemStatus("");
                  setConfirmandoExclusao(true);
                }}
                disabled={salvando}
              >
                <Text style={estilos.textoBotaoExcluir}>
                  Excluir registro do dia
                </Text>
              </TouchableOpacity>
              {confirmandoExclusao ? (
                <View style={estilos.confirmacaoExclusao}>
                  <Text style={estilos.textoSecundario}>
                    Tem certeza que deseja excluir os registros de musculação e
                    cardio desta data? Eles também serão removidos do histórico.
                  </Text>
                  <View style={estilos.acoesConfirmacao}>
                    <TouchableOpacity
                      style={estilos.botaoCancelarExclusao}
                      onPress={() => setConfirmandoExclusao(false)}
                      disabled={salvando}
                    >
                      <Text style={estilos.textoOpcao}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={estilos.botaoConfirmarExclusao}
                      onPress={excluirRegistroDoDia}
                      disabled={salvando}
                    >
                      {salvando ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={estilos.textoBotaoExcluir}>
                          Confirmar exclusão
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {mensagemStatus ? (
            <Text style={estilos.mensagemStatus}>{mensagemStatus}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
  },
  conteudo: {
    padding: 22,
    paddingBottom: 44,
  },
  centralizado: {
    flex: 1,
    backgroundColor: "#101312",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  marca: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F3F5F3",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitulo: {
    color: "#A9B2AC",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 18,
  },
  textoVoltar: {
    fontSize: 16,
    fontWeight: "600",
  },
  cartaoResumo: {
    backgroundColor: "#19251F",
    borderColor: "#2B4637",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  resumoNumero: {
    fontSize: 36,
    fontWeight: "800",
  },
  resumoTexto: {
    color: "#D0D7E0",
    fontSize: 14,
    marginTop: 4,
  },
  cartaoCalendario: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
  },
  navegacaoMes: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  tituloMes: {
    color: "#F3F5F3",
    fontSize: 18,
    fontWeight: "800",
  },
  botaoMes: {
    width: 42,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textoBotaoMes: {
    fontSize: 30,
  },
  gradeCalendario: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  celula: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  nomeDiaSemana: {
    color: "#A9B2AC",
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 8,
  },
  diaCalendario: {
    width: 36,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  diaTreinado: {
    backgroundColor: "#1D3026",
  },
  diaHoje: {
    borderColor: "#6D8174",
  },
  numeroDia: {
    color: "#D0D7D2",
    fontSize: 14,
    fontWeight: "600",
  },
  numeroSelecionado: {
    color: "#FFFFFF",
  },
  indicadorTreino: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legenda: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  textoLegenda: {
    color: "#A9B2AC",
    fontSize: 12,
  },
  cartaoRegistro: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  tituloRegistro: {
    color: "#F3F5F3",
    fontSize: 20,
    fontWeight: "800",
  },
  dataRegistro: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 20,
    textTransform: "capitalize",
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  opcaoTreino: {
    borderColor: "#343D37",
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
    marginBottom: 8,
  },
  textoOpcao: {
    color: "#D0D7D2",
    fontSize: 14,
  },
  textoOpcaoSelecionada: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  inputCardio: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: "#F0F3F1",
    marginBottom: 12,
  },
  opcoesIntensidade: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  botaoIntensidade: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#343D37",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  textoIntensidade: {
    color: "#D0D7D2",
    fontSize: 13,
    fontWeight: "700",
  },
  resumoCalorias: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginBottom: 8,
  },
  textoResumoCalorias: {
    color: "#A9B2AC",
    fontSize: 13,
    fontWeight: "600",
  },
  valorCalorias: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 4,
  },
  detalheCalorias: {
    color: "#A9B2AC",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  avisoCalorias: {
    color: "#FACC15",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10,
  },
  botaoSalvar: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: 10,
  },
  botaoDesabilitado: {
    opacity: 0.55,
  },
  textoBotaoSalvar: {
    color: "#101312",
    fontSize: 15,
    fontWeight: "800",
  },
  treinosDoDia: {
    borderTopWidth: 1,
    borderTopColor: "#343D37",
    marginTop: 18,
    paddingTop: 16,
    gap: 8,
  },
  itemTreinoDoDia: {
    gap: 8,
    marginBottom: 14,
  },
  botaoExcluirRegistro: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#8F4545",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  textoBotaoExcluir: {
    color: "#FF7777",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmacaoExclusao: {
    gap: 12,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#222825",
  },
  acoesConfirmacao: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  botaoCancelarExclusao: {
    borderWidth: 1,
    borderColor: "#536057",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  botaoConfirmarExclusao: {
    borderWidth: 1,
    borderColor: "#8F4545",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  mensagemStatus: {
    color: "#D0D7D2",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  textoTreinoDoDia: {
    fontSize: 14,
  },
  textoSecundario: {
    color: "#A9B2AC",
    fontSize: 14,
    lineHeight: 21,
  },
});
