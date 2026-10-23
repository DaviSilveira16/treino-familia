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

type Props = { corTema?: string };
type DadosSemana = {
  treinos: number;
  cardios: number;
  minutos: number;
  calorias: number;
  caloriasDisponiveis: number;
};

function inicioSemana(date: Date) {
  const inicio = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diferenca = (inicio.getDay() + 6) % 7;
  inicio.setDate(inicio.getDate() - diferenca);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}
function formatarMinutos(minutos: number) {
  const seguros = Math.max(0, Math.round(minutos));
  const h = Math.floor(seguros / 60);
  const m = seguros % 60;
  return h ? `${h}h ${m} min` : `${m} min`;
}

export default function ResumoSemanal({ corTema = "#35D07F" }: Props) {
  const [dados, setDados] = useState<DadosSemana>({
    treinos: 0,
    cardios: 0,
    minutos: 0,
    calorias: 0,
    caloriasDisponiveis: 0,
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const { data: usuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !usuario.user)
        throw new Error("Não foi possível carregar o resumo da semana.");
      const inicio = inicioSemana(new Date());
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 7);
      const [resultadoTreinos, resultadoCardios] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select(
            "id, started_at, finished_at, status, duration_minutes, active_calories",
          )
          .eq("user_id", usuario.user.id)
          .gte("started_at", inicio.toISOString())
          .lt("started_at", fim.toISOString()),
        supabase
          .from("cardio_sessions")
          .select("id, started_at, duration_minutes, active_calories")
          .eq("user_id", usuario.user.id)
          .gte("started_at", inicio.toISOString())
          .lt("started_at", fim.toISOString()),
      ]);
      if (resultadoTreinos.error) throw resultadoTreinos.error;
      if (resultadoCardios.error) throw resultadoCardios.error;
      const treinos = (resultadoTreinos.data ?? []).filter(
        (item) => item.status !== "em_andamento",
      );
      const cardios = resultadoCardios.data ?? [];
      const minutosTreinos = treinos.reduce(
        (total, item) => total + (Number(item.duration_minutes) || 0),
        0,
      );
      const minutosCardios = cardios.reduce(
        (total, item) => total + (Number(item.duration_minutes) || 0),
        0,
      );
      const caloriasTreinos = treinos.reduce(
        (total, item) => total + (Number(item.active_calories) || 0),
        0,
      );
      const caloriasCardios = cardios.reduce(
        (total, item) => total + (Number(item.active_calories) || 0),
        0,
      );
      const caloriasDisponiveis = [...treinos, ...cardios].filter(
        (item) => item.active_calories != null,
      ).length;
      setDados({
        treinos: treinos.length,
        cardios: cardios.length,
        minutos: minutosTreinos + minutosCardios,
        calorias: Math.round(caloriasTreinos + caloriasCardios),
        caloriasDisponiveis,
      });
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar o resumo semanal.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  return (
    <View style={estilos.container}>
      <View style={estilos.topo}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={estilos.titulo}>Seu resumo semanal</Text>
          <Text style={estilos.subtitulo}>
            Segunda a domingo · semana atual
          </Text>
        </View>
        <TouchableOpacity onPress={carregar} style={estilos.atualizar}>
          <Text style={[estilos.textoAtualizar, { color: corTema }]}>↻</Text>
        </TouchableOpacity>
      </View>
      {carregando ? (
        <ActivityIndicator color={corTema} />
      ) : erro ? (
        <Text style={estilos.erro}>{erro}</Text>
      ) : (
        <>
          <View style={estilos.grade}>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🏋️</Text>
              <Text style={estilos.numero}>{dados.treinos}</Text>
              <Text style={estilos.rotulo}>Treinos</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🏃</Text>
              <Text style={estilos.numero}>{dados.cardios}</Text>
              <Text style={estilos.rotulo}>Cardios</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>⏱️</Text>
              <Text style={estilos.numero}>
                {formatarMinutos(dados.minutos)}
              </Text>
              <Text style={estilos.rotulo}>Tempo registrado</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🔥</Text>
              <Text style={estilos.numero}>
                {dados.calorias.toLocaleString("pt-BR")}
              </Text>
              <Text style={estilos.rotulo}>Kcal estimadas</Text>
            </View>
          </View>
          {dados.caloriasDisponiveis === 0 ? (
            <Text style={estilos.nota}>
              As calorias aparecerão após registrar sessões com estimativa
              calculada. Registros antigos não são recalculados.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    backgroundColor: "#151A17",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    gap: 13,
    marginBottom: 18,
  },
  topo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titulo: { color: "#F0F4F1", fontSize: 17, fontWeight: "800" },
  subtitulo: { color: "#98A39B", fontSize: 12 },
  atualizar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  textoAtualizar: { fontSize: 22, fontWeight: "800" },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  indicador: {
    flexGrow: 1,
    flexBasis: "44%",
    backgroundColor: "#1D241F",
    borderRadius: 11,
    padding: 11,
    gap: 4,
    minWidth: 105,
  },
  emoji: { fontSize: 18 },
  numero: { color: "#F0F4F1", fontSize: 20, fontWeight: "900" },
  rotulo: { color: "#9BA69E", fontSize: 11 },
  erro: { color: "#F28B82", fontSize: 12 },
  nota: { color: "#8F9A92", fontSize: 11, lineHeight: 16 },
});
