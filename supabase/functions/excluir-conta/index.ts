import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, x-client-info, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
};
const responder = (mensagem: string, status = 200) => Response.json({ mensagem }, { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return responder("Método indisponível.", 405);
  const url = Deno.env.get("SUPABASE_URL");
  const publica = Deno.env.get("SUPABASE_ANON_KEY");
  const segredo = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!url || !publica || !segredo) return responder("Exclusão ainda indisponível.", 503);
  if (!bearer) return responder("Entre novamente na sua conta.", 401);

  try {
    const publico = createClient(url, publica, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(url, segredo, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await publico.auth.getUser(bearer);
    if (error || !user?.email) return responder("Entre novamente com uma conta verificada por e-mail.", 401);
    const corpo = await req.json().catch(() => null);
    if (corpo?.confirmacao !== "EXCLUIR" || !/^\d{6,10}$/.test(corpo?.codigo ?? ""))
      return responder("Informe o código de e-mail e digite EXCLUIR.", 400);
    const { data: identidade, error: erroCodigo } = await publico.auth.verifyOtp({
      email: user.email, token: corpo.codigo, type: "email",
    });
    if (erroCodigo || identidade.user?.id !== user.id)
      return responder("O código expirou ou é inválido. Solicite um novo código.", 401);

    const { error: impedimento } = await admin.rpc("tf_preparar_exclusao_conta", { p_usuario: user.id });
    if (impedimento) return responder(impedimento.message.includes("TF_FAMILIA_COMPARTILHADA")
      ? "Você possui uma família com dados de outras pessoas. Resolva a titularidade da família antes de excluir a conta."
      : "Não foi possível conferir os vínculos da conta.", 409);

    // Enumera novamente a primeira página após remover cada lote.
    for (;;) {
      const { data: objetos, error: erroLista } = await admin.rpc("tf_arquivos_proprios_conta", { p_usuario: user.id }).range(0, 99);
      if (erroLista) return responder("Não foi possível conferir as fotos. Tente novamente com um novo código.", 503);
      if (!objetos?.length) break;
      const grupos = new Map<string, string[]>();
      for (const objeto of objetos) {
        const caminhos = grupos.get(objeto.bucket) ?? [];
        caminhos.push(objeto.caminho);
        grupos.set(objeto.bucket, caminhos);
      }
      for (const [bucket, caminhos] of grupos) {
        const { data: removidos, error: erroFotos } = await admin.storage.from(bucket).remove(caminhos);
        if (erroFotos || !removidos?.length) return responder("A remoção das fotos ficou incompleta. Tente novamente com um novo código.", 503);
      }
    }
    const { error: erroDados } = await admin.rpc("tf_excluir_dados_conta", { p_usuario: user.id });
    if (erroDados) return responder("A exclusão de dados ainda não foi confirmada. Tente novamente com um novo código.", 503);
    const { error: erroConta } = await admin.auth.admin.deleteUser(user.id);
    if (erroConta) return responder("Os dados foram removidos, mas a conta ainda precisa ser excluída. Tente novamente com um novo código.", 503);
    return responder("Conta excluída.");
  } catch {
    return responder("A exclusão ainda não foi confirmada. Solicite um novo código antes de tentar novamente.", 503);
  }
});
