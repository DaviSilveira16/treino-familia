const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
exports.carregar = function carregar(arquivo, mocks = {}, contexto = {}) {
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", arquivo), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const modulo = { exports: {} };
  const executar = vm.runInNewContext("(function(require,module,exports){" + codigo + "\n})", { Date, Map, Set, URL, AbortController, console, setTimeout, clearTimeout, Uint8Array, ...contexto });
  executar(id => { if (!(id in mocks)) throw new Error(`Dependência não simulada: ${id}`); return mocks[id]; }, modulo, modulo.exports);
  return modulo.exports;
};
exports.armazenamento = function armazenamento() {
  const dados = new Map();
  return { __esModule: true, dados, default: { getItem: async key => dados.get(key) ?? null, setItem: async (key, value) => { dados.set(key, value); }, removeItem: async key => { dados.delete(key); }, getAllKeys: async () => [...dados.keys()] } };
};
