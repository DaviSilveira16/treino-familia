import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase";

type Props = {
  onAbrirProgramacao: () => void;
  onAbrirTreino: () => void;
  corTema?: string;
};

type TreinoHoje = {
  nome: string;
  definido: boolean;
};

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

  const carregarTreinoHoje = useCallback(async () => {
    setCarregando(true);

    try {
      const { data: usuarioData, error: erroUsuario } =
        await supabase.auth.getUser();

      if (erroUsuario || !usuarioData.user) {
        setTreino(null);
        return;
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
        return;
      }

      setTreino({
        nome: plano.name,
        definido: true,
      });
    } catch {
      setTreino(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarTreinoHoje();
    }, [carregarTreinoHoje]),
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
            TREINO DE HOJE
          </Text>

          <Text style={estilos.dia}>{nomesDias[new Date().getDay()]}</Text>
        </View>

        <Text style={estilos.emoji}>{treino?.definido ? "💪" : "🏋️"}</Text>
      </View>

      {carregando ? (
        <ActivityIndicator color={corTema} style={estilos.carregando} />
      ) : treino?.definido ? (
        <>
          <Text style={estilos.titulo}>{treino.nome}</Text>

          <Text style={estilos.descricao}>
            Treino registrado para hoje. Continue acompanhando sua evolução!
          </Text>

          <TouchableOpacity
            style={[estilos.botaoPrincipal, { backgroundColor: corTema }]}
            onPress={onAbrirTreino}
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
