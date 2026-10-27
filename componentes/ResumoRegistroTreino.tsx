import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  estimarCaloriasAtivasTreino,
  type IntensidadeTreino,
  type PerfilCalculoTreino,
  type SerieCalculoTreino,
} from "../servicos/caloriasTreino";
import type { EsforcoPercebido } from "../servicos/treinoLocal";

export default function ResumoRegistroTreino({
  perfil,
  series,
  duracao,
  onDuracao,
  intensidade,
  onIntensidade,
  esforco,
  onEsforco,
  cor,
  bloqueado = false,
}: {
  perfil: PerfilCalculoTreino | null;
  series: SerieCalculoTreino[];
  duracao: string;
  onDuracao: (s: string) => void;
  intensidade: IntensidadeTreino | null;
  onIntensidade: (i: IntensidadeTreino) => void;
  esforco: EsforcoPercebido;
  onEsforco: (e: EsforcoPercebido) => void;
  cor: string;
  bloqueado?: boolean;
}) {
  const minutos = Number(duracao.replace(",", "."));
  const valoresValidos = series.every(
    (s) =>
      Number.isInteger(s.reps) &&
      s.reps > 0 &&
      s.reps <= 1000 &&
      Number.isFinite(s.weight_kg) &&
      s.weight_kg >= 0 &&
      s.weight_kg <= 2000,
  );
  const estimativa =
    perfil && intensidade && valoresValidos
      ? estimarCaloriasAtivasTreino({
          ...perfil,
          duracaoMinutos: minutos,
          intensidade,
          series,
        })
      : null;
  return (
    <View style={s.grupo}>
      <Text style={s.titulo}>Como foi o treino?</Text>
      <Text style={s.texto}>Tempo de treino (minutos)</Text>
      <TextInput
        accessibilityLabel="Duração do treino em minutos"
        value={duracao}
        onChangeText={onDuracao}
        editable={!bloqueado}
        keyboardType="decimal-pad"
        placeholder="Ex.: 45"
        placeholderTextColor="#828A85"
        style={s.input}
      />
      <Text style={s.texto}>Intensidade da musculação</Text>
      <View style={s.linha}>
        {(
          [
            ["leve", "Leve"],
            ["moderada", "Moderada"],
            ["intensa", "Intensa"],
          ] as const
        ).map(([valor, rotulo]) => (
          <TouchableOpacity
            key={valor}
            accessibilityRole="button"
            accessibilityLabel={`Intensidade do treino: ${rotulo}`}
            accessibilityState={{ selected: intensidade === valor }}
            disabled={bloqueado}
            onPress={() => onIntensidade(valor)}
            style={[
              s.botao,
              intensidade === valor && {
                borderColor: cor,
                backgroundColor: `${cor}18`,
              },
            ]}
          >
            <Text style={s.texto}>{rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.ajuda}>
        Leve: esforço confortável. Moderada: esforço perceptível. Intensa:
        esforço elevado. Considere a sessão inteira, incluindo os descansos.
      </Text>
      <Text style={s.texto}>Como você se sentiu? (opcional)</Text>
      <View style={s.linha}>
        {(
          [
            ["nao_informado", "Pular"],
            ["leve", "Leve"],
            ["adequado", "Adequado"],
            ["intenso", "Intenso"],
          ] as const
        ).map(([valor, rotulo]) => (
          <TouchableOpacity
            key={valor}
            accessibilityRole="button"
            accessibilityLabel={`Esforço percebido: ${rotulo}`}
            accessibilityState={{ selected: esforco === valor }}
            disabled={bloqueado}
            onPress={() => onEsforco(valor)}
            style={[s.botao, esforco === valor && { borderColor: cor }]}
          >
            <Text style={s.texto}>{rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.texto}>
        {valoresValidos
          ? `${series.length} séries · ${series.reduce((a, b) => a + b.reps, 0)} repetições · ${Math.round(series.reduce((a, b) => a + b.reps * b.weight_kg, 0)).toLocaleString("pt-BR")} kg × reps`
          : "Confira as repetições e cargas das séries selecionadas."}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={[s.calorias, { color: cor }]}
      >
        {estimativa
          ? `≈ ${estimativa.caloriasAtivas} kcal ativas estimadas`
          : !perfil
            ? "Complete peso, altura, idade e sexo em Meu Perfil para estimar calorias."
            : "Informe tempo, intensidade e séries realizadas para ver a estimativa."}
      </Text>
      <Text style={s.ajuda}>
        Estimativa por perfil, tempo e intensidade. Exercícios, repetições e
        cargas ficam no histórico; pesos de aparelhos diferentes não se
        equivalem e não se convertem diretamente em calorias. É uma aproximação.
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  grupo: { gap: 10 },
  titulo: { color: "#F0F4F1", fontWeight: "800", fontSize: 18 },
  texto: { color: "#E1E8E3", fontSize: 14 },
  ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 19 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  botao: {
    borderColor: "#45544A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  input: {
    borderColor: "#45544A",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    color: "#F0F4F1",
    backgroundColor: "#101312",
  },
  calorias: { fontSize: 16, fontWeight: "800" },
});
