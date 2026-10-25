import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase";
import { obterRevisaoDeDados } from "../servicos/revisaoDados";
import { assinarRascunhos, lerResumoTreinoAtivo } from "../servicos/treinoLocal";

type Props = {
  onAbrirProgramacao: () => void;
  onAbrirTreino: (plano?: { planId: string; planName: string }) => void;
  corTema?: string;
};

type TreinoHoje = {
  nome: string;
  definido: boolean;
};
type TreinoContinuar = { planId: string; planName: string; finalizacaoPendente?: boolean; concluidas?: number; total?: number };

function obterCorTransparente(cor: string, transparencia: string) {
  if (/^#[0-9A-Fa-f]{6}$/.test(cor)) {
    return `${cor}${transparencia}`;
  }

  return cor;
}

function obterInicioDoDia() {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  return data.toISOString();
}

function obterInicioDoProximoDia() {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + 1);
  return data.toISOString();
}

export default function TreinoDoDia({
  onAbrirProgramacao,
  onAbrirTreino,
  corTema = "#35D07F",
}: Props) {
  const [treino, setTreino] = useState<TreinoHoje | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [continuar, setContinuar] = useState<TreinoContinuar | null>(null);
  const usuarioRef = useRef("");
  const ultimaConsultaRef = useRef(0);
  const ultimaRevisaoRef = useRef(-1);
  const dadosCarregadosRef = useRef(false);

  const atualizarLocal = useCallback(async () => {
    const id = usuarioRef.current;
    if (!id) return;
    const resumo = await lerResumoTreinoAtivo(id);
    if (usuarioRef.current !== id) return;
    if (resumo) setContinuar({ planId: resumo.planId, planName: resumo.planName,
      finalizacaoPendente: resumo.finalizacaoPendente, concluidas: resumo.seriesConcluidas, total: resumo.totalSeries });
    else setContinuar((anterior) => anterior?.finalizacaoPendente ? null : anterior);
  }, []);
  useEffect(() => assinarRascunhos(() => { void atualizarLocal().catch(() => {}); }), [atualizarLocal]);

  const carregarTreinoHoje = useCallback(async () => {
    if (!dadosCarregadosRef.current) setCarregando(true);

    try {
      const { data: autenticacao, error: erroUsuario } = await supabase.auth.getSession();
      const usuarioData = { user: autenticacao.session?.user };

      if (erroUsuario || !usuarioData.user) {
        setTreino(null);
        setContinuar(null);
        usuarioRef.current = "";
        return;
      }
      usuarioRef.current = usuarioData.user.id;
      await atualizarLocal();
      const local = await lerResumoTreinoAtivo(usuarioData.user.id);
      if (!local) {
        const { data: ativa, error: erroAtiva } = await supabase.from("workout_sessions")
          .select("id, plan_id").eq("user_id", usuarioData.user.id).eq("status", "em_andamento")
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (!erroAtiva && ativa?.plan_id) {
          const { data: plano } = await supabase.from("workout_plans").select("name")
            .eq("id", ativa.plan_id).eq("user_id", usuarioData.user.id).maybeSingle();
          if (plano?.name) setContinuar({ planId: ativa.plan_id, planName: plano.name });
        } else if (!erroAtiva) setContinuar(null);
      }

      const inicioDia = obterInicioDoDia();
      const inicioProximoDia = obterInicioDoProximoDia();

      const { data: sessoes, error: erroSessoes } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, started_at, status")
        .eq("user_id", usuarioData.user.id)
        .gte("started_at", inicioDia)
        .lt("started_at", inicioProximoDia)
        .order("started_at", { ascending: false });

      if (erroSessoes || !sessoes) {
        setTreino(null);
        return;
      }

      const sessaoComPlano = sessoes.find(
        (sessao) => Boolean(sessao.plan_id) && sessao.status !== "em_andamento",
      );

      if (!sessaoComPlano?.plan_id) {
        setTreino({ nome: "", definido: false });
        dadosCarregadosRef.current = true;
        ultimaConsultaRef.current = Date.now();
        ultimaRevisaoRef.current = obterRevisaoDeDados();
        return;
      }

      const { data: plano, error: erroPlano } = await supabase
        .from("workout_plans")
        .select("name")
        .eq("id", sessaoComPlano.plan_id)
        .eq("user_id", usuarioData.user.id)
        .maybeSingle();

      if (erroPlano || !plano?.name) {
        setTreino({ nome: "", definido: false });
        dadosCarregadosRef.current = true;
        ultimaConsultaRef.current = Date.now();
        ultimaRevisaoRef.current = obterRevisaoDeDados();
        return;
      }

      setTreino({
        nome: plano.name,
        definido: true,
      });
      dadosCarregadosRef.current = true;
      ultimaConsultaRef.current = Date.now();
      ultimaRevisaoRef.current = obterRevisaoDeDados();
    } catch {
      setTreino(null);
    } finally {
      setCarregando(false);
    }
  }, [atualizarLocal]);

  useFocusEffect(
    useCallback(() => {
      void atualizarLocal().catch(() => {});
      if (
        Date.now() - ultimaConsultaRef.current < 12000 &&
        ultimaRevisaoRef.current === obterRevisaoDeDados()
      )
        return;
      const espera = setTimeout(() => {
        void carregarTreinoHoje();
      }, 80);
      return () => clearTimeout(espera);
    }, [carregarTreinoHoje, atualizarLocal]),
  );

  const nomesDias = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];

  return (
    <View
      style={[
        estilos.cartao,
        {
          backgroundColor: obterCorTransparente(corTema, "12"),
          borderColor: obterCorTransparente(corTema, "65"),
        },
      ]}
    >
      <View style={estilos.topo}>
        <View style={estilos.textos}>
          <Text style={[estilos.rotulo, { color: corTema }]}>
            {continuar ? "SEU TREINO" : "TREINO DE HOJE"}
          </Text>

          <Text style={estilos.dia}>{nomesDias[new Date().getDay()]}</Text>
        </View>

        <Text style={estilos.emoji}>{treino?.definido ? "💪" : "🏋️"}</Text>
      </View>

      {continuar ? (
        <>
          <Text style={estilos.titulo}>{continuar.planName}</Text>
          <Text style={estilos.descricao}>{continuar.finalizacaoPendente
            ? "Treino encerrado neste aparelho. A conclusão e o horário original estão protegidos até a confirmação do envio."
            : `Seu treino está em andamento${continuar.total ? ` · ${continuar.concluidas} de ${continuar.total} séries concluídas` : ""}. Continue de onde parou.`}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${continuar.finalizacaoPendente ? "Conferir envio de" : "Continuar"} ${continuar.planName}`} style={[estilos.botaoPrincipal, { backgroundColor: corTema }]}
            onPress={() => onAbrirTreino({ planId: continuar.planId, planName: continuar.planName })} activeOpacity={0.8}>
            <Text style={estilos.textoBotaoPrincipal}>{continuar.finalizacaoPendente ? "Conferir envio do treino" : "Continuar treino"}</Text>
          </TouchableOpacity>
        </>
      ) : carregando ? (
        <ActivityIndicator color={corTema} style={estilos.carregando} />
      ) : treino?.definido ? (
        <>
          <Text style={estilos.titulo}>{treino.nome}</Text>

          <Text style={estilos.descricao}>
            Treino registrado para hoje. Continue acompanhando sua evolução!
          </Text>

          <TouchableOpacity
            style={[estilos.botaoPrincipal, { backgroundColor: corTema }]}
            onPress={() => onAbrirTreino()}
            activeOpacity={0.8}
          >
            <Text style={estilos.textoBotaoPrincipal}>Abrir meus treinos</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={estilos.titulo}>Qual treino você fez hoje?</Text>

          <Text style={estilos.descricao}>
            Registre o treino realizado no calendário e acompanhe sua
            frequência. Você escolhe o treino no próprio dia, sem precisar
            programar a semana.
          </Text>
        </>
      )}

      <TouchableOpacity
        style={estilos.botaoSecundario}
        onPress={onAbrirProgramacao}
        activeOpacity={0.8}
      >
        <Text style={[estilos.textoBotaoSecundario, { color: corTema }]}>
          {treino?.definido
            ? "Ver calendário ou alterar registro"
            : "Escolher treino de hoje"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: "#19251F",
    borderColor: "#2B4637",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  topo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  textos: {
    gap: 4,
  },
  rotulo: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dia: {
    color: "#A9B2AC",
    fontSize: 13,
    textTransform: "capitalize",
  },
  emoji: {
    fontSize: 27,
  },
  carregando: {
    marginVertical: 15,
  },
  titulo: {
    color: "#F4F6F4",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  descricao: {
    color: "#B4C1B8",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 15,
  },
  botaoPrincipal: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  textoBotaoPrincipal: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  botaoSecundario: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  textoBotaoSecundario: {
    fontSize: 13,
    fontWeight: "700",
  },
});
