import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";
import { noAndroidWrapper, ORIGEM_PRODUCAO } from "./ambienteAndroid";
import { validarRetornoAndroid, type PedidoAuthAndroid, type TipoAuthAndroid } from "./authAndroidValidacao";
type PonteAuth = { ready: boolean; register(state: string, kind: TipoAuthAndroid): Promise<boolean>; launch(url: string, state: string): Promise<boolean>; cancel(state: string): Promise<boolean> };
declare global { interface Window { __treinoFamiliaAndroidAuth?: PonteAuth } }
const CHAVE = "@treino-familia:auth-android:v1";
async function ponte(): Promise<PonteAuth> {
  if (window.__treinoFamiliaAndroidAuth?.ready) return window.__treinoFamiliaAndroidAuth;
  return new Promise((resolve, reject) => {
    const pronto = () => { if (window.__treinoFamiliaAndroidAuth?.ready) { clearTimeout(timer); window.removeEventListener("treino-familia:android-auth-ready", pronto); resolve(window.__treinoFamiliaAndroidAuth); } };
    const timer = setTimeout(() => { window.removeEventListener("treino-familia:android-auth-ready", pronto); reject(new Error("O retorno seguro ainda não está pronto. Atualize o APK e tente novamente.")); }, 6000);
    window.addEventListener("treino-familia:android-auth-ready", pronto); pronto();
  });
}
async function lerPedido(): Promise<PedidoAuthAndroid | null> {
  try { const texto = await AsyncStorage.getItem(CHAVE); return texto ? JSON.parse(texto) : null; } catch { return null; }
}
export async function cancelarAuthAndroid() {
  if (!noAndroidWrapper()) return;
  const anterior = await lerPedido();
  if (anterior) { const canal = await ponte(); await canal.cancel(anterior.state); }
  await AsyncStorage.removeItem(CHAVE);
}
export async function prepararAuthAndroid(kind: TipoAuthAndroid): Promise<{ redirectTo: string; state: string } | null> {
  if (!noAndroidWrapper()) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) throw new Error("Saia da conta atual antes de iniciar outra autenticação.");
  await cancelarAuthAndroid();
  const random = new Uint8Array(32); crypto.getRandomValues(random);
  const state = Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("");
  const canal = await ponte();
  await canal.register(state, kind);
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify({ state, kind, criadoEm: Date.now() } satisfies PedidoAuthAndroid)); }
  catch (error) { await canal.cancel(state); throw error; }
  return { state, redirectTo: `${ORIGEM_PRODUCAO}/auth/android/callback?android_state=${encodeURIComponent(state)}` };
}
export async function abrirGoogleAndroid(url: string, state: string) { await (await ponte()).launch(url, state); }
let processando: Promise<{ recovery: boolean; mensagem?: string }> | null = null;
export function processarRetornoAndroid(): Promise<{ recovery: boolean; mensagem?: string }> {
  if (!noAndroidWrapper() || location.pathname !== "/auth/android/callback") return Promise.resolve({ recovery: false });
  if (processando) return processando;
  processando = (async () => {
    const pedido = await lerPedido();
    const retorno = validarRetornoAndroid(location.href, ORIGEM_PRODUCAO, pedido, Date.now());
    const { data } = await supabase.auth.getSession();
    if (data.session) throw new Error("Já há uma conta conectada. Saia dela e inicie a autenticação novamente para não trocar sua sessão por um link.");
    // Consumed before the exchange: a repeated link can never replace a session.
    await AsyncStorage.removeItem(CHAVE);
    history.replaceState(null, "", "/auth/android/callback");
    if (retorno.error) throw new Error("A autenticação foi cancelada ou não foi autorizada. Tente novamente no app.");
    const { error } = await supabase.auth.exchangeCodeForSession(retorno.code!);
    if (error) throw new Error("Não foi possível concluir a autenticação. Abra um novo pedido no mesmo aparelho.");
    return { recovery: retorno.kind === "recovery" };
  })();
  return processando;
}
