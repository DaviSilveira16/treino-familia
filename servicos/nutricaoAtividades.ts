import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { lerExclusaoTreino, listarRascunhos } from "./treinoLocal";
import { dataLocal, deslocarDia } from "./nutricaoCalculos";
import type { AtividadeNutricional } from "./nutricaoTipos";

type Registro = {
  id: string;
  started_at: string;
  finished_at?: string | null;
  status?: string | null;
  active_calories?: number | null;
  duration_minutes?: number | null;
  activity_name?: string | null;
};
export type ResultadoAtividadesNutricao = {
  atividades: AtividadeNutricional[];
  erro: string | null;
  desatualizado: boolean;
};
const calorias = (valor: unknown) =>
  valor !== null &&
  valor !== undefined &&
  valor !== "" &&
  Number.isFinite(Number(valor)) &&
  Number(valor) >= 0
    ? Number(valor)
    : null;
const minutos = (valor: unknown) => calorias(valor) ?? 0;
const mensagem = (erro: unknown) =>
  erro && typeof erro === "object" && "message" in erro
    ? String(erro.message)
    : "Não foi possível conferir os exercícios deste período.";
const contaIndisponivel = (): ResultadoAtividadesNutricao => ({
  atividades: [],
  erro: "A conta ativa mudou ou a sessão não está disponível. Entre novamente para conferir as atividades.",
  desatualizado: true,
});

async function mesmaContaLocal(usuarioId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && data.session?.user.id === usuarioId;
  } catch {
    return false;
  }
}

function diasDoPeriodo(inicio: string, fim: string): string[] {
  deslocarDia(inicio, 0);
  deslocarDia(fim, 0);
  if (inicio > fim) throw new Error("O início deve ser anterior ao fim do período.");
  const dias: string[] = [];
  for (let dia = inicio; dia <= fim; dia = deslocarDia(dia, 1)) {
    dias.push(dia);
    if (dias.length > 366)
      throw new Error("Período muito grande. Consulte as atividades por semana.");
  }
  return dias;
}

const chavePeriodo = (usuarioId: string, inicio: string, fim: string) =>
  `@treino-familia:nutricao:atividades:v1:${usuarioId}:${inicio}:${fim}`;
const chaveDia = (usuarioId: string, data: string) =>
  `@treino-familia:nutricao:atividades:dia:v1:${usuarioId}:${data}`;

function decodificarCache(
  texto: string | null,
  inicio: string,
  fim: string,
): AtividadeNutricional[] | null {
  if (texto === null) return null;
  try {
    const valor: unknown = JSON.parse(texto);
    if (!Array.isArray(valor)) return null;
    const resultado: AtividadeNutricional[] = [];
    for (const item of valor) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        !item.id ||
        !["musculacao", "cardio"].includes(item.tipo) ||
        typeof item.data !== "string"
      )
        return null;
      deslocarDia(item.data, 0);
      if (item.data < inicio || item.data > fim) continue;
      resultado.push({
        id: item.id,
        tipo: item.tipo,
        data: item.data,
        nome: typeof item.nome === "string" ? item.nome : "Atividade",
        caloriasAtivas: calorias(item.caloriasAtivas),
        minutos: minutos(item.minutos),
        pendente: false,
      });
    }
    return resultado;
  } catch {
    return null;
  }
}

async function lerAtividadesCache(
  usuarioId: string,
  inicio: string,
  fim: string,
  dias: string[],
): Promise<AtividadeNutricional[]> {
  try {
    const periodo = decodificarCache(
      await AsyncStorage.getItem(chavePeriodo(usuarioId, inicio, fim)),
      inicio,
      fim,
    );
    // O cache por dia é canônico: uma consulta diária posterior pode corrigir
    // uma semana antiga, inclusive removendo uma sessão que deixou de existir.
    // O intervalo fica como compatibilidade para caches sem entradas diárias.
    const porDia = await Promise.all(
      dias.map(async (dia) =>
        decodificarCache(await AsyncStorage.getItem(chaveDia(usuarioId, dia)), dia, dia)
          ?? periodo?.filter((atividade) => atividade.data === dia) ?? [],
      ),
    );
    return porDia.flat();
  } catch {
    return [];
  }
}

async function guardarAtividadesCache(
  usuarioId: string,
  inicio: string,
  fim: string,
  dias: string[],
  atividades: AtividadeNutricional[],
) {
  // Falha no cache não invalida a consulta remota recém-confirmada.
  await Promise.allSettled([
    AsyncStorage.setItem(chavePeriodo(usuarioId, inicio, fim), JSON.stringify(atividades)),
    ...dias.map((dia) =>
      AsyncStorage.setItem(chaveDia(usuarioId, dia), JSON.stringify(atividades.filter((item) => item.data === dia))),
    ),
  ]);
}

