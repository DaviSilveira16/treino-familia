const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Fonte única das verificações locais e do job verificar no GitHub Actions.
const etapas = [
  ["TypeScript, lint e testes unitários", "check"],
  ["Migrações e permissões SQL", "test:sql"],
  ["Build web", "build:web"],
  ["Interface Chromium", "test:ui"],
  ["Interface WebKit", "test:ui", { SMOKE_BROWSER: "webkit" }],
  ["Fotos ao salvar novo treino", "test:ui", { SMOKE_MODEL_PHOTOS_ONLY: "1" }],
  ["Próximo treino com foto pendente", "test:ui", { SMOKE_PHOTO_RETRY_ONLY: "1" }],
  ["Diário de nutrição", "test:nutricao:ui"],
  ["Painel e CSV", "test:ui", { SMOKE_PAINEL_ONLY: "1" }],
  ["Painel no WebKit", "test:ui", { SMOKE_BROWSER: "webkit", SMOKE_PAINEL_ONLY: "1" }],
  ["Paginação e rolagem", "test:ui", { SMOKE_SCROLLS_ONLY: "1" }],
  ["Comunidade, backup e acessibilidade", "test:ui", { SMOKE_MELHORIAS_ONLY: "1" }],
  ["Melhorias no WebKit", "test:ui", { SMOKE_BROWSER: "webkit", SMOKE_MELHORIAS_ONLY: "1" }],
  ["Avanço de exercícios", "test:ui", { SMOKE_AVANCO_ONLY: "1" }],
  ["Avanço no WebKit", "test:ui", { SMOKE_BROWSER: "webkit", SMOKE_AVANCO_ONLY: "1" }],
  ["Abertura e atualização offline", "test:offline"],
  ["Offline no WebKit", "test:offline", { SMOKE_BROWSER: "webkit" }],
];

function ambienteDeTeste(original, adicional = {}) {
  const env = { ...original };
  // Uma opção de smoke herdada não pode reduzir silenciosamente a bateria.
  for (const nome of Object.keys(env)) {
    if (/^SMOKE_/i.test(nome) || /^EXPO_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)$/i.test(nome)) delete env[nome];
  }
  return { ...env,
    EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:43119",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ci_placeholder",
    ...adicional,
  };
}

function executar(executor = spawnSync, env = process.env, logger = console) {
  if (!env.npm_execpath) throw new Error("Execute com npm run check:ci.");
  for (const [indice, [nome, script, adicional]] of etapas.entries()) {
    logger.log(`\n[${indice + 1}/${etapas.length}] ${nome}`);
    const resultado = executor(process.execPath, [env.npm_execpath, "run", script], {
      cwd: path.resolve(__dirname, ".."), env: ambienteDeTeste(env, adicional), stdio: "inherit",
    });
    if (resultado.error || resultado.status !== 0) {
      logger.error(`Verificação interrompida: ${nome}.`, resultado.error?.message ?? "");
      return resultado.status || 1;
    }
  }
  logger.log("\nTodas as verificações da CI passaram.");
  return 0;
}

if (require.main === module) {
  if (process.argv.includes("--listar")) etapas.forEach(([nome, script, env]) => console.log(`${nome}: npm run ${script} ${JSON.stringify(env ?? {})}`));
  else process.exitCode = executar();
}
module.exports = { etapas, ambienteDeTeste, executar };
