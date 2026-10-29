import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { registrarMudancaDeDados } from "./revisaoDados";
import type {
  AlimentoNutricao, ConfiguracaoNutricional, DiaNutricao, EstadoNutricao,
  ModeloDieta, PreferenciasNutricao, ResultadoBuscaAlimentos,
} from "./nutricaoTipos";

type Tipo = "day" | "template" | "goal" | "preferences" | "food";
type Documento = DiaNutricao | ModeloDieta | ConfiguracaoNutricional | PreferenciasNutricao | AlimentoNutricao;
type Operacao = { id: string; documento: Documento };
type Conflito = { id: string; revision: number; document: Documento | null };
type Entrada = {
  tipo: Tipo; id: string; documento: Documento; revision: number; fila: Operacao[]; conflito?: Conflito;
};
type Copia = { recursoId: string; data: string; documento: Documento; origem: "local" | "remoto" };
type BancoLocal = {
  versao: 1; usuarioId: string; entradas: Record<string, Entrada>;
  alimentos: Record<string, AlimentoNutricao>; copias: Copia[]; erro: string | null;
};
type LinhaRemota = { id: string; user_id: string | null; document: Documento; revision: number };
type RespostaRPC = { status: "ok" | "conflict"; id: string; revision: number; document?: Documento | null };

const tabelas: Record<Tipo, string> = {
  day: "nutrition_days", template: "nutrition_templates", goal: "nutrition_goals",
  preferences: "nutrition_preferences", food: "nutrition_foods",
};
const filas = new Map<string, Promise<unknown>>();
const sincronizacoes = new Map<string, Promise<{ pendencias: number; erro: string | null }>>();
const migracao = "Nutrição salva neste aparelho. Aplique a migração 202610280001_nutricao.sql no Supabase para habilitar o envio.";

