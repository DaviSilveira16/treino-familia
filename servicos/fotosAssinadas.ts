import { supabase } from "../supabase";

type CacheFoto = { url: string; expiraEm: number };
const cache = new Map<string, CacheFoto>();
const MAXIMO_CACHE = 200;
const MAXIMO_VALIDADE_CACHE_MS = 10 * 60 * 1000;

// Nunca manter URLs privadas de uma conta depois do logout.
supabase.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT") cache.clear();
});

/**
 * Assina fotos privadas em lotes e reaproveita URLs recentes para o MESMO usuário.
 * A assinatura não é persistida no Safari e expira antes do token original.
 * Falhas de imagem não bloqueiam o restante do aplicativo.
 */
export async function obterFotosAssinadas(
  bucket: "exercise-photos" | "community-photos",
  caminhos: Array<string | null | undefined>,
  validadeSegundos: number,
  usuarioId: string,
): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => Boolean(c)))];
  const urls = new Map<string, string>();
  if (!usuarioId || unicos.length === 0) return urls;

  const agora = Date.now();
  const faltantes: string[] = [];
  for (const caminho of unicos) {
    const chave = `${usuarioId}:${bucket}:${caminho}`;
    const salvo = cache.get(chave);
    if (salvo && salvo.expiraEm > agora) urls.set(caminho, salvo.url);
    else {
      cache.delete(chave);
      faltantes.push(caminho);
    }
  }

  for (let inicio = 0; inicio < faltantes.length; inicio += 50) {
    const lote = faltantes.slice(inicio, inicio + 50);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(lote, validadeSegundos);
    if (error) {
      if (__DEV__) console.warn(`Fotos de ${bucket}:`, error.message);
      continue;
    }
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) continue;
      const expiraEm =
        Date.now() +
        Math.min(
          MAXIMO_VALIDADE_CACHE_MS,
          Math.max(0, validadeSegundos - 60) * 1000,
        );
      urls.set(item.path, item.signedUrl);
      cache.set(`${usuarioId}:${bucket}:${item.path}`, {
        url: item.signedUrl,
        expiraEm,
      });
    }
  }
  while (cache.size > MAXIMO_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (!maisAntiga) break;
    cache.delete(maisAntiga);
  }
  return urls;
}
