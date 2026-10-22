export type IntensidadeTreino = "leve" | "moderada" | "intensa";
export type SexoTreino = "masculino" | "feminino";

export type SerieCalculoTreino = {
  exercise_id?: string | null;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
};

export type DadosCalculoTreino = {
  pesoKg: number;
  alturaCm: number;
  idade: number;
  sexo: SexoTreino;
  duracaoMinutos: number;
  intensidade: IntensidadeTreino;
  series: SerieCalculoTreino[];
};

export type EstimativaCaloriasTreino = {
  caloriasAtivas: number;
  met: number;
  quantidadeExercicios: number;
  quantidadeSeries: number;
  repeticoesTotais: number;
  volumeCargaKg: number;
};

function metabolismoRepousoKcalDia(dados: DadosCalculoTreino): number {
  const ajusteSexo = dados.sexo === "masculino" ? 5 : -161;
  return Math.max(
    0,
    10 * dados.pesoKg + 6.25 * dados.alturaCm - 5 * dados.idade + ajusteSexo,
  );
}

export function estimarCaloriasAtivasTreino(
  dados: DadosCalculoTreino,
): EstimativaCaloriasTreino | null {
  if (
    !Number.isFinite(dados.pesoKg) || dados.pesoKg < 20 || dados.pesoKg > 400 ||
    !Number.isFinite(dados.alturaCm) || dados.alturaCm < 100 || dados.alturaCm > 250 ||
    !Number.isInteger(dados.idade) || dados.idade < 18 || dados.idade > 110 ||
    (dados.sexo !== "masculino" && dados.sexo !== "feminino") ||
    !Number.isFinite(dados.duracaoMinutos) || dados.duracaoMinutos <= 0 || dados.duracaoMinutos > 600 ||
    !["leve", "moderada", "intensa"].includes(dados.intensidade)
  ) {
    return null;
  }

  const seriesValidas = dados.series.filter(
    (serie) =>
      Number.isInteger(serie.set_number) && serie.set_number > 0 &&
      Number.isInteger(serie.reps) && serie.reps > 0 &&
      Number.isFinite(serie.weight_kg) && serie.weight_kg >= 0,
  );
  const exercicios = new Set(
    seriesValidas.map((serie) => serie.exercise_id || serie.exercise_name.trim().toLocaleLowerCase("pt-BR")),
  );
  const repeticoesTotais = seriesValidas.reduce((total, serie) => total + serie.reps, 0);
  const volumeCargaKg = seriesValidas.reduce(
    (total, serie) => total + serie.reps * serie.weight_kg,
    0,
  );

  // Faixas MET aproximadas para musculação leve, moderada e vigorosa.
  // Cargas, séries e repetições são preservadas e resumidas como volume realizado;
  // não são convertidas diretamente em calorias, pois isso não é uma relação
  // fisiológica validada sem conhecer, entre outros fatores, amplitude, cadência e descansos.
  const metPorIntensidade: Record<IntensidadeTreino, number> = {
    leve: 2.5,
    moderada: 3.5,
    intensa: 6,
  };
  const met = metPorIntensidade[dados.intensidade];
  const caloriasBrutas = (met * 3.5 * dados.pesoKg * dados.duracaoMinutos) / 200;
  const gastoRepousoDuranteSessao =
    (metabolismoRepousoKcalDia(dados) / 1440) * dados.duracaoMinutos;
  const caloriasAtivas = Math.max(0, caloriasBrutas - gastoRepousoDuranteSessao);

  return {
    caloriasAtivas: Math.round(caloriasAtivas),
    met,
    quantidadeExercicios: exercicios.size,
    quantidadeSeries: seriesValidas.length,
    repeticoesTotais,
    volumeCargaKg: Math.round(volumeCargaKg * 100) / 100,
  };
}
