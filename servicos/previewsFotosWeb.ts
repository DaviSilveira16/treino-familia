import { supabase } from "../supabase";

type Preview = { uri: string; revogar: boolean; referencias: number; expiraEm: number };
const cache = new Map<string, Preview>();
const pendentes = new Map<string, Promise<Preview>>();
const MAX_PREVIEWS = 24;
let geracao = 0;
let contaAtual: string | null = null;
let ativos = 0;
const espera: Array<() => void> = [];

function remover(chave: string, item: Preview) {
  if (cache.get(chave) !== item) return;
  cache.delete(chave);
  if (item.revogar) URL.revokeObjectURL(item.uri);
}
function podar() {
  for (const [chave, item] of cache) {
    if (!item.referencias && (item.expiraEm <= Date.now() || cache.size > MAX_PREVIEWS))
      remover(chave, item);
  }
}
function limpar() {
  geracao++;
  for (const [chave, item] of cache) remover(chave, item);
  pendentes.clear();
}
supabase.auth.onAuthStateChange((evento, sessao) => {
  const conta = sessao?.user.id ?? null;
  if (evento === "SIGNED_OUT" || conta !== contaAtual) limpar();
  contaAtual = conta;
});

async function criar(uri: string, largura: number): Promise<Preview> {
  const alternativa = { uri, revogar: false, referencias: 0, expiraEm: Date.now() + 60000 };
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return alternativa;
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 20000);
  let temporaria: string | null = null;
  try {
    // Esta primeira leitura ainda transfere o original. O derivado reduz o bitmap
    // mantido pelos cartões e é reaproveitado na memória, sem gravar no Storage.
    const resposta = await fetch(uri, { signal: controlador.signal, credentials: "omit" });
    if (!resposta.ok) return alternativa;
    const original = await resposta.blob();
    if (!original.type.startsWith("image/") || /gif|svg/.test(original.type) || original.size > 12 * 1024 * 1024)
      return alternativa;
    temporaria = URL.createObjectURL(original);
    const imagem = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      imagem.onload = () => resolve();
      imagem.onerror = () => reject(new Error("Formato sem suporte a preview"));
      imagem.src = temporaria!;
      controlador.signal.addEventListener("abort", () => reject(new Error("Preview cancelado")), { once: true });
    });
    const maiorLado = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    if (!maiorLado || maiorLado <= largura) return alternativa;
    const escala = largura / maiorLado;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) return alternativa;
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.size >= original.size) return alternativa;
    return { uri: URL.createObjectURL(blob), revogar: true, referencias: 0, expiraEm: Date.now() + 10 * 60000 };
  } catch {
    // CORS, formatos ou APIs indisponíveis: o cartão continua usando o original.
    return alternativa;
  } finally {
    clearTimeout(timeout);
    if (temporaria) URL.revokeObjectURL(temporaria);
  }
}

/** Apenas previews temporários do navegador. Nenhum upload ou recompressão do original. */
export async function obterPreviewWeb(uri: string, largura = 720) {
  const versaoConsulta = geracao;
  const dimensao = Math.min(1080, Math.max(64, Math.round(largura)));
  const chave = `${dimensao}:${uri}`;
  podar();
  let item = cache.get(chave);
  if (!item) {
    let pedido = pendentes.get(chave);
    if (!pedido) {
      const versao = geracao;
      pedido = (async () => {
        if (ativos >= 2) await new Promise<void>((resolve) => espera.push(resolve));
        else ativos++;
        try {
          if (versao !== geracao) throw new Error("Conta alterada");
          const preview = await criar(uri, dimensao);
          if (versao !== geracao) {
            if (preview.revogar) URL.revokeObjectURL(preview.uri);
            throw new Error("Conta alterada");
          }
          cache.set(chave, preview);
          return preview;
        } finally {
          const proxima = espera.shift();
          if (proxima) proxima();
          else ativos--;
          if (pendentes.get(chave) === pedido) pendentes.delete(chave);
        }
      })();
      pendentes.set(chave, pedido);
    }
    item = await pedido;
  }
  if (versaoConsulta !== geracao) throw new Error("Conta alterada");
  cache.delete(chave);
  cache.set(chave, item);
  item.referencias++;
  let liberado = false;
  return {
    uri: item.uri,
    liberar: () => {
      if (liberado) return;
      liberado = true;
      item.referencias--;
      podar();
    },
  };
}
