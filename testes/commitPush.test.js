const assert = require("node:assert/strict");
const { validarMensagem, fluxo } = require("../scripts/commit-push.cjs");
for (const invalida of ["", "fix:", "feta: erro", "fix: erro\nsegunda linha", `fix: ${"a".repeat(100)}`]) assert.ok(validarMensagem(invalida));
assert.equal(validarMensagem("fix(web): corrigir rolagem"), null);
assert.equal(validarMensagem('fix: preservar "aspas" e $(comando) literalmente'), null);

function ambiente(respostas, opcoes = {}) {
  const chamadas = [], perguntas = [];
  let head = "commit-novo";
  return { chamadas, perguntas, deps: {
    log() {},
    testar: () => { chamadas.push(["testes"]); return opcoes.erroTestes ? { error: new Error("Falha ao iniciar") } : { status: opcoes.falharTestes ? 1 : 0 }; },
    perguntar: async texto => { perguntas.push(texto); assert.ok(respostas.length, "Pergunta inesperada"); return respostas.shift(); },
    git: args => {
      chamadas.push(args);
      const chave = args.join(" ");
      if (opcoes.falhar === args[0]) return { status: 1, stderr: "Falha simulada" };
      const dados = {
        "symbolic-ref --quiet --short HEAD": opcoes.destacado ? "" : "main",
        "ls-files --unmerged": opcoes.conflito ? "arquivo com conflito" : "",
        "config --get branch.main.remote": "origin",
        "config --get branch.main.merge": "refs/heads/main",
        "remote get-url origin": "https://example.invalid/repo.git",
        "status --short": opcoes.limpo ? "" : " M app.txt",
        "config user.name": "Teste", "config user.email": "teste@example.invalid",
        "rev-parse HEAD": head, "log -1 --format=%h %s": "123 fix: mensagem",
      };
      if (args[0] === "commit" && args.includes("--amend")) head = "commit-corrigido";
      return { status: 0, stdout: dados[chave] ?? "" };
    },
  } };
}

(async () => {
  let a = ambiente(["", "feta: erro", "fix: corrigir fluxo", "talvez", "editar", "fix: corrigir título", "s"]);
  assert.equal(await fluxo(a.deps), 0);
  assert.ok(a.chamadas.some(args => args.join(" ") === "commit --amend --only -m fix: corrigir título"));
  assert.deepEqual(a.chamadas.at(-1), ["push", "--set-upstream", "origin", "HEAD:refs/heads/main"]);
  assert.deepEqual(a.chamadas.at(-2), ["testes"]);
  a = ambiente(["/cancelar"]);
  await fluxo(a.deps);
  assert.ok(!a.chamadas.some(args => ["add", "commit", "push"].includes(args[0])));
  a = ambiente(["fix: manter local", "n"]);
  await fluxo(a.deps);
  assert.ok(a.chamadas.some(args => args[0] === "commit"));
  assert.ok(!a.chamadas.some(args => args[0] === "push"));
  assert.ok(!a.chamadas.some(args => args[0] === "testes"));
  for (const opcoes of [{ falharTestes: true }, { erroTestes: true }]) {
    a = ambiente(["fix: testar antes de enviar", "s"], opcoes);
    await assert.rejects(fluxo(a.deps), /Push bloqueado/);
    assert.ok(a.chamadas.some(args => args[0] === "commit"));
    assert.ok(!a.chamadas.some(args => args[0] === "push"));
  }
  a = ambiente(["s"], { limpo: true });
  await fluxo(a.deps);
  assert.ok(!a.chamadas.some(args => ["add", "commit"].includes(args[0])));
  for (const opcoes of [{ destacado: true }, { conflito: true }, { falhar: "commit" }, { falhar: "push" }]) {
    a = ambiente(["fix: corrigir fluxo", "s"], opcoes);
    await assert.rejects(fluxo(a.deps));
    assert.ok(!a.chamadas.some(args => args.includes("--force") || args[0] === "reset"));
    if (opcoes.falhar === "commit") assert.ok(!a.chamadas.some(args => args[0] === "push"));
  }
  console.log("OK F5: validação, correção da mensagem, cancelamento, commits pendentes e falhas preservadas");
})().catch(erro => { console.error(erro); process.exitCode = 1; });
