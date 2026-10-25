export type TipoAuthAndroid = "google" | "signup" | "recovery";
export type PedidoAuthAndroid = { state: string; kind: TipoAuthAndroid; criadoEm: number };
export function validarRetornoAndroid(url: string, origem: string, pedido: PedidoAuthAndroid | null, agora: number) {
  if (!pedido || !["google", "signup", "recovery"].includes(pedido.kind) || !/^[A-Za-z0-9_-]{43,128}$/.test(pedido.state)) throw new Error("Inicie a autenticação novamente neste aparelho.");
  const limite = pedido.kind === "google" ? 15 * 60_000 : 24 * 60 * 60_000;
  if (!Number.isFinite(pedido.criadoEm) || pedido.criadoEm > agora || agora - pedido.criadoEm > limite) throw new Error("O pedido de autenticação expirou. Inicie novamente no app.");
  const retorno = new URL(url);
  if (retorno.origin !== origem || retorno.pathname !== "/auth/android/callback" || retorno.hash) throw new Error("Retorno de autenticação inválido.");
  const permitidos = new Set(["android_state", "android_flow", "code", "error", "error_code", "error_description"]);
  for (const key of retorno.searchParams.keys()) if (!permitidos.has(key) || retorno.searchParams.getAll(key).length !== 1) throw new Error("Retorno de autenticação inválido.");
  if (retorno.searchParams.get("android_state") !== pedido.state || retorno.searchParams.get("android_flow") !== pedido.kind) throw new Error("Este link não corresponde ao pedido feito neste app.");
  const code = retorno.searchParams.get("code");
  const error = retorno.searchParams.get("error");
  if (Boolean(code) === Boolean(error) || (code && !/^[A-Za-z0-9._~-]{1,2048}$/.test(code))) throw new Error("Retorno de autenticação inválido.");
  if (error && (!/^[A-Za-z0-9_ .-]{1,120}$/.test(error) || (retorno.searchParams.get("error_code") ?? "").length > 120 || (retorno.searchParams.get("error_description") ?? "").length > 500)) throw new Error("Retorno de autenticação inválido.");
  return { code, error, kind: pedido.kind };
}
