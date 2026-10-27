const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const urls = [];
const { prepararArquivoDaGaleriaWeb } = carregar(
  "servicos/seletorGaleriaWeb.ts",
  {},
  {
    URL: {
      createObjectURL(file) {
        urls.push(file);
        return `blob:foto-${urls.length}`;
      },
    },
  },
);

// Provedores de arquivos Android podem omitir o MIME ou informar octet-stream.
for (const type of ["", "application/octet-stream", "image/jpeg"]) {
  const file = { name: "FOTO.JPEG", type, size: 123 };
  const asset = prepararArquivoDaGaleriaWeb(file);
  assert.equal(asset.mimeType, "image/jpeg");
  assert.equal(asset.file, file, "O arquivo escolhido fica disponível para o upload");
  assert.equal(asset.fileSize, 123);
  assert.equal(asset.fileName, "FOTO.JPEG");
  assert.ok(asset.uri.startsWith("blob:"));
}
const validUrls = urls.length;
assert.throws(
  () => prepararArquivoDaGaleriaWeb({ name: "arquivo.pdf", type: "application/pdf", size: 30 }),
  /imagem/,
);
assert.throws(
  () => prepararArquivoDaGaleriaWeb({ name: "foto.png", type: "image/png", size: 0 }),
  /vazia/,
);
assert.equal(urls.length, validUrls, "Arquivos recusados não deixam URLs temporárias");
console.log("OK — fotos do seletor web com MIME ausente, extensão Android e arquivo inválido");

const entradas = [];
let modo = "picker";
const revogadas = [];
const navegador = { vendor: "Google Inc." };
const seletor = carregar("servicos/seletorGaleriaWeb.ts", {}, {
  navigator: navegador,
  URL: {
    createObjectURL: () => "blob:selecionada",
    revokeObjectURL: (uri) => revogadas.push(uri),
  },
  document: {
    createElement(tipo) {
      assert.equal(tipo, "input");
      const eventos = new Map();
      const entrada = {
        eventos,
        anexada: false,
        removida: false,
        aberturas: [],
        setAttribute(nome, valor) { this[nome] = valor; },
        addEventListener(nome, handler) { eventos.set(nome, handler); },
        removeEventListener(nome) { eventos.delete(nome); },
        remove() { this.removida = true; },
        click() {
          assert.ok(this.anexada, "O input deve estar no documento antes de abrir");
          this.aberturas.push("click");
          if (modo === "bloqueado") throw new Error("Navegador bloqueou");
        },
      };
      if (modo !== "antigo") entrada.showPicker = function () {
        assert.ok(this.anexada);
        this.aberturas.push("showPicker");
        if (modo !== "picker") throw new Error("showPicker indisponível");
      };
      entradas.push(entrada);
      return entrada;
    },
    body: { appendChild(entrada) { entrada.anexada = true; } },
  },
});
const selecionadas = [], erros = [];
const opcoes = {
  onSelecionar: (imagem) => selecionadas.push(imagem),
  onErro: (erro) => erros.push(erro.message),
};
seletor.abrirSeletorDeFotosWeb(opcoes);
let entrada = entradas.at(-1);
assert.deepEqual(entrada.aberturas, ["showPicker"], "Abre sincronamente no clique");
assert.equal(entrada.accept, "image/*");
assert.equal(entrada.capture, undefined, "A galeria não força câmera");
entrada.files = { item: () => ({ name: "foto.jpg", type: "image/jpeg", size: 123 }) };
entrada.eventos.get("change")();
assert.equal(selecionadas.length, 1);
assert.equal(entrada.removida, true);
assert.equal(entrada.eventos.size, 0);

for (modo of ["antigo", "parcial"]) {
  seletor.abrirSeletorDeFotosWeb({ ...opcoes, capture: "environment" });
  entrada = entradas.at(-1);
  assert.equal(entrada.aberturas.at(-1), "click", "Fallback para o clique do navegador");
  assert.equal(entrada.capture, "environment");
  entrada.eventos.get("cancel")();
  assert.equal(entrada.removida, true);
  assert.equal(selecionadas.length, 1, "Cancelar não troca a foto");
}
modo = "bloqueado";
seletor.abrirSeletorDeFotosWeb(opcoes);
assert.equal(entradas.at(-1).removida, true);
assert.equal(erros.length, 1, "Falhas de abertura são apresentadas ao usuário");

modo = "picker";
navegador.vendor = "Apple Computer, Inc.";
seletor.abrirSeletorDeFotosWeb(opcoes);
assert.deepEqual(entradas.at(-1).aberturas, ["click"], "WebKit usa o clique que abre arquivos");
entradas.at(-1).eventos.get("cancel")();
navegador.vendor = "Google Inc.";
const limpar = seletor.abrirSeletorDeFotosWeb(opcoes);
limpar();
assert.equal(entradas.at(-1).eventos.size, 0, "Desmontar a tela remove os listeners pendentes");
seletor.abrirSeletorDeFotosWeb({ ...opcoes, onSelecionar() { throw new Error("Falha na tela"); } });
entrada = entradas.at(-1);
entrada.files = { item: () => ({ name: "foto.png", type: "image/png", size: 100 }) };
entrada.eventos.get("change")();
assert.deepEqual(revogadas, ["blob:selecionada"], "Falha ao receber a foto libera o arquivo temporário");
console.log("OK — abertura síncrona, fallback, cancelamento e limpeza do seletor de fotos");
