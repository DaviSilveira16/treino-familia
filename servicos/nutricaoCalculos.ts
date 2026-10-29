import type {
  AlimentoNutricao,
  AtividadeNutricional,
  ConfiguracaoNutricional,
  DiaNutricao,
  ItemRefeicao,
  ModeloDieta,
  Nutrientes,
  PreferenciasNutricao,
  RefeicaoNutricao,
} from "./nutricaoTipos";

const chavesNutrientes = [
  "kcal",
  "proteinas",
  "carboidratos",
  "gorduras",
] as const;
const zerarNutrientes = (): Nutrientes => ({
  kcal: 0,
  proteinas: 0,
  carboidratos: 0,
  gorduras: 0,
});
const arredondar = (valor: number) => Math.round(valor * 10000) / 10000;

export function novoIdNutricao(): string {
  const bytes = new Uint8Array(16);
  const cryptoWeb =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoWeb?.getRandomValues) cryptoWeb.getRandomValues(bytes);
  else
    for (let indice = 0; indice < bytes.length; indice++)
      bytes[indice] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dataLocal(data: Date = new Date()): string {
  if (!Number.isFinite(data.getTime())) throw new Error("Data inválida.");
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function lerData(data: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Data inválida.");
  // Meio-dia local evita deslocamentos de dia nas transições de horário de verão.
  const resultado = new Date(`${data}T12:00:00`);
  if (!Number.isFinite(resultado.getTime()) || dataLocal(resultado) !== data)
    throw new Error("Data inválida.");
  return resultado;
}

export function deslocarDia(data: string, delta: number): string {
  if (!Number.isInteger(delta)) throw new Error("O deslocamento deve ser em dias inteiros.");
  const resultado = lerData(data);
  resultado.setDate(resultado.getDate() + delta);
  return dataLocal(resultado);
}

/** Semana civil de segunda-feira a domingo no calendário local do usuário. */
export function semanaDaData(data: string): string[] {
  const dia = lerData(data);
  const segunda = deslocarDia(data, -((dia.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, indice) => deslocarDia(segunda, indice));
}

export function numeroNutricional(texto: string): number | null {
  const valor = texto.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(valor)) return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function nutrientesValidos(nutrientes: Nutrientes): boolean {
  return Boolean(
    nutrientes &&
      chavesNutrientes.every(
        (chave) => Number.isFinite(nutrientes[chave]) && nutrientes[chave] >= 0,
      ),
  );
}

export function validarAlimento(alimento: AlimentoNutricao): void {
  if (!alimento.nome?.trim()) throw new Error("Informe o nome do alimento.");
  if (!Number.isFinite(alimento.baseGramas) || alimento.baseGramas <= 0)
    throw new Error("Informe uma quantidade de referência maior que zero.");
  if (!nutrientesValidos(alimento.nutrientes))
    throw new Error("Calorias e macronutrientes devem ser números iguais ou maiores que zero.");
}

export function nutrientesItem(item: ItemRefeicao): Nutrientes {
  if (
    !Number.isFinite(item.gramas) ||
    item.gramas <= 0 ||
    !Number.isFinite(item.baseGramas) ||
    item.baseGramas <= 0 ||
    !nutrientesValidos(item.nutrientesBase)
  )
    throw new Error(`Confira a quantidade e a tabela nutricional de ${item.nome || "um alimento"}.`);
  const fator = item.gramas / item.baseGramas;
  const resultado = zerarNutrientes();
  for (const chave of chavesNutrientes)
    resultado[chave] = arredondar(item.nutrientesBase[chave] * fator);
  return resultado;
}

function acumular(total: Nutrientes, parcela: Nutrientes): Nutrientes {
  for (const chave of chavesNutrientes)
    total[chave] = arredondar(total[chave] + parcela[chave]);
  return total;
}

export function somarNutrientes(
  refeicoes: RefeicaoNutricao[],
  apenasConsumidos = true,
): Nutrientes {
  const resultado = zerarNutrientes();
  for (const refeicao of refeicoes)
    for (const item of refeicao.itens)
      if (!apenasConsumidos || item.consumido)
        acumular(resultado, nutrientesItem(item));
  return resultado;
}

export function novasRefeicoes(): RefeicaoNutricao[] {
  return ["Café da manhã", "Almoço", "Jantar", "Lanches"].map((nome) => ({
    id: novoIdNutricao(),
    nome,
    horario: "",
    itens: [],
  }));
}

function clonarRefeicoes(refeicoes: RefeicaoNutricao[], origemModeloId?: string): RefeicaoNutricao[] {
  return refeicoes.map((refeicao) => ({
    ...refeicao,
    id: novoIdNutricao(),
    ...(origemModeloId ? { origemModeloId, origemRefeicaoId: refeicao.id } : {}),
    itens: refeicao.itens.map((item) => ({
      ...item,
      id: novoIdNutricao(),
      nutrientesBase: { ...item.nutrientesBase },
      consumido: false,
    })),
  }));
}

function clonarConfiguracao(
  configuracao: ConfiguracaoNutricional | null,
): ConfiguracaoNutricional | null {
  return configuracao
    ? { ...configuracao, perfil: configuracao.perfil ? { ...configuracao.perfil } : null }
    : null;
}

export function criarDia(
  usuarioId: string,
  data: string,
  configuracao: ConfiguracaoNutricional | null,
  modelo?: ModeloDieta | null,
): DiaNutricao {
  lerData(data);
  if (configuracao && (configuracao.usuarioId !== usuarioId || configuracao.vigenteDesde > data))
    throw new Error("A configuração não está disponível para este dia e usuário.");
  const dia: DiaNutricao = {
    id: novoIdNutricao(),
    usuarioId,
    data,
    refeicoes: novasRefeicoes(),
    concluido: false,
    modeloOrigemId: null,
    modeloVersao: null,
    configuracao: clonarConfiguracao(configuracao),
    alteradoEm: new Date().toISOString(),
  };
  return modelo ? aplicarModelo(dia, modelo) : dia;
}

export function aplicarModelo(dia: DiaNutricao, modelo: ModeloDieta): DiaNutricao {
  if (dia.usuarioId !== modelo.usuarioId || modelo.vigenteDesde > dia.data)
    throw new Error("Esta versão da dieta não está disponível para este dia.");
  if (dia.modeloOrigemId === modelo.id) return dia;
  if (dia.refeicoes.some((refeicao) => refeicao.itens.length > 0))
    throw new Error("Este dia já tem alimentos. Remova-os ou escolha outro dia para aplicar a dieta.");
  return {
    ...dia,
    refeicoes: clonarRefeicoes(modelo.refeicoes, modelo.id),
    concluido: false,
    modeloOrigemId: modelo.id,
    modeloVersao: modelo.versao,
    alteradoEm: new Date().toISOString(),
  };
}

/** Copia somente uma refeição salva como planejamento independente do diário. */
export function planejarRefeicaoDoModelo(
  dia: DiaNutricao,
  modelo: ModeloDieta,
  refeicaoId: string,
): DiaNutricao {
  if (dia.usuarioId !== modelo.usuarioId || modelo.vigenteDesde > dia.data)
    throw new Error("Esta dieta não está disponível para este dia e usuário.");
  if (dia.concluido) throw new Error("Reabra os registros do dia antes de adicionar uma refeição.");
  const refeicao = modelo.refeicoes.find((item) => item.id === refeicaoId);
  if (!refeicao) throw new Error("Esta refeição não foi encontrada na versão salva da dieta.");
  if (dia.refeicoes.some((item) => item.origemModeloId === modelo.id && item.origemRefeicaoId === refeicaoId))
    return dia;
  const [copia] = clonarRefeicoes([refeicao], modelo.id);
  const nome = refeicao.nome.trim().toLocaleLowerCase("pt-BR");
  const slot = dia.refeicoes.findIndex((item) => item.itens.length === 0 && item.nome.trim().toLocaleLowerCase("pt-BR") === nome);
  return {
    ...dia,
    refeicoes: slot < 0 ? [...dia.refeicoes, copia] : dia.refeicoes.map((item, indice) => indice === slot ? copia : item),
    alteradoEm: new Date().toISOString(),
  };
}

export function copiarDia(origem: DiaNutricao, destino: DiaNutricao | string): DiaNutricao {
  const novo = typeof destino === "string"
    ? criarDia(origem.usuarioId, destino, origem.configuracao)
    : destino;
  if (novo.usuarioId !== origem.usuarioId || novo.data === origem.data)
    throw new Error("Escolha outro dia da mesma conta para copiar as refeições.");
  if (novo.refeicoes.some((refeicao) => refeicao.itens.length > 0))
    throw new Error("O dia de destino já tem alimentos. A cópia não substituiu os registros.");
  return {
    ...novo,
    refeicoes: clonarRefeicoes(origem.refeicoes),
    concluido: false,
    modeloOrigemId: null,
    modeloVersao: null,
    alteradoEm: new Date().toISOString(),
  };
}

export function configuracaoNaData(
  configuracoes: ConfiguracaoNutricional[],
  data: string,
): ConfiguracaoNutricional | null {
  lerData(data);
  return [...configuracoes]
    .filter((configuracao) => configuracao.vigenteDesde <= data)
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde) || b.criadoEm.localeCompare(a.criadoEm) || b.id.localeCompare(a.id))[0] ?? null;
}

