const { spawnSync } = require("node:child_process");
const readline = require("node:readline/promises");
const path = require("node:path");

function validarMensagem(texto) {
  const mensagem = texto.trim();
  if (!mensagem) return "Escreva uma mensagem ou /cancelar para sair.";
  if ([...mensagem].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)) return "Use apenas uma linha, sem caracteres de controle.";
  if ([...mensagem].length > 100) return "Use até 100 caracteres no título do commit.";
  if (!/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^():]+\))?!?: \S.+$/u.test(mensagem)) {
    return "Formato esperado: feat: descrição (tipos: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert).";
  }
  return null;
}

function executarGit(args, visivel = false) {
  return spawnSync("git", args, {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8", stdio: visivel ? "inherit" : "pipe",
  });
}

function executarTestes() {
  const windows = process.platform === "win32";
  return spawnSync(windows ? (process.env.ComSpec || "cmd.exe") : "npm",
    windows ? ["/d", "/s", "/c", "npm.cmd run check:ci"] : ["run", "check:ci"],
    { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
}

async function fluxo({ git = executarGit, testar = executarTestes, perguntar, log = console.log, antesDoPush = () => {} }) {
  function ler(args, permitirAusente = false) {
    const r = git(args);
    if (r.error || (r.status !== 0 && !(permitirAusente && r.status === 1))) {
      throw new Error(r.error?.message || r.stderr?.trim() || "Não foi possível consultar o Git.");
    }
    return r.stdout?.trim() || "";
  }
  function alterar(args, falha) {
    const r = git(args, true);
    if (r.error || r.status !== 0) throw new Error(falha);
  }
  async function pedirMensagem() {
    for (;;) {
      const mensagem = (await perguntar("Mensagem do commit (ex.: fix: corrigir sincronização; /cancelar para sair): ")).trim();
      if (mensagem === "/cancelar") return null;
      const erro = validarMensagem(mensagem);
      if (!erro) return mensagem;
      log(erro);
    }
  }

  const branch = ler(["symbolic-ref", "--quiet", "--short", "HEAD"], true);
  if (!branch) throw new Error("HEAD destacado. Entre na branch desejada antes de usar F5.");
  for (const referencia of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    if (ler(["rev-parse", "--quiet", "--verify", referencia], true)) throw new Error("Conclua ou cancele a operação Git em andamento antes de usar F5.");
  }
  if (ler(["ls-files", "--unmerged"])) throw new Error("Resolva os conflitos do Git antes de criar o commit.");
  const remoto = ler(["config", "--get", `branch.${branch}.remote`], true) || "origin";
  const destino = ler(["config", "--get", `branch.${branch}.merge`], true) || `refs/heads/${branch}`;
  if (remoto === "." || !destino.startsWith("refs/heads/")) throw new Error("Configure uma branch remota de envio antes de continuar.");
  ler(["remote", "get-url", remoto]);
  ler(["check-ref-format", destino]);

  const status = ler(["status", "--short"]);
  let criado = null;
  if (status) {
    log(`Arquivos que entrarão no commit (inclui novos arquivos não ignorados):\n${status}`);
    if (!ler(["config", "user.name"], true) || !ler(["config", "user.email"], true)) {
      throw new Error("Configure git config user.name e git config user.email antes de criar o commit.");
    }
    const mensagem = await pedirMensagem();
    if (!mensagem) { log("Cancelado. Nenhum commit criado."); return 0; }
    alterar(["add", "--all", "--", "."], "Não foi possível preparar os arquivos. Confira permissões e o estado do Git.");
    alterar(["commit", "-m", mensagem], "Commit não criado. Confira o erro do Git acima; os arquivos continuam disponíveis para correção.");
    criado = ler(["rev-parse", "HEAD"]);
  } else log("Sem alterações novas. Serão enviados os commits locais pendentes.");

  for (;;) {
    log(`\nBranch: ${branch} → ${remoto}/${destino.slice("refs/heads/".length)}`);
    log(ler(["log", "-1", "--format=%h %s"]));
    const resposta = (await perguntar(`Confirmar git push? [s/N${criado ? "/editar" : ""}]: `)).trim().toLowerCase();
    if (["s", "sim"].includes(resposta)) break;
    if (["", "n", "nao", "não", "/cancelar"].includes(resposta)) {
      log("Push cancelado. O commit permanece salvo localmente."); return 0;
    }
    if (["e", "editar"].includes(resposta) && criado) {
      if (ler(["rev-parse", "HEAD"]) !== criado) throw new Error("O HEAD mudou durante a execução. Confira o histórico antes de editar o commit.");
      const mensagem = await pedirMensagem();
      if (!mensagem) { log("Push cancelado. O commit permanece salvo localmente."); return 0; }
      alterar(["commit", "--amend", "--only", "-m", mensagem], "Não foi possível corrigir a mensagem. O commit local foi preservado.");
      criado = ler(["rev-parse", "HEAD"]);
    } else log("Digite s para enviar, n para cancelar ou editar para corrigir a mensagem recém-criada.");
  }
  antesDoPush();
  log("Executando a bateria de testes antes do envio.");
  const resultadoTestes = testar();
  if (resultadoTestes.error || resultadoTestes.status !== 0) {
    throw new Error("Testes não aprovados. Push bloqueado; o commit local foi preservado. Corrija o erro e execute novamente.");
  }
  alterar(["push", "--set-upstream", remoto, `HEAD:${destino}`],
    "Push interrompido; o commit local foi preservado. Confira os testes e a mensagem do Git acima. Se houver rejeição por atualização remota, faça git fetch e revise a integração; não é feito push forçado. Erros de autenticação/rede precisam ser corrigidos antes de tentar F5 novamente.");
  log("Push concluído.");
  return 0;
}

if (require.main === module) {
  if (!process.stdin.isTTY) { console.error("Execute no terminal interativo: F5 no VS Code ou npm run publicar."); process.exitCode = 1; }
  else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    fluxo({ perguntar: texto => rl.question(texto), antesDoPush: () => rl.close() })
      .then(codigo => { process.exitCode = codigo; })
      .catch(erro => { console.error(`\n${erro.message}`); process.exitCode = 1; })
      .finally(() => rl.close());
  }
}
module.exports = { validarMensagem, fluxo };
