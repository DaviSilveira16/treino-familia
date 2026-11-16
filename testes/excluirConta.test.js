const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");

let handler;
const conta = { id: "conta-teste", email: "conta@example.invalid" };
const operacoes = [];
let erroAutenticacao;
const admin = {
  rpc: (nome, args) => {
    operacoes.push([nome, args.p_usuario]);
    if (nome === "tf_arquivos_proprios_conta") return { range: async () => ({ data: [], error: null }) };
    return { error: null };
  },
  auth: { admin: { deleteUser: async (id) => { operacoes.push(["auth.deleteUser", id]); return { error: erroAutenticacao }; } } },
};
const criarCliente = (_url, chave) => chave === "admin" ? admin : {
  auth: {
    getUser: async (token) => token === "sessao-teste" ? { data: { user: conta } } : { data: { user: null } },
    verifyOtp: async ({ token, email }) => token === "654321" && email === conta.email
      ? { data: { user: conta } } : { error: new Error("Código inválido") },
  },
};
const Deno = {
  env: { get: (nome) => ({
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_ANON_KEY: "publica",
    SUPABASE_SERVICE_ROLE_KEY: "admin",
  })[nome] },
  serve: (fn) => { handler = fn; },
};
carregar("supabase/functions/excluir-conta/index.ts", {
  "npm:@supabase/supabase-js@2.118.0": { createClient: criarCliente },
}, { Deno, Request, Response });

const invocar = (body, bearer = "sessao-teste") => handler(new Request("https://example.invalid", {
  method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
  body: JSON.stringify(body),
}));

(async () => {
  assert.equal((await invocar({ confirmacao: "EXCLUIR", codigo: "654321" }, "sessao-ausente")).status, 401);
  assert.equal((await invocar({ confirmacao: "EXCLUIR", codigo: "123456" })).status, 401);
  assert.equal((await invocar({ confirmacao: "CANCELAR", codigo: "654321" })).status, 400);
  assert.deepEqual(operacoes, []);
  erroAutenticacao = new Error("Falha simulada após remoção dos dados");
  assert.equal((await invocar({ confirmacao: "EXCLUIR", codigo: "654321" })).status, 503);
  assert.equal(operacoes.at(-1)[0], "auth.deleteUser");
  erroAutenticacao = null;
  operacoes.length = 0;
  assert.equal((await invocar({ confirmacao: "EXCLUIR", codigo: "654321" })).status, 200);
  assert.deepEqual(operacoes, [
    ["tf_preparar_exclusao_conta", conta.id], ["tf_arquivos_proprios_conta", conta.id],
    ["tf_excluir_dados_conta", conta.id], ["auth.deleteUser", conta.id],
  ]);
  console.log("OK — exclusão só prossegue com sessão, confirmação e código válidos");
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