export function modeloNaData(
  modelos: ModeloDieta[],
  preferencias: PreferenciasNutricao,
  data: string,
): ModeloDieta | null {
  lerData(data);
  if (!preferencias.repetirDiariamente || !preferencias.modeloPadraoId || data < preferencias.repetirDesde)
    return null;
  const selecionado = modelos.find((modelo) => modelo.id === preferencias.modeloPadraoId);
  const grupoId = selecionado?.grupoId ?? preferencias.modeloPadraoId;
  return [...modelos]
    .filter((modelo) => modelo.grupoId === grupoId && modelo.vigenteDesde <= data)
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde) || b.versao - a.versao || b.criadoEm.localeCompare(a.criadoEm))[0] ?? null;
}

export type SituacaoNutricional = "deficit" | "superavit" | "manutencao" | "insuficiente" | "parcial" | "futuro";
export type ResumoDia = {
  data: string;
  temRegistro: boolean;
  itensConsumidos: number;
  consumido: Nutrientes;
  planejado: Nutrientes;
  metaKcal: number | null;
  gastoBase: number | null;
  gastoExercicio: number;
  gastoTotal: number | null;
  saldo: number | null;
  diferencaMeta: number | null;
  deficit: number;
  superavit: number;
  faixa: number;
  situacao: SituacaoNutricional;
  completo: boolean;
  desconhecidas: number;
  sessoes: number;
  minutos: number;
  musculacao: number;
  cardio: number;
  pendentes: number;
};