function novoId() {
  const cripto = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cripto?.randomUUID) return cripto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letra) => {
    const valor = Math.floor(Math.random() * 16);
    return (letra === "x" ? valor : (valor & 3) | 8).toString(16);
  });
}
function chave(usuarioId: string) { return `@treino-familia:nutricao:v1:${usuarioId}`; }
function vazio(usuarioId: string): BancoLocal {
  return { versao: 1, usuarioId, entradas: {}, alimentos: {}, copias: [], erro: null };
}
function preferenciasVazias(): PreferenciasNutricao {
  return { modeloPadraoId: null, repetirDiariamente: false, repetirDesde: "", favoritos: [], recentes: [] };
}
function copiar<T>(valor: T): T { return JSON.parse(JSON.stringify(valor)) as T; }
function serializar<T>(usuarioId: string, tarefa: () => Promise<T>): Promise<T> {
  const proxima = (filas.get(usuarioId) ?? Promise.resolve()).catch(() => {}).then(tarefa);
  filas.set(usuarioId, proxima.catch(() => {}));
  return proxima;
}
async function ler(usuarioId: string): Promise<BancoLocal> {
  const texto = await AsyncStorage.getItem(chave(usuarioId));
  if (!texto) return vazio(usuarioId);
  const banco = JSON.parse(texto) as BancoLocal;
  if (banco.versao !== 1 || banco.usuarioId !== usuarioId || !banco.entradas)
    throw new Error("O arquivo local de nutrição não pôde ser identificado. Ele foi preservado neste aparelho.");
  return { ...banco, alimentos: banco.alimentos ?? {}, copias: banco.copias ?? [] };
}
async function gravar(banco: BancoLocal) {
  await AsyncStorage.setItem(chave(banco.usuarioId), JSON.stringify(banco));
}
function idRecurso(tipo: Tipo, documento: Documento, usuarioId: string): string {
  if (tipo === "preferences") return "preferences";
  if (tipo === "day") return `day:${(documento as DiaNutricao).data}`;
  return `${tipo}:${(documento as { id: string }).id}`;
}
function mensagem(erro: unknown): string {
  const objeto = erro && typeof erro === "object" ? erro as { code?: string; message?: string } : null;
  if (objeto && (["42P01", "42883", "PGRST202", "PGRST205"].includes(objeto.code ?? "") ||
    /nutrition_.*(does not exist|schema cache)|could not find.*nutrition_/i.test(objeto.message ?? ""))) return migracao;
  return objeto?.message || (erro instanceof Error ? erro.message : "O envio da nutrição não foi confirmado. Seus registros locais estão preservados.");
}
async function autenticar(usuarioId: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.id !== usuarioId)
    throw new Error("Entre novamente na mesma conta para sincronizar a nutrição deste aparelho.");
}
function offline() { return typeof navigator !== "undefined" && navigator.onLine === false; }
function pendencias(banco: BancoLocal) {
  return Object.values(banco.entradas).reduce((total, entrada) => total + entrada.fila.length, 0);
}
function dataValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(`${valor}T12:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}
function numeroValido(valor: unknown, minimo = 0, maximo = 100000): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= minimo && valor <= maximo;
}
function nutrientesValidos(valor: unknown): boolean {
  if (!valor || typeof valor !== "object") return false;
  const nutrientes = valor as Record<string, unknown>;
  return ["kcal", "proteinas", "carboidratos", "gorduras"].every((campo) => numeroValido(nutrientes[campo]));
}
function refeicoesValidas(valor: unknown): boolean {
  if (!Array.isArray(valor) || valor.length > 100) return false;
  const refeicoesIds = new Set<string>();
  return valor.every((refeicao) => {
    if (!refeicao || typeof refeicao !== "object" || typeof refeicao.id !== "string" || !refeicao.id ||
      refeicoesIds.has(refeicao.id) || typeof refeicao.nome !== "string" || !refeicao.nome.trim() ||
      !Array.isArray(refeicao.itens) || refeicao.itens.length > 300) return false;
    refeicoesIds.add(refeicao.id);
    const itensIds = new Set<string>();
    return refeicao.itens.every((item: Record<string, unknown>) => {
      if (!item || typeof item.id !== "string" || !item.id || itensIds.has(item.id) ||
        typeof item.nome !== "string" || !item.nome.trim() || !numeroValido(item.gramas, Number.MIN_VALUE) ||
        !numeroValido(item.baseGramas, Number.MIN_VALUE) || typeof item.consumido !== "boolean" ||
        !nutrientesValidos(item.nutrientesBase)) return false;
      itensIds.add(item.id);
      return true;
    });
  });
}
function configuracaoValida(config: ConfiguracaoNutricional, usuarioId: string) {
  return config.usuarioId === usuarioId && dataValida(config.vigenteDesde) &&
    ["manter", "perder", "ganhar"].includes(config.objetivo) && config.metodo === "repouso-rotina-v1" &&
    numeroValido(config.fatorRotina, 1, 3) && typeof config.restricaoAutomatica === "boolean" &&
    [config.metaKcal, config.metaProteinas, config.metaCarboidratos, config.metaGorduras, config.repousoKcal, config.baseDiariaKcal]
      .every((valor) => valor === null || numeroValido(valor)) && numeroValido(config.toleranciaKcal);
}
function validarDocumento(tipo: Tipo, documento: Documento, usuarioId: string) {
  if (!usuarioId || !documento || typeof documento !== "object") throw new Error("Dados de nutrição inválidos.");
  if (tipo !== "preferences" && (documento as { usuarioId: string }).usuarioId !== usuarioId)
    throw new Error("O registro de nutrição pertence a outra conta.");
  if (JSON.stringify(documento).length > 500000) throw new Error("Este registro está grande demais para salvar. Divida o planejamento em refeições menores.");
  if (tipo === "day") {
    const dia = documento as DiaNutricao;
    if (!dataValida(dia.data) || typeof dia.concluido !== "boolean") throw new Error("Confira a data e a confirmação do diário.");
    if (!refeicoesValidas(dia.refeicoes)) throw new Error("Confira as refeições, quantidades e valores nutricionais do dia.");
    if (dia.configuracao && !configuracaoValida(dia.configuracao, usuarioId)) throw new Error("Confira as metas usadas neste dia.");
  }
  if (tipo === "template") {
    const modelo = documento as ModeloDieta;
    if (!modelo.nome.trim() || !dataValida(modelo.vigenteDesde) || !Number.isInteger(modelo.versao) || modelo.versao < 1 || !refeicoesValidas(modelo.refeicoes))
      throw new Error("Confira o nome, a vigência e as refeições da dieta.");
  }
  if (tipo === "goal" && !configuracaoValida(documento as ConfiguracaoNutricional, usuarioId)) throw new Error("Confira as metas e o método de estimativa.");
  if (tipo === "food") {
    const alimento = documento as AlimentoNutricao;
    if (!alimento.nome.trim() || !alimento.fonte.trim() || !numeroValido(alimento.baseGramas, Number.MIN_VALUE) || !nutrientesValidos(alimento.nutrientes))
      throw new Error("Confira o alimento, a porção, a fonte e os valores nutricionais.");
  }
  if (tipo === "preferences") {
    const preferencias = documento as PreferenciasNutricao;
    if (typeof preferencias.repetirDiariamente !== "boolean" ||
      (preferencias.repetirDesde !== "" && !dataValida(preferencias.repetirDesde)) ||
      ![preferencias.favoritos, preferencias.recentes].every((ids) => Array.isArray(ids) && ids.length <= 200 && ids.every((id) => typeof id === "string")))
      throw new Error("Confira as preferências da dieta padrão.");
  }
}
async function salvar(tipo: Tipo, usuarioId: string, documento: Documento) {
  validarDocumento(tipo, documento, usuarioId);
  const snapshot = copiar(documento);
  await serializar(usuarioId, async () => {
    const banco = await ler(usuarioId);
    const recurso = idRecurso(tipo, snapshot, usuarioId);
    const atual = banco.entradas[recurso];
    const id = tipo === "preferences" ? usuarioId : (snapshot as { id: string }).id;
    if (tipo === "day" && atual && atual.id !== id)
      throw new Error("Este dia já possui um diário neste aparelho. Atualize ou reabra a data antes de editar; as refeições existentes foram preservadas.");
    const canonico = atual?.id ?? id;
    const dados = tipo === "preferences" ? snapshot : { ...snapshot, id: canonico } as Documento;
    const entrada: Entrada = atual ?? { tipo, id: canonico, documento: dados, revision: 0, fila: [] };
    if (JSON.stringify(entrada.documento) === JSON.stringify(dados) && (entrada.fila.length || entrada.revision > 0)) return;
    entrada.documento = dados;
    entrada.fila.push({ id: novoId(), documento: dados });
    banco.entradas[recurso] = entrada;
    if (tipo === "food") banco.alimentos[canonico] = dados as AlimentoNutricao;
    await gravar(banco);
  });
  registrarMudancaDeDados();
  if (!offline()) void sincronizarNutricao(usuarioId).catch(() => {});
}

export function salvarDiaNutricao(dia: DiaNutricao) { return salvar("day", dia.usuarioId, dia); }
export function salvarModeloDieta(modelo: ModeloDieta) { return salvar("template", modelo.usuarioId, modelo); }
export function salvarConfiguracaoNutricao(configuracao: ConfiguracaoNutricional) { return salvar("goal", configuracao.usuarioId, configuracao); }
export function salvarPreferenciasNutricao(usuarioId: string, preferencias: PreferenciasNutricao) { return salvar("preferences", usuarioId, preferencias); }
export function salvarAlimentoNutricao(alimento: AlimentoNutricao) {
  if (!alimento.usuarioId) return Promise.reject(new Error("Alimentos do catálogo público não podem ser alterados."));
  return salvar("food", alimento.usuarioId, alimento);
}

export function sincronizarNutricao(usuarioId: string): Promise<{ pendencias: number; erro: string | null }> {
  const existente = sincronizacoes.get(usuarioId);
  if (existente) return existente;
  const tarefa = (async () => {
    try {
      if (!offline()) {
        for (let tentativa = 0; tentativa < 300; tentativa += 1) {
          const proxima = await serializar(usuarioId, async () => {
            const banco = await ler(usuarioId);
            const recurso = Object.keys(banco.entradas).find((id) => banco.entradas[id].fila.length && !banco.entradas[id].conflito);
            if (!recurso) return null;
            return { recurso, entrada: copiar(banco.entradas[recurso]), operacao: copiar(banco.entradas[recurso].fila[0]) };
          });
          if (!proxima) break;
          await autenticar(usuarioId);
          const { entrada, operacao, recurso } = proxima;
          const { data, error } = await supabase.rpc("nutrition_save_document", {
            p_type: entrada.tipo, p_id: entrada.id, p_document: operacao.documento,
            p_expected_revision: entrada.revision, p_operation_id: operacao.id,
          });
          if (error) throw error;
          const resposta = data as RespostaRPC | null;
          if (!resposta || !["ok", "conflict"].includes(resposta.status) || !Number.isInteger(resposta.revision))
            throw new Error("O servidor não confirmou a gravação da nutrição.");
          await serializar(usuarioId, async () => {
            const banco = await ler(usuarioId);
            const atual = banco.entradas[recurso];
            if (!atual || !atual.fila.some((item) => item.id === operacao.id)) return;
            if (resposta.status === "conflict") {
              atual.conflito = { id: resposta.id, revision: resposta.revision, document: resposta.document ?? null };
            } else {
              atual.revision = Math.max(atual.revision, resposta.revision);
              atual.fila = atual.fila.filter((item) => item.id !== operacao.id);
              atual.id = resposta.id;
            }
            banco.erro = null;
            await gravar(banco);
          });
          registrarMudancaDeDados();
        }
      }
      return await serializar(usuarioId, async () => {
        const banco = await ler(usuarioId);
        const conflitos = Object.values(banco.entradas).filter((entrada) => entrada.conflito).length;
        if (!conflitos && !pendencias(banco)) banco.erro = null;
        await gravar(banco);
        return { pendencias: pendencias(banco), erro: conflitos ? "Há alterações de nutrição em outro aparelho. Escolha qual versão usar; ambas estão preservadas." : banco.erro };
      });
    } catch (erro) {
      return serializar(usuarioId, async () => {
        const banco = await ler(usuarioId);
        banco.erro = mensagem(erro);
        await gravar(banco);
        return { pendencias: pendencias(banco), erro: banco.erro };
      });
    }
  })().finally(() => sincronizacoes.delete(usuarioId));
  sincronizacoes.set(usuarioId, tarefa);
  return tarefa;
}

/** Escolha explícita. A versão não escolhida é arquivada antes de liberar a fila. */
export async function resolverConflitoNutricao(usuarioId: string, recursoId: string, usar: "local" | "remoto") {
  await serializar(usuarioId, async () => {
    const banco = await ler(usuarioId);
    const entrada = banco.entradas[recursoId];
    if (!entrada?.conflito) throw new Error("Este conflito já foi resolvido. Atualize a tela.");
    const remoto = entrada.conflito;
    banco.copias.push({ recursoId, data: new Date().toISOString(), documento: copiar(entrada.documento), origem: "local" });
    if (remoto.document) banco.copias.push({ recursoId, data: new Date().toISOString(), documento: copiar(remoto.document), origem: "remoto" });
    if (usar === "remoto") {
      if (!remoto.document) delete banco.entradas[recursoId];
      else banco.entradas[recursoId] = { tipo: entrada.tipo, id: remoto.id, documento: remoto.document, revision: remoto.revision, fila: [] };
    } else {
      entrada.id = remoto.id;
      entrada.revision = remoto.revision;
      entrada.documento = entrada.tipo === "preferences" ? entrada.documento : { ...entrada.documento, id: remoto.id } as Documento;
      entrada.fila = [{ id: novoId(), documento: copiar(entrada.documento) }];
      entrada.conflito = undefined;
    }
    if (entrada.tipo === "food") {
      delete banco.alimentos[entrada.id];
      const escolhida = banco.entradas[recursoId];
      if (escolhida) banco.alimentos[escolhida.id] = escolhida.documento as AlimentoNutricao;
    }
    banco.erro = null;
    await gravar(banco);
  });
  registrarMudancaDeDados();
  return sincronizarNutricao(usuarioId);
}
export function listarCopiasConflitosNutricao(usuarioId: string): Promise<Copia[]> {
  return serializar(usuarioId, async () => copiar((await ler(usuarioId)).copias));
}

async function listarRemoto(tipo: Tipo, usuarioId: string, inicio?: string, fim?: string): Promise<LinhaRemota[]> {
  const linhas: LinhaRemota[] = [];
  for (let pagina = 0; pagina < 100; pagina += 1) {
    let consulta = supabase.from(tabelas[tipo]).select("id, user_id, document, revision").eq("user_id", usuarioId).order("id");
    if (tipo === "day" && inicio) consulta = consulta.gte("local_date", inicio);
    if (tipo === "day" && fim) consulta = consulta.lte("local_date", fim);
    const { data, error } = await consulta.range(pagina * 200, pagina * 200 + 199);
    if (error) throw error;
    linhas.push(...((data ?? []) as LinhaRemota[]));
    if ((data ?? []).length < 200) break;
  }
  return linhas;
}
function fundir(banco: BancoLocal, tipo: Tipo, linhas: LinhaRemota[]) {
  for (const linha of linhas) {
    if (linha.user_id !== banco.usuarioId) continue;
    const recurso = idRecurso(tipo, linha.document, banco.usuarioId);
    const local = banco.entradas[recurso];
    if (local?.fila.length || local?.conflito || (local && local.revision > linha.revision)) continue;
    banco.entradas[recurso] = { tipo, id: linha.id, documento: linha.document, revision: linha.revision, fila: [] };
    if (tipo === "food") banco.alimentos[linha.id] = linha.document as AlimentoNutricao;
  }
}
function estado(banco: BancoLocal, inicio?: string, fim?: string): EstadoNutricao {
  const todas = Object.values(banco.entradas);
  return {
    dias: todas.filter((entrada) => entrada.tipo === "day").map((entrada) => entrada.documento as DiaNutricao)
      .filter((dia) => (!inicio || dia.data >= inicio) && (!fim || dia.data <= fim)).sort((a, b) => a.data.localeCompare(b.data)),
    modelos: todas.filter((entrada) => entrada.tipo === "template").map((entrada) => entrada.documento as ModeloDieta),
    configuracoes: todas.filter((entrada) => entrada.tipo === "goal").map((entrada) => entrada.documento as ConfiguracaoNutricional),
    preferencias: (banco.entradas.preferences?.documento as PreferenciasNutricao | undefined) ?? preferenciasVazias(),
    alimentosLocais: Object.values(banco.alimentos), pendencias: pendencias(banco), erro: banco.erro,
    conflitos: Object.entries(banco.entradas).filter(([, entrada]) => entrada.conflito).map(([recursoId, entrada]) => ({
      recursoId, tipo: entrada.tipo, mensagem: "Uma versão diferente foi salva em outro aparelho.",
      local: entrada.documento, remoto: entrada.conflito?.document ?? null,
    })),
  };
}
export async function carregarEstadoNutricao(usuarioId: string, inicio?: string, fim?: string): Promise<EstadoNutricao> {
  if (!offline()) {
    try {
      await autenticar(usuarioId);
      const tipos: Tipo[] = ["day", "template", "goal", "preferences", "food"];
      const resultados = await Promise.allSettled(tipos.map((tipo) => listarRemoto(tipo, usuarioId, inicio, fim)));
      await serializar(usuarioId, async () => {
        const banco = await ler(usuarioId);
        let erro: string | null = null;
        resultados.forEach((resultado, indice) => {
          if (resultado.status === "fulfilled") fundir(banco, tipos[indice], resultado.value);
          else erro = mensagem(resultado.reason);
        });
        banco.erro = erro;
        await gravar(banco);
      });
      // Recupera favoritos/recentes do catálogo também em um segundo aparelho.
      const ids = await serializar(usuarioId, async () => {
        const banco = await ler(usuarioId);
        const prefs = banco.entradas.preferences?.documento as PreferenciasNutricao | undefined;
        return [...new Set([...(prefs?.favoritos ?? []), ...(prefs?.recentes ?? [])])].filter((id) => !banco.alimentos[id]).slice(0, 100);
      });
      if (ids.length) {
        const { data, error } = await supabase.from("nutrition_foods").select("id, document").in("id", ids);
        if (!error && data) await serializar(usuarioId, async () => {
          const banco = await ler(usuarioId);
          data.forEach((linha) => { banco.alimentos[linha.id] = linha.document as AlimentoNutricao; });
          await gravar(banco);
        });
      }
    } catch (erro) {
      await serializar(usuarioId, async () => {
        const banco = await ler(usuarioId); banco.erro = mensagem(erro); await gravar(banco);
      });
    }
  }
  return serializar(usuarioId, async () => copiar(estado(await ler(usuarioId), inicio, fim)));
}
export function lerEstadoNutricaoLocal(usuarioId: string, inicio?: string, fim?: string): Promise<EstadoNutricao> {
  return serializar(usuarioId, async () => copiar(estado(await ler(usuarioId), inicio, fim)));
}
export async function buscarAlimentosNutricao(usuarioId: string, busca: string, pagina = 0): Promise<ResultadoBuscaAlimentos> {
  const termo = busca.trim().slice(0, 100);
  const indice = Math.max(0, Math.floor(pagina));
  try {
    if (offline()) throw new Error("Sem internet. Exibindo alimentos já disponíveis neste aparelho.");
    await autenticar(usuarioId);
    let consulta = supabase.from("nutrition_foods").select("id, user_id, document").order("name").order("id");
    if (termo) consulta = consulta.ilike("name", `%${termo.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await consulta.range(indice * 20, indice * 20 + 20);
    if (error) throw error;
    const alimentos = ((data ?? []) as { document: AlimentoNutricao }[]).slice(0, 20).map((linha) => linha.document);
    await serializar(usuarioId, async () => {
      const banco = await ler(usuarioId);
      alimentos.forEach((alimento) => { if (!banco.entradas[`food:${alimento.id}`]?.fila.length) banco.alimentos[alimento.id] = alimento; });
      const preservar = new Set([
        ...Object.keys(banco.entradas).filter((id) => id.startsWith("food:")).map((id) => id.slice(5)),
        ...((banco.entradas.preferences?.documento as PreferenciasNutricao | undefined)?.favoritos ?? []),
        ...((banco.entradas.preferences?.documento as PreferenciasNutricao | undefined)?.recentes ?? []),
      ]);
      const chaves = Object.keys(banco.alimentos);
      for (const id of chaves.slice(0, Math.max(0, chaves.length - 300))) if (!preservar.has(id)) delete banco.alimentos[id];
      await gravar(banco);
    });
    return { alimentos, temMais: (data ?? []).length > 20, erro: null };
  } catch (erro) {
    return serializar(usuarioId, async () => {
      const banco = await ler(usuarioId);
      const termoNormal = termo.toLocaleLowerCase("pt-BR");
      const alimentos = Object.values(banco.alimentos).filter((alimento) =>
        !termoNormal || `${alimento.nome} ${alimento.marca} ${alimento.preparo}`.toLocaleLowerCase("pt-BR").includes(termoNormal));
      return { alimentos: alimentos.slice(indice * 20, indice * 20 + 20), temMais: alimentos.length > (indice + 1) * 20, erro: mensagem(erro) };
    });
  }
}
