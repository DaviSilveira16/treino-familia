export type IntensidadeCardio = "leve" | "moderada" | "intensa";

export type DadosCalculoCardio = {
  tipo: string;
  intensidade: IntensidadeCardio;
  pesoKg: number;
  duracaoMinutos: number;
  velocidadeKmh?: number | null;
  inclinacaoPercentual?: number | null;
};

export type EstimativaCalorias = {
  caloriasAtivas: number;
  met: number;
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function metBase(tipo: string, intensidade: IntensidadeCardio) {
  const nome = normalizar(tipo);
  const valores: Record<string, Record<IntensidadeCardio, number>> = {
    bicicleta: { leve: 3.5, moderada: 6, intensa: 9 },
    escada: { leve: 4.5, moderada: 7.5, intensa: 9 },
    escadas: { leve: 4.5, moderada: 7.5, intensa: 9 },
    esteira: { leve: 2.8, moderada: 4.3, intensa: 6.5 },
    caminhada: { leve: 2.8, moderada: 3.8, intensa: 5 },
    corrida: { leve: 6.5, moderada: 8.5, intensa: 11 },
    eliptico: { leve: 3.5, moderada: 5, intensa: 7 },
    outro: { leve: 2.5, moderada: 4, intensa: 6 },
  };

  const chave = Object.keys(valores).find((item) => nome.includes(item));
  return chave ? valores[chave][intensidade] : valores.outro[intensidade];
}

export function estimarCaloriasAtivas(
  dados: DadosCalculoCardio,
): EstimativaCalorias | null {
  const { tipo, intensidade, pesoKg, duracaoMinutos } = dados;
  if (
    !Number.isFinite(pesoKg) ||
    pesoKg <= 0 ||
    !Number.isFinite(duracaoMinutos) ||
    duracaoMinutos <= 0
  ) {
    return null;
  }

  let met = metBase(tipo, intensidade);
  const nome = normalizar(tipo);
  const velocidade = dados.velocidadeKmh ?? null;
  const inclinacao = dados.inclinacaoPercentual ?? 0;

  if (
    nome.includes("caminhada") &&
    velocidade !== null &&
    Number.isFinite(velocidade) &&
    velocidade > 0
  ) {
    met =
      velocidade < 3
        ? 2.8
        : velocidade < 4.5
          ? 3.5
          : velocidade < 5.5
            ? 4.3
            : 5;
  }

  if (
    nome.includes("corrida") &&
    velocidade !== null &&
    Number.isFinite(velocidade) &&
    velocidade > 0
  ) {
    met =
      velocidade < 8 ? 6.5 : velocidade < 10 ? 8.5 : velocidade < 12 ? 9.8 : 11;
  }

  if (
    nome.includes("esteira") &&
    velocidade !== null &&
    Number.isFinite(velocidade) &&
    velocidade >= 3 &&
    velocidade <= 18 &&
    Number.isFinite(inclinacao) &&
    inclinacao >= 0 &&
    inclinacao <= 25
  ) {
    const velocidadeMetrosMinuto = (velocidade * 1000) / 60;
    const usaEquacaoCorrida = velocidade >= 8;
    const vo2 = usaEquacaoCorrida
      ? 0.2 * velocidadeMetrosMinuto +
        0.9 * velocidadeMetrosMinuto * (inclinacao / 100) +
        3.5
      : 0.1 * velocidadeMetrosMinuto +
        1.8 * velocidadeMetrosMinuto * (inclinacao / 100) +
        3.5;
    const metEsteira = vo2 / 3.5;
    if (Number.isFinite(metEsteira) && metEsteira > 1) met = metEsteira;
  }

  const caloriasAtivas = Math.max(
    0,
    ((met - 1) * 3.5 * pesoKg * duracaoMinutos) / 200,
  );

  return {
    caloriasAtivas: Math.round(caloriasAtivas),
    met: Math.round(met * 10) / 10,
  };
}