function classificarSaldo(saldo: number, faixa: number): SituacaoNutricional {
  return saldo < -faixa ? "deficit" : saldo > faixa ? "superavit" : "manutencao";
}

const positivoOuNulo = (valor: number | null | undefined) =>
  typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;

export function analisarDia(
  dia: DiaNutricao | null,
  atividades: AtividadeNutricional[],
  data: string,
  hoje: string = dataLocal(),
): ResumoDia {
  lerData(data);
  lerData(hoje);
  const diario = dia?.data === data ? dia : null;
  const consumido = zerarNutrientes();
  const planejado = zerarNutrientes();
  let itensConsumidos = 0;
  let itensInvalidos = 0;
  for (const refeicao of diario?.refeicoes ?? []) {
    for (const item of refeicao.itens) {
      try {
        const nutrientes = nutrientesItem(item);
        acumular(planejado, nutrientes);
        if (item.consumido) {
          acumular(consumido, nutrientes);
          itensConsumidos++;
        }
      } catch {
        itensInvalidos++;
      }
    }
  }
  // A mesma sessão pode aparecer no cache e na fila local. A confirmação
  // substitui a versão pendente, nunca soma a atividade novamente.
  const unicas = new Map<string, AtividadeNutricional>();
  for (const atividade of atividades.filter((item) => item.data === data)) {
    const chave = `${atividade.tipo}:${atividade.id}`;
    const anterior = unicas.get(chave);
    if (!anterior || anterior.pendente || !atividade.pendente)
      unicas.set(chave, atividade);
  }
  const sessoes = [...unicas.values()];
  const desconhecidas = sessoes.filter((atividade) =>
    atividade.caloriasAtivas === null || !Number.isFinite(atividade.caloriasAtivas) || atividade.caloriasAtivas < 0,
  ).length;
  const pendentes = sessoes.filter((atividade) => atividade.pendente).length;
  const gastoExercicio = arredondar(sessoes.reduce((total, atividade) =>
    total + (atividade.caloriasAtivas !== null && Number.isFinite(atividade.caloriasAtivas) && atividade.caloriasAtivas >= 0 ? atividade.caloriasAtivas : 0), 0));
  const configuracao = diario?.configuracao;
  const metaKcal = positivoOuNulo(configuracao?.metaKcal);
  const gastoBase = positivoOuNulo(configuracao?.baseDiariaKcal);
  const gastoTotal = gastoBase !== null && desconhecidas === 0
    ? arredondar(gastoBase + gastoExercicio) : null;
  const faixa = configuracao && Number.isFinite(configuracao.toleranciaKcal)
    ? Math.max(0, configuracao.toleranciaKcal) : 0;
  let situacao: SituacaoNutricional;
  if (data > hoje) situacao = "futuro";
  else if (!diario || itensConsumidos === 0 || itensInvalidos > 0 || gastoTotal === null)
    situacao = "insuficiente";
  else if (!diario.concluido || pendentes > 0) situacao = "parcial";
  else situacao = classificarSaldo(arredondar(consumido.kcal - gastoTotal), faixa);
  const completo = ["deficit", "superavit", "manutencao"].includes(situacao);
  const saldo = completo && gastoTotal !== null ? arredondar(consumido.kcal - gastoTotal) : null;
  return {
    data,
    temRegistro: Boolean(diario),
    itensConsumidos,
    consumido,
    planejado,
    metaKcal,
    gastoBase,
    gastoExercicio,
    gastoTotal,
    saldo,
    diferencaMeta: itensConsumidos > 0 && metaKcal !== null ? arredondar(consumido.kcal - metaKcal) : null,
    deficit: saldo === null ? 0 : Math.max(0, -saldo),
    superavit: saldo === null ? 0 : Math.max(0, saldo),
    faixa,
    situacao,
    completo,
    desconhecidas,
    sessoes: sessoes.length,
    minutos: arredondar(sessoes.reduce((total, atividade) => total + (Number.isFinite(atividade.minutos) && atividade.minutos > 0 ? atividade.minutos : 0), 0)),
    musculacao: sessoes.filter((atividade) => atividade.tipo === "musculacao").length,
    cardio: sessoes.filter((atividade) => atividade.tipo === "cardio").length,
    pendentes,
  };
}

