const { readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const tests = readdirSync(path.join(__dirname, "../testes")).filter(name => name.endsWith(".test.js")).sort();
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "../testes", test)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`${tests.length} arquivos de testes passaram.`);
