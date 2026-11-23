const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { gerarOffline } = require("../scripts/gerar-offline.cjs");

const pastaTestes = path.resolve(__dirname, "../.test-results");
fs.mkdirSync(pastaTestes, { recursive: true });
const temporario = fs.mkdtempSync(path.join(pastaTestes, "offline-cache-"));

// A mesma aplicação com outra implementação do worker, sem trocar seus assets.
const original = fs.readFileSync(require.resolve("../scripts/gerar-offline.cjs"), "utf8");
const alterado = original.replace("cache:'reload'", "cache:'no-store'");
assert.notEqual(alterado, original);
const modulo = { exports: {} };
vm.runInNewContext(alterado, { require, module: modulo, exports: modulo.exports });
const gerarOutraImplementacao = modulo.exports.gerarOffline;

function instalar(codigo, caches, falhar = false) {
  const eventos = new Map();
  vm.runInNewContext(codigo, {
    self: { addEventListener: (nome, handler) => eventos.set(nome, handler) },
    caches: {
      open: async (nome) => {
        if (!caches.has(nome)) caches.set(nome, new Map());
        const dados = caches.get(nome);
        return { addAll: async (pedidos) => {
          dados.set(pedidos[0].url, "parcial");
          if (falhar) throw new Error("Recurso indisponível durante a instalação");
          for (const pedido of pedidos) dados.set(pedido.url, "confirmado");
        } };
      },
      delete: async (nome) => caches.delete(nome),
    },
    Request: class { constructor(url) { this.url = url; } },
  });
  let resultado;
  eventos.get("install")({ waitUntil: (promessa) => { resultado = promessa; } });
  return resultado;
}

(async () => {
  try {
    const a = path.join(temporario, "a"), b = path.join(temporario, "b");
    fs.mkdirSync(a);
    fs.writeFileSync(path.join(a, "index.html"), '<html><head></head><body><script src="/app.js"></script></body></html>');
    fs.writeFileSync(path.join(a, "app.js"), "globalThis.aplicacao = true;");
    const va = gerarOffline(a);
    const workerA = fs.readFileSync(path.join(a, "sw.js"), "utf8");
    assert.equal(gerarOffline(a), va, "Repetir o build não altera a identidade");
    assert.equal(fs.readFileSync(path.join(a, "sw.js"), "utf8"), workerA);

    fs.cpSync(a, b, { recursive: true });
    const vb = gerarOutraImplementacao(b);
    const workerB = fs.readFileSync(path.join(b, "sw.js"), "utf8");
    assert.notEqual(va, vb, "Alterar somente o worker precisa criar outro cache");
    assert.equal(gerarOutraImplementacao(b), vb);
    assert.ok(workerB.includes(`CACHE='tf-app-${vb}'`));
    assert.ok(fs.readFileSync(path.join(b, "index.html"), "utf8").includes(`content="${vb}"`));
    assert.equal(JSON.parse(fs.readFileSync(path.join(b, "offline-build.json"))).versao, vb);

    const caches = new Map();
    await instalar(workerA, caches);
    const ativo = caches.get(`tf-app-${va}`);
    const conteudoAtivo = [...ativo];
    await assert.rejects(instalar(workerB, caches, true), /Recurso indisponível/);
    assert.equal(caches.get(`tf-app-${va}`), ativo, "A instalação não pode substituir o cache ativo");
    assert.deepEqual([...ativo], conteudoAtivo, "O conteúdo offline anterior permanece intacto");
    assert.equal(caches.has(`tf-app-${vb}`), false, "Somente o cache da instalação incompleta é removido");

    fs.appendFileSync(path.join(b, "app.js"), "\nglobalThis.novaTela = true;");
    assert.notEqual(gerarOutraImplementacao(b), vb, "Alterar um asset também muda a identidade");
    console.log("OK cache offline: código do worker no hash, build determinístico e cache ativo preservado após falha");
  } finally {
    const destino = path.resolve(temporario);
    if (path.dirname(destino) !== pastaTestes) throw new Error("Pasta temporária fora do diretório de testes");
    fs.rmSync(destino, { recursive: true, force: true });
  }
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
