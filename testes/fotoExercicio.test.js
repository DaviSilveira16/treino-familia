const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 16]);
let leituras = 0;
const fotos = carregar("servicos/fotoExercicio.ts", {
  "react-native": { Platform: { OS: "android" } },
  "expo-file-system": {
    File: class {
      async arrayBuffer() {
        leituras++;
        return jpeg.buffer;
      }
    },
  },
});
(async () => {
  const foto = await fotos.prepararFotoExercicio({
    uri: "content://foto/1",
    mimeType: "application/octet-stream",
    base64: Buffer.from(jpeg).toString("base64"),
  });
  assert.equal(foto.contentType, "image/jpeg");
  assert.equal(foto.extensao, "jpg");
  assert.deepEqual([...new Uint8Array(foto.arquivoImagem)], [...jpeg]);
  assert.equal(leituras, 0);
  const arquivo = await fotos.prepararFotoExercicio({
    uri: "content://foto/2",
    mimeType: "image/png",
  });
  assert.equal(arquivo.contentType, "image/jpeg");
  assert.equal(leituras, 1);
  assert.equal(
    fotos.identificarFoto(
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
    ).extensao,
    "png",
  );
  assert.equal(fotos.identificarFoto(Uint8Array.from([0, 1, 2]).buffer), null);
  assert.throws(() => fotos.decodificarFotoBase64("!inválido"));
  await assert.rejects(() =>
    fotos.prepararFotoExercicio({ uri: "x", fileSize: 21 * 1024 * 1024 }),
  );
  for (const bytes of [[0], [0, 255], [0, 255, 128], [255, 255, 255, 0]]) {
    assert.deepEqual(
      [
        ...new Uint8Array(
          fotos.decodificarFotoBase64(Buffer.from(bytes).toString("base64")),
        ),
      ],
      bytes,
    );
  }
  console.log("OK — foto Android sem MIME, bytes reais, content URI e limites");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