export type ResumoSemana = {
  diasValidos: number;
  parciais: number;
  semRegistros: number;
  insuficientes: number;
  consumo: number;
  consumoRegistrado: number;
  gasto: number;
  saldo: number | null;
  deficits: number;
  superavits: number;
  mediaSaldo: number | null;
  faixa: number;
  situacao: SituacaoNutricional;
  atividadesCalorias: number;
  minutos: number;
  sessoes: number;
};

export function resumirSemana(resumos: ResumoDia[]): ResumoSemana {
  const considerados = resumos.filter((resumo) => resumo.situacao !== "futuro");
  const validos = considerados.filter((resumo) => resumo.completo && resumo.saldo !== null);
  const somar = (itens: ResumoDia[], valor: (dia: ResumoDia) => number) => arredondar(itens.reduce((total, dia) => total + valor(dia), 0));
  const saldo = validos.length ? somar(validos, (dia) => dia.saldo!) : null;
  const faixa = somar(validos, (dia) => dia.faixa);
  const parciais = considerados.filter((dia) => dia.situacao === "parcial").length;
  return {
    diasValidos: validos.length,
    parciais,
    semRegistros: considerados.filter((dia) => dia.itensConsumidos === 0).length,
    insuficientes: considerados.filter((dia) => dia.situacao === "insuficiente" && dia.temRegistro && dia.itensConsumidos > 0).length,
    consumo: somar(validos, (dia) => dia.consumido.kcal),
    consumoRegistrado: somar(considerados, (dia) => dia.consumido.kcal),
    gasto: somar(validos, (dia) => dia.gastoTotal!),
    saldo,
    deficits: somar(validos, (dia) => dia.deficit),
    superavits: somar(validos, (dia) => dia.superavit),
    mediaSaldo: saldo === null ? null : arredondar(saldo / validos.length),
    faixa,
    situacao: saldo === null ? parciais ? "parcial" : "insuficiente" : classificarSaldo(saldo, faixa),
    atividadesCalorias: somar(considerados, (dia) => dia.gastoExercicio),
    minutos: somar(considerados, (dia) => dia.minutos),
    sessoes: somar(considerados, (dia) => dia.sessoes),
  };
}
