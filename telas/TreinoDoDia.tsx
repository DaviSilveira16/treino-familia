import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

type Props = {
  onAbrirProgramacao: () => void;
  onAbrirTreino: () => void;
};

type TreinoHoje = {
  nome: string;
  descanso: boolean;
  definido: boolean;
};

const nomesDias = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export default function TreinoDoDia({
  onAbrirProgramacao,
  onAbrirTreino,
}: Props) {
  const [treino, setTreino] = useState<TreinoHoje | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregarTreinoHoje = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: usuarioData } = await supabase.auth.getUser();
      if (!usuarioData.user) {
        setTreino(null);
        return;
      }

      const diaHoje = new Date().getDay();
      const { data, error } = await supabase
        .from("weekly_workout_schedule")
        .select("plan_id, is_rest_day")
        .eq("user_id", usuarioData.user.id)
        .eq("day_of_week", diaHoje)
        .maybeSingle();

      if (error || !data) {
        setTreino({ nome: "", descanso: false, definido: false });
        return;
      }

      if (data.is_rest_day) {
        setTreino({ nome: "", descanso: true, definido: true });
        return;
      }

      if (!data.plan_id) {
        setTreino({ nome: "", descanso: false, definido: false });
        return;
      }

      const { data: plano } = await supabase
        .from("workout_plans")
        .select("name")
        .eq("id", data.plan_id)
        .eq("user_id", usuarioData.user.id)
        .maybeSingle();

      setTreino({
        nome: plano?.name ?? "Treino não encontrado",
        descanso: false,
        definido: Boolean(plano?.name),
      });
    } catch {
      setTreino({ nome: "", descanso: false, definido: false });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarTreinoHoje();
  }, [carregarTreinoHoje]);

  return (
    <View style={estilos.cartao}>
      <View style={estilos.topo}>
        <View style={estilos.textos}>
          <Text style={estilos.rotulo}>TREINO DE HOJE</Text>
          <Text style={estilos.dia}>{nomesDias[new Date().getDay()]}</Text>
        </View>
        <Text style={estilos.emoji}>{treino?.descanso ? "🌿" : "🏋️"}</Text>
      </View>

      {carregando ? (
        <ActivityIndicator color="#35D07F" style={estilos.carregando} />
      ) : treino?.descanso ? (
        <>
          <Text style={estilos.titulo}>Dia de descanso</Text>
          <Text style={estilos.descricao}>
            Sua programação indica recuperação hoje. Volte amanhã para o próximo
            treino.
          </Text>
        </>
      ) : treino?.definido ? (
        <>
          <Text style={estilos.titulo}>{treino.nome}</Text>
          <Text style={estilos.descricao}>
            Este é o treino que você programou para hoje.
          </Text>
          <TouchableOpacity
            style={estilos.botaoPrincipal}
            onPress={onAbrirTreino}
          >
            <Text style={estilos.textoBotaoPrincipal}>Abrir meus treinos</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={estilos.titulo}>Nenhum treino programado</Text>
          <Text style={estilos.descricao}>
            Escolha qual treino fazer hoje e organize os dias de descanso.
          </Text>
        </>
      )}

      <TouchableOpacity
        style={estilos.botaoSecundario}
        onPress={onAbrirProgramacao}
      >
        <Text style={estilos.textoBotaoSecundario}>Configurar semana</Text>
      </TouchableOpacity>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: "#1A2B21",
    borderColor: "#2E6041",
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
  textos: { gap: 4 },
  rotulo: {
    color: "#70D99A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  dia: { color: "#A9BFB0", fontSize: 13, textTransform: "capitalize" },
  emoji: { fontSize: 27 },
  carregando: { marginVertical: 15 },
  titulo: {
    color: "#F4F8F5",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  descricao: {
    color: "#B7C8BC",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 15,
  },
  botaoPrincipal: {
    backgroundColor: "#35D07F",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  textoBotaoPrincipal: { color: "#101312", fontSize: 14, fontWeight: "800" },
  botaoSecundario: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  textoBotaoSecundario: { color: "#7EE3A4", fontSize: 13, fontWeight: "700" },
});
