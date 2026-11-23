import { version } from "../package.json";

const operacoes = ["interface", "sincronizacao", "treino.sincronizacao", "treino.fotoModelo", "nutricao", "backup", "comunidade", "atualizacao"] as const;
export type OperacaoDiagnostico = typeof operacoes[number];
const codigos = ["OK", "FALHA", "OFFLINE", "AUTH", "CONFLITO", "PERMISSAO", "INDISPONIVEL"] as const;
export type CodigoDiagnostico = typeof codigos[number];
const eventos: { operacao: OperacaoDiagnostico; codigo: CodigoDiagnostico; data: string }[] = [];
export function registrarDiagnostico(operacao: OperacaoDiagnostico, codigo: CodigoDiagnostico) {
  if (!operacoes.includes(operacao) || !codigos.includes(codigo)) return;
  eventos.push({ operacao, codigo, data: new Date().toISOString() });
  if (eventos.length > 40) eventos.shift();
}
export function codigoFalha(erro: unknown): CodigoDiagnostico {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "OFFLINE";
  const e = erro && typeof erro === "object" ? erro as { code?: unknown; status?: unknown } : {};
  if (e.status === 401 || e.code === "PGRST301") return "AUTH";
  if (e.status === 403 || e.code === "42501") return "PERMISSAO";
  if (e.status === 409 || e.code === "23505") return "CONFLITO";
  return "FALHA";
}
export function gerarDiagnostico(plataforma: string, pendencias?: { treinos: number; nutricao: number; fotos: number }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const navegador = ua.match(/(Firefox|Edg|Chrome|Version)\/(\d+(?:\.\d+){0,3})/);
  const compilacao = typeof document !== "undefined" ? document.querySelector('meta[name="tf-build"]')?.getAttribute("content") : null;
  return JSON.stringify({ aplicativo: "Treino Família", versao: version,
    compilacao: compilacao && /^[a-f0-9]{12,64}$/.test(compilacao) ? compilacao : "indisponível",
    plataforma: ["web", "android", "ios"].includes(plataforma) ? plataforma : "outra",
    navegador: navegador ? `${navegador[1]} ${navegador[2]}` : "indisponível",
    data: new Date().toISOString(), conexao: typeof navigator === "undefined" ? "desconhecida" : navigator.onLine ? "online" : "offline",
    pendencias: pendencias ? Object.fromEntries(["treinos", "nutricao", "fotos"].map(chave => {
      const n = pendencias[chave as keyof typeof pendencias]; return [chave, Number.isSafeInteger(n) && n >= 0 ? n : 0];
    })) : "não consultadas", eventos: eventos.map(e => ({ ...e })) }, null, 2);
}
