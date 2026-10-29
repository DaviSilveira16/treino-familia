import { metabolismoRepousoKcalDia } from "./metabolismo";

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
export type PerfilCalculoTreino = Pick<DadosCalculoTreino, "pesoKg" | "alturaCm" | "idade" | "sexo">;
export function normalizarDuracaoMinutos(duracaoMinutos: number): number | null {
  if (!Number.isFinite(duracaoMinutos) || duracaoMinutos < 0.5 || duracaoMinutos > 600)
    return null;
  return Math.max(1, Math.round(duracaoMinutos));
}
export function lerPerfilTreino(metadados: Record<string, unknown>): PerfilCalculoTreino | null {
  const pesoKg = Number(metadados.peso_kg), alturaCm = Number(metadados.altura_cm), idade = Number(metadados.idade), sexo = metadados.sexo;
  if (!Number.isFinite(pesoKg) || pesoKg < 20 || pesoKg > 400 || !Number.isFinite(alturaCm) || alturaCm < 100 || alturaCm > 250
    || !Number.isInteger(idade) || idade < 18 || idade > 110 || (sexo !== "masculino" && sexo !== "feminino")) return null;
  return { pesoKg, alturaCm, idade, sexo };
}
export function metricasRegistroTreino(perfil: PerfilCalculoTreino | null, duracaoMinutos: number, intensidade: IntensidadeTreino, series: SerieCalculoTreino[]): Record<string, string | number | null> {
  const duracaoNormalizada = normalizarDuracaoMinutos(duracaoMinutos);
  if (duracaoNormalizada === null || !["leve", "moderada", "intensa"].includes(intensidade)) throw new Error("Informe a intensidade e uma duração entre 0,5 e 600 minutos.");
  if (!series.length || series.some(s => !Number.isInteger(s.reps) || s.reps < 1 || s.reps > 1000 || !Number.isFinite(s.weight_kg) || s.weight_kg < 0 || s.weight_kg > 2000)) throw new Error("Confira as séries, repetições e cargas realizadas.");
  const estimativa = perfil ? estimarCaloriasAtivasTreino({ ...perfil, duracaoMinutos: duracaoNormalizada, intensidade, series }) : null;
  return { duration_minutes: duracaoNormalizada, intensity: intensidade, active_calories: estimativa?.caloriasAtivas ?? null,
    weight_kg_snapshot: perfil?.pesoKg ?? null, height_cm_snapshot: perfil?.alturaCm ?? null, age_snapshot: perfil?.idade ?? null, sex_snapshot: perfil?.sexo ?? null,
    met_value: estimativa?.met ?? null, volume_kg: Math.round(series.reduce((t, s) => t + s.reps * s.weight_kg, 0) * 100) / 100,
    exercises_count: new Set(series.map(s => s.exercise_id || s.exercise_name.trim().toLocaleLowerCase("pt-BR"))).size,
    sets_completed: series.length, reps_completed: series.reduce((t, s) => t + s.reps, 0) };
}

export type EstimativaCaloriasTreino = {
  caloriasAtivas: number;
  met: number;
  quantidadeExercicios: number;
  quantidadeSeries: number;
  repeticoesTotais: number;
  volumeCargaKg: number;
};

export function estimarCaloriasAtivasTreino(
  dados: DadosCalculoTreino,
): EstimativaCaloriasTreino | null {
  if (
    !Number.isFinite(dados.pesoKg) ||
    dados.pesoKg < 20 ||
    dados.pesoKg > 400 ||
    !Number.isFinite(dados.alturaCm) ||
    dados.alturaCm < 100 ||
    dados.alturaCm > 250 ||
    !Number.isInteger(dados.idade) ||
    dados.idade < 18 ||
    dados.idade > 110 ||
    (dados.sexo !== "masculino" && dados.sexo !== "feminino") ||
    !Number.isFinite(dados.duracaoMinutos) ||
    dados.duracaoMinutos <= 0 ||
    dados.duracaoMinutos > 600 ||
    !["leve", "moderada", "intensa"].includes(dados.intensidade) ||
    !Array.isArray(dados.series)
  ) {
    return null;
  }

  const seriesValidas = dados.series.filter(
    (serie) =>
      Number.isInteger(serie.set_number) &&
      serie.set_number > 0 &&
      Number.isInteger(serie.reps) &&
      serie.reps > 0 &&
      Number.isFinite(serie.weight_kg) &&
      serie.weight_kg >= 0,
  );
  if (seriesValidas.length === 0) return null;

  const exercicios = new Set(
    seriesValidas.map(
      (serie) =>
        serie.exercise_id ||
        serie.exercise_name.trim().toLocaleLowerCase("pt-BR"),
    ),
  );
  const repeticoesTotais = seriesValidas.reduce(
    (total, serie) => total + serie.reps,
    0,
  );
  const volumeCargaKg = seriesValidas.reduce(
    (total, serie) => total + serie.reps * serie.weight_kg,
    0,
  );

  const metPorIntensidade: Record<IntensidadeTreino, number> = {
    leve: 2.5,
    moderada: 3.5,
    intensa: 6,
  };
  const met = metPorIntensidade[dados.intensidade];
  const caloriasBrutas =
    (met * 3.5 * dados.pesoKg * dados.duracaoMinutos) / 200;
  const gastoRepousoDuranteSessao =
    (metabolismoRepousoKcalDia(dados) / 1440) * dados.duracaoMinutos;
  const caloriasAtivas = Math.max(
    0,
    caloriasBrutas - gastoRepousoDuranteSessao,
  );

  return {
    caloriasAtivas: Math.round(caloriasAtivas),
    met,
    quantidadeExercicios: exercicios.size,
    quantidadeSeries: seriesValidas.length,
    repeticoesTotais,
    volumeCargaKg: Math.round(volumeCargaKg * 100) / 100,
  };
}