/** Lê sessões, nunca modelos. `calories` legado pode ser bruto e não é somado. */
export async function carregarAtividadesNutricao(
  usuarioId: string,
  inicio: string,
  fim: string,
): Promise<ResultadoAtividadesNutricao> {
  let dias: string[];
  try {
    dias = diasDoPeriodo(inicio, fim);
  } catch (erro) {
    return { atividades: [], erro: mensagem(erro), desatualizado: true };
  }
  if (!usuarioId) return contaIndisponivel();

  let erroAutenticacao: unknown;
  try {
    const autenticado = await supabase.auth.getUser();
    if (!autenticado.error) {
      // Uma identidade confirmada diferente nunca recorre ao cache da tela antiga.
      if (autenticado.data.user?.id !== usuarioId) return contaIndisponivel();
    } else erroAutenticacao = autenticado.error;
  } catch (erro) {
    erroAutenticacao = erro;
  }
  // Sem rede, getUser pode falhar. Uma sessão local da mesma conta permite
  // ler apenas seu cache, sempre marcado como desatualizado.
  if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();

  let atividades: AtividadeNutricional[] = [];
  let erro: string | null = erroAutenticacao ? mensagem(erroAutenticacao) : null;
  if (!erroAutenticacao) {
    try {
      const de = new Date(`${inicio}T00:00:00`).toISOString();
      const ate = new Date(`${deslocarDia(fim, 1)}T00:00:00`).toISOString();
      const ler = async (tabela: "workout_sessions" | "cardio_sessions") => {
        const todos: Registro[] = [];
        for (let pagina = 0; ; pagina++) {
          const campos = tabela === "workout_sessions"
            ? "id, started_at, finished_at, status, active_calories, duration_minutes"
            : "id, started_at, activity_name, active_calories, duration_minutes";
          const resposta = await supabase.from(tabela).select(campos)
            .eq("user_id", usuarioId).gte("started_at", de).lt("started_at", ate)
            .order("started_at").order("id").range(pagina * 500, pagina * 500 + 499);
          if (resposta.error) throw resposta.error;
          const linhas = (resposta.data ?? []) as unknown as Registro[];
          todos.push(...linhas);
          if (linhas.length < 500) break;
          if (pagina > 100)
            throw new Error("Período de atividades muito grande. Consulte uma semana por vez.");
        }
        return todos;
      };
      const [treinos, cardios] = await Promise.all([ler("workout_sessions"), ler("cardio_sessions")]);
      atividades = [
        ...treinos.filter((sessao) => Boolean(sessao.finished_at) && (sessao.status === "concluido" || sessao.status === null))
          .map((sessao): AtividadeNutricional => ({
            id: sessao.id, tipo: "musculacao", data: dataLocal(new Date(sessao.started_at)),
            nome: "Musculação", caloriasAtivas: calorias(sessao.active_calories),
            minutos: minutos(sessao.duration_minutes), pendente: false,
          })),
        ...cardios.map((sessao): AtividadeNutricional => ({
          id: sessao.id, tipo: "cardio", data: dataLocal(new Date(sessao.started_at)),
          nome: sessao.activity_name || "Cardio", caloriasAtivas: calorias(sessao.active_calories),
          minutos: minutos(sessao.duration_minutes), pendente: false,
        })),
      ];
      if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();
      await guardarAtividadesCache(usuarioId, inicio, fim, dias, atividades);
    } catch (falha) {
      erro = mensagem(falha);
      if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();
      atividades = await lerAtividadesCache(usuarioId, inicio, fim, dias);
    }
  } else atividades = await lerAtividadesCache(usuarioId, inicio, fim, dias);

  if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();
  try {
    const rascunhos = await listarRascunhos(usuarioId);
    if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();
    const idsMusculacao = new Set([
      ...atividades.filter((atividade) => atividade.tipo === "musculacao").map((atividade) => atividade.id),
      ...rascunhos.filter((rascunho) => rascunho.usuarioId === usuarioId).map((rascunho) => rascunho.sessao.id),
    ]);
    // Exclusões confirmadas continuam sendo tombstones: um cache antigo não
    // pode ressuscitar uma sessão que já foi removida do servidor.
    const exclusoes = await Promise.all([...idsMusculacao].map((id) => lerExclusaoTreino(usuarioId, id)));
    const removidos = new Set(exclusoes.filter((exclusao) => exclusao !== null).map((exclusao) => exclusao.sessaoId));
    const porId = new Map(atividades
      .filter((atividade) => atividade.tipo !== "musculacao" || !removidos.has(atividade.id))
      .map((atividade) => [`${atividade.tipo}:${atividade.id}`, atividade]));
    for (const rascunho of rascunhos) {
      if (rascunho.usuarioId !== usuarioId || !rascunho.finalizacao || rascunho.exclusaoSolicitada || rascunho.conflitoSessao || removidos.has(rascunho.sessao.id)) continue;
      const data = dataLocal(new Date(rascunho.sessao.started_at));
      const id = `musculacao:${rascunho.sessao.id}`;
      if (data < inicio || data > fim || porId.has(id)) continue;
      porId.set(id, {
        id: rascunho.sessao.id, tipo: "musculacao", data, nome: rascunho.planName,
        caloriasAtivas: calorias(rascunho.finalizacao.metricas.active_calories),
        minutos: minutos(rascunho.finalizacao.metricas.duration_minutes), pendente: true,
      });
    }
    atividades = [...porId.values()];
  } catch (falha) {
    erro = erro || mensagem(falha);
  }
  if (!(await mesmaContaLocal(usuarioId))) return contaIndisponivel();
  return { atividades, erro, desatualizado: Boolean(erro) };
}
