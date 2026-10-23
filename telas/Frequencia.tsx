import React, { useCallback, useRef, useState } from "react";
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
  categoriaDoCardio,
  estimarCaloriasAtivas,
  type IntensidadeCardio,
  type SexoCardio,
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
  status?: string | null;
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
  weight_kg_snapshot?: number | null;
  height_cm_snapshot?: number | null;
  age_snapshot?: number | null;
  sex_snapshot?: string | null;
  floors_up?: number | null;
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
  const [alturaUsuario, setAlturaUsuario] = useState<number | null>(null);
  const [idadeUsuario, setIdadeUsuario] = useState<number | null>(null);
  const [sexoUsuario, setSexoUsuario] = useState<SexoCardio | null>(null);
  const [duracaoCardio, setDuracaoCardio] = useState("");
  const [distanciaCardio, setDistanciaCardio] = useState("");
  const [intensidadeCardio, setIntensidadeCardio] =
    useState<IntensidadeCardio | null>(null);
  const [inclinacaoCardio, setInclinacaoCardio] = useState("0");
  const [andaresSubidos, setAndaresSubidos] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const envioCardioEmAndamento = useRef(false);
  const chaveCardioPendente = useRef<{
    fingerprint: string;
    chave: string;
  } | null>(null);
  const [registroParaExcluir, setRegistroParaExcluir] = useState<{
    tipo: "treino" | "cardio";
    id: string;
    nome: string;
  } | null>(null);
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
      const metadados = usuario.user.user_metadata ?? {};
      const pesoPerfil = Number(metadados.peso_kg);
      const alturaPerfil = Number(metadados.altura_cm);
      const idadePerfil = Number(metadados.idade);
      const sexoPerfil = metadados.sexo;
      setPesoUsuario(
        Number.isFinite(pesoPerfil) && pesoPerfil >= 20 && pesoPerfil <= 400
          ? pesoPerfil
          : null,
      );
      setAlturaUsuario(
        Number.isFinite(alturaPerfil) &&
          alturaPerfil >= 100 &&
          alturaPerfil <= 250
          ? alturaPerfil
          : null,
      );
      setIdadeUsuario(
        Number.isInteger(idadePerfil) && idadePerfil >= 18 && idadePerfil <= 110
          ? idadePerfil
          : null,
      );
      setSexoUsuario(
        sexoPerfil === "masculino" || sexoPerfil === "feminino"
          ? sexoPerfil
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
          .select("id, plan_id, started_at, notes, status")
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
            "id, activity_name, activity_type, started_at, duration_minutes, distance_km, calories, active_calories, intensity, incline_percent, heart_rate_avg, speed_kmh, weight_kg_snapshot, height_cm_snapshot, age_snapshot, sex_snapshot, floors_up, met_value, notes",
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
    (sessao) =>
      sessao.status !== "em_andamento" &&
      dataDaSessao(sessao.started_at) === dataSelecionada,
  );
  const cardiosDoDia = sessoesCardio.filter(
    (sessao) => dataDaSessao(sessao.started_at) === dataSelecionada,
  );
  const modeloCardioSelecionado = modelosCardio.find(
    (item) => item.id === cardioSelecionado,
  );
  const categoriaSelecionada = modeloCardioSelecionado
    ? categoriaDoCardio(modeloCardioSelecionado.tipo)
    : null;
  const duracaoNumerica = lerNumero(duracaoCardio);
  const distanciaNumerica = lerNumero(distanciaCardio);
  const inclinacaoNumerica = lerNumero(inclinacaoCardio);
  const andaresNumericos = lerNumero(andaresSubidos);
  const perfilCaloriasCompleto =
    pesoUsuario !== null &&
    alturaUsuario !== null &&
    idadeUsuario !== null &&
    sexoUsuario !== null;
  const estimativaCalorias =
    modeloCardioSelecionado &&
    perfilCaloriasCompleto &&
    duracaoNumerica !== null &&
    Number.isFinite(duracaoNumerica) &&
    duracaoNumerica > 0 &&
    intensidadeCardio !== null
      ? estimarCaloriasAtivas({
          tipo: modeloCardioSelecionado.tipo,
          intensidade: intensidadeCardio,
          pesoKg: pesoUsuario!,
          alturaCm: alturaUsuario!,
          idade: idadeUsuario!,
          sexo: sexoUsuario!,
          duracaoMinutos: duracaoNumerica,
          distanciaKm:
            distanciaNumerica !== null &&
            Number.isFinite(distanciaNumerica) &&
            distanciaNumerica > 0
              ? distanciaNumerica
              : null,
          inclinacaoPercentual:
            categoriaSelecionada === "esteira"
              ? inclinacaoNumerica !== null &&
                Number.isFinite(inclinacaoNumerica)
                ? inclinacaoNumerica
                : 0
              : null,
          andaresSubidos:
            andaresNumericos !== null &&
            Number.isInteger(andaresNumericos) &&
            andaresNumericos > 0
              ? andaresNumericos
              : null,
        })
      : null;
  const diasTreinados = new Set([
    ...sessoes
      .filter(
        (sessao) => sessao.plan_id !== null && sessao.status !== "em_andamento",
      )
      .map((sessao) => dataDaSessao(sessao.started_at)),
    ...sessoesCardio.map((sessao) => dataDaSessao(sessao.started_at)),
  ]);
  const datasDoMes = [
    ...sessoes
      .filter((sessao) => {
        const data = new Date(sessao.started_at);
        return (
          sessao.status !== "em_andamento" &&
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
          "Já existe um treino registrado nessa data. Para trocar, exclua somente o treino desejado na lista abaixo.",
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
    const categoria = categoriaDoCardio(modelo.tipo);
    setCardioSelecionado(modelo.id);
    setDuracaoCardio(
      modelo.duracao_min == null ? "" : String(modelo.duracao_min),
    );
    setDistanciaCardio(
      ["esteira", "caminhada", "corrida", "bicicleta"].includes(categoria) &&
        modelo.distancia_km != null
        ? String(modelo.distancia_km)
        : "",
    );
    setIntensidadeCardio(null);
    setInclinacaoCardio(categoria === "esteira" ? "0" : "");
    setAndaresSubidos("");
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
    if (!perfilCaloriasCompleto) {
      Alert.alert(
        "Complete seu perfil",
        "Informe peso, altura, idade e sexo em Meu Perfil para estimar as calorias do cardio.",
      );
      return;
    }
    const modelo = modelosCardio.find((item) => item.id === cardioSelecionado);
    if (!modelo) {
      Alert.alert("Erro", "O cardio selecionado não foi encontrado.");
      return;
    }

    const categoria = categoriaDoCardio(modelo.tipo);
    const duracao = lerNumero(duracaoCardio);
    const distancia = distanciaCardio.trim()
      ? lerNumero(distanciaCardio)
      : null;
    const inclinacao =
      categoria === "esteira"
        ? inclinacaoCardio.trim()
          ? lerNumero(inclinacaoCardio)
          : 0
        : null;
    const andares = andaresSubidos.trim() ? lerNumero(andaresSubidos) : null;

    if (
      duracao === null ||
      !Number.isFinite(duracao) ||
      duracao <= 0 ||
      duracao > 1440
    ) {
      Alert.alert(
        "Duração necessária",
        "Informe a duração em minutos, maior que zero e até 1440 minutos.",
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
    if (
      distanciaCardio.trim() &&
      (distancia === null ||
        !Number.isFinite(distancia) ||
        distancia <= 0 ||
        distancia > 1000)
    ) {
      Alert.alert(
        "Distância inválida",
        "Informe a distância em quilômetros, maior que zero e até 1000 km.",
      );
      return;
    }
    if (
      categoria === "esteira" &&
      (inclinacao === null ||
        !Number.isFinite(inclinacao) ||
        inclinacao < 0 ||
        inclinacao > 15)
    ) {
      Alert.alert(
        "Inclinação inválida",
        "A inclinação da esteira deve estar entre 0 e 15%.",
      );
      return;
    }
    if (
      categoria === "esteira" &&
      inclinacao !== null &&
      inclinacao > 0 &&
      (distancia === null || !Number.isFinite(distancia) || distancia <= 0)
    ) {
      Alert.alert(
        "Distância necessária",
        "Para calcular o efeito da inclinação da esteira, informe também a distância percorrida em quilômetros.",
      );
      return;
    }
    if (
      categoria === "escadas" &&
      andaresSubidos.trim() &&
      (andares === null ||
        !Number.isInteger(andares) ||
        andares < 1 ||
        andares > 1000)
    ) {
      Alert.alert(
        "Andares inválidos",
        "Informe um número inteiro de andares subidos entre 1 e 1000.",
      );
      return;
    }
    const estimativa = estimarCaloriasAtivas({
      tipo: modelo.tipo,
      intensidade: intensidadeCardio,
      pesoKg: pesoUsuario!,
      alturaCm: alturaUsuario!,
      idade: idadeUsuario!,
      sexo: sexoUsuario!,
      duracaoMinutos: duracao,
      distanciaKm:
        distancia !== null && Number.isFinite(distancia) ? distancia : null,
      inclinacaoPercentual: categoria === "esteira" ? (inclinacao ?? 0) : null,
      andaresSubidos:
        andares !== null && Number.isFinite(andares) ? andares : null,
    });
    if (!estimativa) {
      Alert.alert(
        "Não foi possível calcular",
        "Confira os dados do perfil e as informações da atividade. Na esteira inclinada, informe a distância e use inclinação de 0 a 15%.",
      );
      return;
    }

    if (envioCardioEmAndamento.current) return;
    envioCardioEmAndamento.current = true;
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
      const distanciaSalva =
        distancia !== null && Number.isFinite(distancia) ? distancia : null;
      const inclinacaoSalva =
        categoria === "esteira" ? (inclinacao ?? 0) : null;
      const andaresSalvos =
        categoria === "escadas" && andares !== null && Number.isFinite(andares)
          ? andares
          : null;
      const fingerprint = JSON.stringify({
        usuarioId,
        dataSelecionada,
        activityId: modelo.id,
        duracao,
        distancia: distanciaSalva,
        intensidade: intensidadeCardio,
        inclinacao: inclinacaoSalva,
        andares: andaresSalvos,
      });
      if (
        !chaveCardioPendente.current ||
        chaveCardioPendente.current.fingerprint !== fingerprint
      ) {
        chaveCardioPendente.current = {
          fingerprint,
          chave: `cardio-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`,
        };
      }
      const chaveOperacao = chaveCardioPendente.current.chave;
      const registro = {
        user_id: usuarioId,
        client_request_id: chaveOperacao,
        activity_id: modelo.id,
        activity_name: modelo.nome,
        activity_type: modelo.tipo,
        started_at: dataRegistro,
        duration_minutes: duracao,
        distance_km: distanciaSalva,
        calories: estimativa.caloriasAtivas,
        active_calories: estimativa.caloriasAtivas,
        intensity: intensidadeCardio,
        incline_percent: inclinacaoSalva,
        floors_up: andaresSalvos,
        heart_rate_avg: null,
        speed_kmh: estimativa.velocidadeKmh,
        weight_kg_snapshot: pesoUsuario,
        height_cm_snapshot: alturaUsuario,
        age_snapshot: idadeUsuario,
        sex_snapshot: sexoUsuario,
        met_value: estimativa.met,
        notes: modelo.observacoes,
      };
      const { error } = await supabase.from("cardio_sessions").insert(registro);
      if (error) {
        if (error.code === "23505") {
          const existente = await supabase
            .from("cardio_sessions")
            .select("id")
            .eq("user_id", usuarioId)
            .eq("client_request_id", chaveOperacao)
            .maybeSingle();
          if (existente.error || !existente.data) throw error;
        } else {
          throw error;
        }
      }
      chaveCardioPendente.current = null;
      setCardioSelecionado("");
      setDuracaoCardio("");
      setDistanciaCardio("");
      setInclinacaoCardio("0");
      setAndaresSubidos("");
      await carregarDados();
      Alert.alert(
        "Cardio registrado",
        `Sessão salva com aproximadamente ${estimativa.caloriasAtivas} kcal ativas estimadas. O peso e o MET usados ficaram guardados neste registro; atualizar seu perfil não mudará esta estimativa.`,
      );
    } catch (erro) {
      Alert.alert(
        "Erro ao registrar cardio",
        `${erro instanceof Error ? erro.message : "Não foi possível salvar o cardio."} Se o erro mencionar client_request_id, execute a migração SQL de prevenção de envios duplicados e tente novamente.`,
      );
    } finally {
      envioCardioEmAndamento.current = false;
      setSalvando(false);
    }
  }

  async function excluirRegistroSelecionado() {
    const registro = registroParaExcluir;
    if (!usuarioId || !registro) return;

    setSalvando(true);
    setMensagemStatus("");

    try {
      const resultado =
        registro.tipo === "treino"
          ? await supabase
              .from("workout_sessions")
              .delete()
              .eq("id", registro.id)
              .eq("user_id", usuarioId)
          : await supabase
              .from("cardio_sessions")
              .delete()
              .eq("id", registro.id)
              .eq("user_id", usuarioId);

      if (resultado.error) {
        setMensagemStatus(
          `Não foi possível excluir este ${registro.tipo === "treino" ? "treino" : "cardio"}: ${resultado.error.message}`,
        );
        return;
      }

      setRegistroParaExcluir(null);
      if (registro.tipo === "treino") setTreinoSelecionado("");
      if (registro.tipo === "cardio") setCardioSelecionado("");
      await carregarDados();
      setMensagemStatus(
        `${registro.tipo === "treino" ? "Treino" : "Cardio"} excluído. Os outros registros desse dia foram mantidos.`,
      );
    } catch {
      setMensagemStatus("Ocorreu um erro ao excluir o registro selecionado.");
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
              Já existe um treino registrado neste dia. Para trocar, exclua
              somente o treino desejado na lista de registros.
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
        </View>
        {sessoesDoDia.filter((sessao) => sessao.plan_id !== null).length > 0 ? (
          <View style={estilos.cartaoHistorico}>
            <Text style={estilos.tituloRegistro}>
              Treinos registrados neste dia
            </Text>
            {sessoesDoDia
              .filter((sessao) => sessao.plan_id !== null)
              .map((sessao) => {
                const treino = treinos.find(
                  (item) => item.id === sessao.plan_id,
                );
                const nomeTreino = treino?.name ?? "Treino registrado";
                return (
                  <View key={sessao.id} style={estilos.itemHistorico}>
                    <View style={estilos.linhaRegistroSalvo}>
                      <View style={estilos.conteudoRegistroSalvo}>
                        <Text
                          style={[estilos.textoTreinoDoDia, { color: corTema }]}
                        >
                          ✓ {nomeTreino}
                        </Text>
                        <Text style={estilos.textoSecundario}>
                          {new Date(sessao.started_at).toLocaleTimeString(
                            "pt-BR",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          estilos.botaoExcluirIndividual,
                          salvando && estilos.botaoDesabilitado,
                        ]}
                        onPress={() =>
                          setRegistroParaExcluir({
                            tipo: "treino",
                            id: sessao.id,
                            nome: nomeTreino,
                          })
                        }
                        disabled={salvando}
                      >
                        <Text style={estilos.textoBotaoExcluir}>
                          Excluir treino
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {registroParaExcluir?.tipo === "treino" &&
                    registroParaExcluir.id === sessao.id ? (
                      <View style={estilos.confirmacaoExclusao}>
                        <Text style={estilos.textoSecundario}>
                          Excluir somente “{registroParaExcluir.nome}”? Os
                          demais treinos e cardios desse dia serão mantidos.
                        </Text>
                        <View style={estilos.acoesConfirmacao}>
                          <TouchableOpacity
                            style={estilos.botaoCancelarExclusao}
                            onPress={() => setRegistroParaExcluir(null)}
                            disabled={salvando}
                          >
                            <Text style={estilos.textoOpcao}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={estilos.botaoConfirmarExclusao}
                            onPress={excluirRegistroSelecionado}
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
                );
              })}
          </View>
        ) : null}
        <View style={estilos.cartaoRegistro}>
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
                  {!perfilCaloriasCompleto ? (
                    <Text style={estilos.avisoCalorias}>
                      Para estimar calorias, complete peso, altura, idade e sexo
                      em Meu Perfil.
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
                  {intensidadeCardio !== null ? (
                    <Text style={estilos.textoSecundario}>
                      {intensidadeCardio === "leve"
                        ? "Leve: esforço confortável, com respiração pouco acelerada e conversa fácil. Usa um MET menor e estima menor gasto por minuto."
                        : intensidadeCardio === "moderada"
                          ? "Moderada: respiração mais acelerada, mas ainda é possível falar frases completas. Usa um MET intermediário."
                          : "Intensa: respiração forte e conversa limitada a poucas palavras. Usa um MET maior e estima maior gasto por minuto."}
                      {estimativaCalorias
                        ? ` MET estimado para esta sessão: ${estimativaCalorias.met}. 1 MET representa aproximadamente o gasto energético em repouso.`
                        : " A estimativa de MET aparecerá quando todos os dados necessários estiverem preenchidos."}
                    </Text>
                  ) : null}
                  {categoriaSelecionada === "escadas" ? (
                    <>
                      <Text style={estilos.rotulo}>
                        Andares subidos (opcional)
                      </Text>
                      <TextInput
                        style={estilos.inputCardio}
                        value={andaresSubidos}
                        onChangeText={setAndaresSubidos}
                        placeholder="Ex.: 12"
                        placeholderTextColor="#828A85"
                        keyboardType="number-pad"
                      />
                      <Text style={estilos.textoSecundario}>
                        Informe os andares completos que você subiu. O app usa
                        esse número junto com a duração para ajustar a
                        estimativa.
                      </Text>
                    </>
                  ) : null}
                  {categoriaSelecionada === "caminhada" ||
                  categoriaSelecionada === "corrida" ||
                  categoriaSelecionada === "esteira" ||
                  categoriaSelecionada === "bicicleta" ? (
                    <>
                      <Text style={estilos.rotulo}>
                        Distância (km)
                        {categoriaSelecionada === "esteira" &&
                        Number(inclinacaoCardio.replace(",", ".")) > 0
                          ? " *"
                          : " (opcional)"}
                      </Text>
                      <TextInput
                        style={estilos.inputCardio}
                        value={distanciaCardio}
                        onChangeText={setDistanciaCardio}
                        placeholder="Ex.: 3,5"
                        placeholderTextColor="#828A85"
                        keyboardType="decimal-pad"
                      />
                      <Text style={estilos.textoSecundario}>
                        {categoriaSelecionada === "esteira"
                          ? "A distância permite estimar a velocidade média e calcular o efeito da inclinação. Para inclinação acima de 0%, a distância é necessária."
                          : categoriaSelecionada === "bicicleta"
                            ? "Opcional: se informar os quilômetros, a velocidade média aproximada ajuda a refinar a estimativa. Em bicicletas ergométricas, a distância depende do aparelho."
                            : "Opcional: se informar os quilômetros, a velocidade média será calculada com a duração e usada para refinar as calorias."}
                      </Text>
                    </>
                  ) : null}
                  {categoriaSelecionada === "esteira" ? (
                    <>
                      <Text style={estilos.rotulo}>
                        Inclinação da esteira (0 a 15%)
                      </Text>
                      <TextInput
                        style={estilos.inputCardio}
                        value={inclinacaoCardio}
                        onChangeText={setInclinacaoCardio}
                        placeholder="0 a 15"
                        placeholderTextColor="#828A85"
                        keyboardType="decimal-pad"
                      />
                    </>
                  ) : null}
                  <Text style={estilos.textoSecundario}>
                    A estimativa usa peso, altura, idade, sexo, duração e
                    intensidade. Quando disponíveis, quilômetros, andares e
                    inclinação refinam o cálculo.
                  </Text>
                  <View style={estilos.resumoCalorias}>
                    <Text style={estilos.textoResumoCalorias}>
                      Calorias ativas estimadas
                    </Text>
                    <Text style={[estilos.valorCalorias, { color: corTema }]}>
                      {estimativaCalorias
                        ? `${estimativaCalorias.caloriasAtivas} kcal`
                        : !perfilCaloriasCompleto
                          ? "Complete seu perfil"
                          : duracaoNumerica === null ||
                              !Number.isFinite(duracaoNumerica) ||
                              duracaoNumerica <= 0
                            ? "Informe a duração"
                            : categoriaSelecionada === "esteira" &&
                                (inclinacaoNumerica === null ||
                                  !Number.isFinite(inclinacaoNumerica) ||
                                  inclinacaoNumerica < 0 ||
                                  inclinacaoNumerica > 15)
                              ? "Use inclinação de 0 a 15%"
                              : categoriaSelecionada === "esteira" &&
                                  inclinacaoNumerica !== null &&
                                  inclinacaoNumerica > 0 &&
                                  (!Number.isFinite(
                                    Number(distanciaCardio.replace(",", ".")),
                                  ) ||
                                    Number(distanciaCardio.replace(",", ".")) <=
                                      0)
                                ? "Informe a distância para calcular a inclinação"
                                : intensidadeCardio === null
                                  ? "Selecione a intensidade"
                                  : categoriaSelecionada === "escadas" &&
                                      andaresSubidos.trim() &&
                                      (andaresNumericos === null ||
                                        !Number.isInteger(andaresNumericos) ||
                                        andaresNumericos < 1 ||
                                        andaresNumericos > 1000)
                                    ? "Confira os andares subidos"
                                    : distanciaCardio.trim() &&
                                        (distanciaNumerica === null ||
                                          !Number.isFinite(distanciaNumerica) ||
                                          distanciaNumerica <= 0 ||
                                          distanciaNumerica > 1000)
                                      ? "Confira a distância em km"
                                      : "Confira os dados do cardio"}
                    </Text>
                    {estimativaCalorias ? (
                      <Text style={estilos.detalheCalorias}>
                        Estimativa por MET {estimativaCalorias.met}. É uma
                        aproximação; o gasto real varia conforme o esforço e as
                        características individuais.
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              <TouchableOpacity
                style={[
                  estilos.botaoSalvar,
                  { backgroundColor: corTema },
                  (salvando || !cardioSelecionado) && estilos.botaoDesabilitado,
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
        {cardiosDoDia.length > 0 ? (
          <View style={estilos.cartaoHistorico}>
            <Text style={estilos.tituloRegistro}>
              Cardios registrados neste dia
            </Text>
            {cardiosDoDia.map((cardio) => (
              <View key={cardio.id} style={estilos.itemHistorico}>
                <View style={estilos.linhaRegistroSalvo}>
                  <View style={estilos.conteudoRegistroSalvo}>
                    <Text
                      style={[estilos.textoTreinoDoDia, { color: corTema }]}
                    >
                      ✓ {cardio.activity_name}
                    </Text>
                    <Text style={estilos.textoSecundario}>
                      {cardio.duration_minutes != null
                        ? `${cardio.duration_minutes} min`
                        : ""}
                      {cardio.distance_km != null
                        ? ` · ${cardio.distance_km} km`
                        : ""}
                      {(cardio.active_calories ?? cardio.calories) != null
                        ? ` · ${cardio.active_calories ?? cardio.calories} ${cardio.active_calories != null ? "kcal ativas estimadas" : "kcal"}`
                        : ""}
                      {cardio.floors_up != null
                        ? ` · ${cardio.floors_up} andares subidos`
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
                    <Text style={estilos.textoSecundario}>
                      {new Date(cardio.started_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      estilos.botaoExcluirIndividual,
                      salvando && estilos.botaoDesabilitado,
                    ]}
                    onPress={() =>
                      setRegistroParaExcluir({
                        tipo: "cardio",
                        id: cardio.id,
                        nome: cardio.activity_name,
                      })
                    }
                    disabled={salvando}
                  >
                    <Text style={estilos.textoBotaoExcluir}>
                      Excluir cardio
                    </Text>
                  </TouchableOpacity>
                </View>
                {registroParaExcluir?.tipo === "cardio" &&
                registroParaExcluir.id === cardio.id ? (
                  <View style={estilos.confirmacaoExclusao}>
                    <Text style={estilos.textoSecundario}>
                      Excluir somente “{registroParaExcluir.nome}”? O treino e
                      os outros cardios desse dia serão mantidos.
                    </Text>
                    <View style={estilos.acoesConfirmacao}>
                      <TouchableOpacity
                        style={estilos.botaoCancelarExclusao}
                        onPress={() => setRegistroParaExcluir(null)}
                        disabled={salvando}
                      >
                        <Text style={estilos.textoOpcao}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={estilos.botaoConfirmarExclusao}
                        onPress={excluirRegistroSelecionado}
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
            ))}
          </View>
        ) : null}
        {mensagemStatus ? (
          <Text style={estilos.mensagemStatus}>{mensagemStatus}</Text>
        ) : null}
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
    marginBottom: 18,
  },
  cartaoHistorico: {
    backgroundColor: "#171C19",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    gap: 10,
  },
  itemHistorico: {
    borderWidth: 1,
    borderColor: "#303832",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginTop: 2,
  },
  linhaRegistroSalvo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  conteudoRegistroSalvo: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  botaoExcluirIndividual: {
    borderWidth: 1,
    borderColor: "#8F4545",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignSelf: "center",
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
