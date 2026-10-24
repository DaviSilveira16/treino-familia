// npm dependencies already in package-lock: node + typescript, without test frameworks.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");

const arquivo = path.join(__dirname, "../servicos/cacheConsultas.ts");
const codigo = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
let revisao = 0;
let authCallback;
const exportsTS = {};
const modulo = { exports: exportsTS };
const mocks = {
  "./revisaoDados": { obterRevisaoDeDados: () => revisao },
  "../supabase": {
    supabase: {
      auth: {
        onAuthStateChange: (cb) => {
          authCallback = cb;
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
    },
  },
};
vm.runInNewContext("(function(require,module,exports){" + codigo + "\n})", {
  Date,
  Map,
  Set,
  console,
})(
  (id) => {
    assert.ok(id in mocks);
    return mocks[id];
  },
  modulo,
  exportsTS,
);
const cache = modulo.exports;
assert.equal(typeof authCallback, "function");
authCallback("INITIAL_SESSION", { user: { id: "usuario-A" } });
cache.salvarCache("usuario-A", "lista", [{ id: 1 }], 1000);
assert.deepEqual(cache.lerCache("usuario-A", "lista"), [{ id: 1 }]);
assert.equal(cache.lerCache("usuario-B", "lista"), undefined);
revisao++;
assert.equal(cache.lerCacheParaExibicao("usuario-A", "lista"), undefined);
cache.salvarCache("usuario-A", "lista", [2], 1000);
authCallback("SIGNED_OUT", null);
assert.equal(cache.lerCacheParaExibicao("usuario-A", "lista"), undefined);
console.log("OK — isolamento por usuário, invalidação e limpeza no logout");
