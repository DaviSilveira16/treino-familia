import { metabolismoRepousoKcalDia } from "./metabolismo";

export type IntensidadeCardio = "leve" | "moderada" | "intensa";
export type SexoCardio = "masculino" | "feminino";
export type CategoriaCardio =
  | "esteira"
  | "escadas"
  | "caminhada"
  | "corrida"
  | "bicicleta"
  | "eliptico"
  | "pilates"
  | "outro";

export type DadosCalculoCardio = {
  tipo: string;
  intensidade: IntensidadeCardio;
  pesoKg: number;
  alturaCm: number;
  idade: number;
  sexo: SexoCardio;
  duracaoMinutos: number;
  distanciaKm?: number | null;
  inclinacaoPercentual?: number | null;
  andaresSubidos?: number | null;
};

export type EstimativaCalorias = {
  caloriasAtivas: number;
  met: number;
  velocidadeKmh: number | null;
};

export function normalizarTipoCardio(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function categoriaDoCardio(tipo: string): CategoriaCardio {
  const nome = normalizarTipoCardio(tipo);
  if (nome.includes("escada")) return "escadas";
  if (nome.includes("esteira")) return "esteira";
  if (nome.includes("caminhada") || nome.includes("caminhar"))
    return "caminhada";
  if (nome.includes("corrida") || nome.includes("correr")) return "corrida";
  if (nome.includes("bicicleta") || nome.includes("bike")) return "bicicleta";
  if (nome.includes("eliptico")) return "eliptico";
  if (nome.includes("pilates")) return "pilates";
  return "outro";
}

function metBase(
  categoria: CategoriaCardio,
  intensidade: IntensidadeCardio,
): number {
  const valores: Record<CategoriaCardio, Record<IntensidadeCardio, number>> = {
    esteira: { leve: 3, moderada: 4.5, intensa: 6.5 },
    escadas: { leve: 4.5, moderada: 7.5, intensa: 9 },
    caminhada: { leve: 2.8, moderada: 3.8, intensa: 5 },
    corrida: { leve: 6.5, moderada: 8.5, intensa: 11 },
    bicicleta: { leve: 3.5, moderada: 6, intensa: 9 },
    eliptico: { leve: 3.5, moderada: 5, intensa: 7 },
    pilates: { leve: 2.3, moderada: 3, intensa: 4 },
    outro: { leve: 2.5, moderada: 4, intensa: 6 },
  };
  return valores[categoria][intensidade];
}

function estimarMetPorRitmo(
  categoria: CategoriaCardio,
  velocidadeKmh: number,
): number {
  if (categoria === "caminhada") {
    if (velocidadeKmh < 3) return 2.8;
    if (velocidadeKmh < 4) return 3.2;
    if (velocidadeKmh < 5) return 3.8;
    if (velocidadeKmh < 6) return 4.8;
    return 5.5;
  }
  if (categoria === "corrida") {
    if (velocidadeKmh < 6) return 5;
    if (velocidadeKmh < 8) return 6.5;
    if (velocidadeKmh < 10) return 8.5;
    if (velocidadeKmh < 12) return 9.8;
    if (velocidadeKmh < 14) return 11.5;
    return 12.5;
  }
  if (categoria === "bicicleta") {
    if (velocidadeKmh < 10) return 3.5;
    if (velocidadeKmh < 12) return 5.8;
    if (velocidadeKmh < 14) return 6.8;
    if (velocidadeKmh < 16) return 8;
    if (velocidadeKmh < 20) return 10;
    return 12;
  }
  return 0;
}

function metPorEquacaoEsteira(
  velocidadeKmh: number,
  inclinacaoPercentual: number,
): number | null {
  if (velocidadeKmh < 3 || velocidadeKmh > 18) return null;
  const velocidadeMetrosMinuto = (velocidadeKmh * 1000) / 60;
  const inclinacao = inclinacaoPercentual / 100;
  const consumoOxigenio =
    velocidadeKmh < 8
      ? 0.1 * velocidadeMetrosMinuto +
        1.8 * velocidadeMetrosMinuto * inclinacao +
        3.5
      : 0.2 * velocidadeMetrosMinuto +
        0.9 * velocidadeMetrosMinuto * inclinacao +
        3.5;
  const met = consumoOxigenio / 3.5;
  return Number.isFinite(met) && met > 1 ? met : null;
}

export function estimarCaloriasAtivas(
  dados: DadosCalculoCardio,
): EstimativaCalorias | null {
  const { tipo, intensidade, pesoKg, alturaCm, idade, sexo, duracaoMinutos } =
    dados;
  if (
    !Number.isFinite(pesoKg) ||
    pesoKg < 20 ||
    pesoKg > 400 ||
    !Number.isFinite(alturaCm) ||
    alturaCm < 100 ||
    alturaCm > 250 ||
    !Number.isFinite(idade) ||
    idade < 18 ||
    idade > 110 ||
    (sexo !== "masculino" && sexo !== "feminino") ||
    !Number.isFinite(duracaoMinutos) ||
    duracaoMinutos <= 0 ||
    duracaoMinutos > 1440
  ) {
    return null;
  }

  const categoria = categoriaDoCardio(tipo);
  const distanciaKm = dados.distanciaKm ?? null;
  const velocidadeKmh =
    distanciaKm !== null && Number.isFinite(distanciaKm) && distanciaKm > 0
      ? distanciaKm / (duracaoMinutos / 60)
      : null;
  const inclinacao = dados.inclinacaoPercentual ?? 0;
  let met = metBase(categoria, intensidade);

  if (
    categoria === "escadas" &&
    dados.andaresSubidos != null &&
    dados.andaresSubidos > 0
  ) {
    const andaresPorMinuto = dados.andaresSubidos / duracaoMinutos;
    const metPelosAndares =
      andaresPorMinuto < 0.5
        ? 4.5
        : andaresPorMinuto < 1
          ? 6
          : andaresPorMinuto < 1.5
            ? 7.5
            : andaresPorMinuto < 2
              ? 9
              : 10;
    const ajusteIntensidade =
      intensidade === "leve" ? -0.5 : intensidade === "intensa" ? 0.5 : 0;
    met = Math.max(3.5, Math.min(12, metPelosAndares + ajusteIntensidade));
  }

  if (
    (categoria === "caminhada" || categoria === "corrida") &&
    velocidadeKmh !== null
  ) {
    if (
      categoria === "caminhada" &&
      velocidadeKmh >= 3 &&
      velocidadeKmh <= 7.2
    ) {
      const velocidadeMetrosMinuto = (velocidadeKmh * 1000) / 60;
      met = (0.1 * velocidadeMetrosMinuto + 3.5) / 3.5;
    } else if (
      categoria === "corrida" &&
      velocidadeKmh >= 8 &&
      velocidadeKmh <= 18
    ) {
      const velocidadeMetrosMinuto = (velocidadeKmh * 1000) / 60;
      met = (0.2 * velocidadeMetrosMinuto + 3.5) / 3.5;
    } else {
      met = estimarMetPorRitmo(categoria, velocidadeKmh);
    }
  }

  if (categoria === "bicicleta" && velocidadeKmh !== null) {
    const metPelaVelocidade = estimarMetPorRitmo(categoria, velocidadeKmh);
    if (metPelaVelocidade > 0) met = (met + metPelaVelocidade) / 2;
  }

  if (categoria === "esteira") {
    if (!Number.isFinite(inclinacao) || inclinacao < 0 || inclinacao > 15)
      return null;
    if (velocidadeKmh !== null) {
      const metEsteira = metPorEquacaoEsteira(velocidadeKmh, inclinacao);
      if (metEsteira !== null) met = metEsteira;
      else if (inclinacao > 0) return null;
      else
        met = estimarMetPorRitmo(
          velocidadeKmh < 8 ? "caminhada" : "corrida",
          velocidadeKmh,
        );
    } else if (inclinacao > 0) {
      return null;
    }
  }

  if (!Number.isFinite(met) || met <= 1) return null;

  const caloriasBrutas = (met * 3.5 * pesoKg * duracaoMinutos) / 200;
  const gastoRepousoDuranteSessao =
    (metabolismoRepousoKcalDia(dados) / 1440) * duracaoMinutos;
  const caloriasAtivas = Math.max(
    0,
    caloriasBrutas - gastoRepousoDuranteSessao,
  );

  return {
    caloriasAtivas: Math.round(caloriasAtivas),
    met: Math.round(met * 10) / 10,
    velocidadeKmh:
      velocidadeKmh === null ? null : Math.round(velocidadeKmh * 100) / 100,
  };
}
