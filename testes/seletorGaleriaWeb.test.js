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
