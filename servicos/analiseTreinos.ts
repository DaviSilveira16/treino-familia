/** Estatísticas e sugestões transparentes: sem metas e sem IA paga. */
export type SessaoHistorica = {
  id: string;
  started_at: string;
  status: string | null;
  notes?: string | null;
};
export type SerieHistorica = {
  session_id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  set_number: number;
  reps: number;
  weight_kg: number;
};
export type PontoEvolucao = {
  id: string;
  data: string;
  cargaMaxima: number;
  repsNaMaiorCarga: number;
  volume: number;
  quantidadeSeries: number;
};
export type Recorde = {
  chave: string;
  nome: string;
  data: string;
  tipo: "carga" | "repeticoes" | "volume";
  valor: number;
  anterior: number;
  reps?: number;
  carga?: number;
};
export type Sugestao = {
  titulo: string;
  texto: string;
  tipo: "evolucao" | "descanso" | "observacao";
};
export type AnaliseHistorico = {
  porExercicio: Record<string, { nome: string; pontos: PontoEvolucao[] }>;
  recordes: Recorde[];
  treinos30Dias: number;
  treinos30DiasAnteriores: number;
  recordes30Dias: number;
};

export function normalizarExercicio(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function analisarHistorico(
  sessoes: SessaoHistorica[],
  series: SerieHistorica[],
  agora = Date.now(),
): AnaliseHistorico {
  const completas = sessoes.filter(
    (s) =>
      s.status !== "em_andamento" && Number.isFinite(Date.parse(s.started_at)),
  );
  const sessoesPorId = new Map(completas.map((s) => [s.id, s]));
  const grupos = new Map<
    string,
    {
      nome: string;
      chave: string;
      sessao: SessaoHistorica;
      series: SerieHistorica[];
    }
  >();
  for (const serie of series) {
    const sessao = sessoesPorId.get(serie.session_id);
    if (!sessao) continue;
    const nome = serie.exercise_name?.trim() || "Exercício sem nome";
    const chave = normalizarExercicio(nome);
    const grupoId = `${chave}::${sessao.id}`;
    const grupo = grupos.get(grupoId) ?? { nome, chave, sessao, series: [] };
    grupo.series.push(serie);
    grupos.set(grupoId, grupo);
  }
  const porExercicio: AnaliseHistorico["porExercicio"] = {};
  const recordes: Recorde[] = [];
  const melhores = new Map<
    string,
    { carga: number; volume: number; repsPorCarga: Map<number, number> }
  >();
  const ordenados = Array.from(grupos.values()).sort(
    (a, b) => Date.parse(a.sessao.started_at) - Date.parse(b.sessao.started_at),
  );
  for (const grupo of ordenados) {
    const carga = Math.max(
      0,
      ...grupo.series.map((s) => Number(s.weight_kg) || 0),
    );
    const reps = Math.max(
      0,
      ...grupo.series
        .filter((s) => Number(s.weight_kg) === carga)
        .map((s) => Number(s.reps) || 0),
    );
    const volume = grupo.series.reduce(
      (total, s) => total + (Number(s.weight_kg) || 0) * (Number(s.reps) || 0),
      0,
    );
    const ponto: PontoEvolucao = {
      id: grupo.sessao.id,
      data: grupo.sessao.started_at,
      cargaMaxima: carga,
      repsNaMaiorCarga: reps,
      volume,
      quantidadeSeries: grupo.series.length,
    };
    if (!porExercicio[grupo.chave])
      porExercicio[grupo.chave] = { nome: grupo.nome, pontos: [] };
    porExercicio[grupo.chave].pontos.push(ponto);
    const anterior = melhores.get(grupo.chave);
    if (anterior) {
      if (carga > anterior.carga && carga > 0)
        recordes.push({
          chave: grupo.chave,
          nome: grupo.nome,
          data: ponto.data,
          tipo: "carga",
          valor: carga,
          anterior: anterior.carga,
          reps,
          carga,
        });
      else {
        const repsAnteriores = anterior.repsPorCarga.get(carga);
        if (repsAnteriores !== undefined && reps > repsAnteriores)
          recordes.push({
            chave: grupo.chave,
            nome: grupo.nome,
            data: ponto.data,
            tipo: "repeticoes",
            valor: reps,
            anterior: repsAnteriores,
            carga,
          });
      }
      if (volume > anterior.volume && volume > 0)
        recordes.push({
          chave: grupo.chave,
          nome: grupo.nome,
          data: ponto.data,
          tipo: "volume",
          valor: volume,
          anterior: anterior.volume,
        });
    }
    const porCarga = new Map(anterior?.repsPorCarga ?? []);
    for (const s of grupo.series) {
      const kg = Number(s.weight_kg) || 0;
      porCarga.set(kg, Math.max(porCarga.get(kg) || 0, Number(s.reps) || 0));
    }
    melhores.set(grupo.chave, {
      carga: Math.max(anterior?.carga ?? 0, carga),
      volume: Math.max(anterior?.volume ?? 0, volume),
      repsPorCarga: porCarga,
    });
  }
  const limite30 = agora - 30 * 86400000;
  const limite60 = agora - 60 * 86400000;
  const treinos30Dias = completas.filter(
    (s) =>
      Date.parse(s.started_at) >= limite30 && Date.parse(s.started_at) <= agora,
  ).length;
  const treinos30DiasAnteriores = completas.filter(
    (s) =>
      Date.parse(s.started_at) >= limite60 &&
      Date.parse(s.started_at) < limite30,
  ).length;
  const recordes30Dias = recordes.filter(
    (r) => Date.parse(r.data) >= limite30 && Date.parse(r.data) <= agora,
  ).length;
  return {
    porExercicio,
    recordes,
    treinos30Dias,
    treinos30DiasAnteriores,
    recordes30Dias,
  };
}

export function gerarSugestoes(
  nome: string,
  pontos: PontoEvolucao[],
  esforcoMaisRecente?: string,
): Sugestao[] {
  if (pontos.length < 3)
    return [
      {
        titulo: "Construindo seu histórico",
        texto: `Depois de pelo menos três sessões de ${nome}, poderemos observar tendências. Por enquanto, registre o treino no seu ritmo.`,
        tipo: "observacao",
      },
    ];
  const ultimos = pontos.slice(-3);
  const sugestoes: Sugestao[] = [];
  const cargaEstavel = ultimos.every(
    (p) => Math.abs(p.cargaMaxima - ultimos[0].cargaMaxima) < 0.01,
  );
  const repeticoesEstaveis = ultimos.every(
    (p) => p.repsNaMaiorCarga >= ultimos[0].repsNaMaiorCarga,
  );
  if (cargaEstavel && repeticoesEstaveis && esforcoMaisRecente !== "intenso") {
    sugestoes.push({
      titulo: "Possível progressão",
      texto: `Nas últimas três sessões de ${nome}, a maior carga ficou em ${ultimos[0].cargaMaxima.toLocaleString("pt-BR")} kg, com repetições estáveis ou crescentes. Se a execução estiver confortável, você pode considerar uma pequena progressão, sem obrigação.`,
      tipo: "evolucao",
    });
  }
  if (pontos.length >= 4) {
    const anterior = pontos.slice(-4, -2).reduce((s, p) => s + p.volume, 0) / 2;
    const recente = pontos.slice(-2).reduce((s, p) => s + p.volume, 0) / 2;
    if (anterior > 0 && recente < anterior * 0.85)
      sugestoes.push({
        titulo: "Observe sua recuperação",
        texto: `O volume das duas últimas sessões de ${nome} ficou abaixo das duas anteriores. Isso não indica necessariamente um problema: vale observar descanso, execução e como você se sente.`,
        tipo: "descanso",
      });
  }
  if (esforcoMaisRecente === "intenso")
    sugestoes.push({
      titulo: "Respeite seu ritmo",
      texto:
        "Você descreveu o último treino como intenso. Antes de pensar em aumentar cargas, observe como está sua recuperação.",
      tipo: "descanso",
    });
  if (sugestoes.length === 0)
    sugestoes.push({
      titulo: "Acompanhe a tendência",
      texto: `Você já tem ${pontos.length} sessões de ${nome} registradas. Compare a evolução das cargas e repetições no seu ritmo; não há metas obrigatórias.`,
      tipo: "observacao",
    });
  return sugestoes;
}

export function extrairEsforco(notes?: string | null) {
  const encontrado = notes?.match(
    /(?:^|;)esforco_percebido=(leve|adequado|intenso)(?:;|$)/,
  );
  return encontrado?.[1];
}
