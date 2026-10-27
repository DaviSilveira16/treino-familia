import { Platform } from "react-native";
import { File as ArquivoExpo } from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";

export function decodificarFotoBase64(texto: string): ArrayBuffer {
  const base = texto.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (!base || base.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base))
    throw new Error(
      "Não foi possível ler os dados da foto. Selecione-a novamente.",
    );
  const alfabeto =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new Uint8Array(
    (base.length / 4) * 3 -
      (base.endsWith("==") ? 2 : base.endsWith("=") ? 1 : 0),
  );
  let posicao = 0;
  for (let i = 0; i < base.length; i += 4) {
    const valor =
      (alfabeto.indexOf(base[i]) << 18) |
      (alfabeto.indexOf(base[i + 1]) << 12) |
      (Math.max(0, alfabeto.indexOf(base[i + 2])) << 6) |
      Math.max(0, alfabeto.indexOf(base[i + 3]));
    for (const deslocamento of [16, 8, 0])
      if (posicao < bytes.length)
        bytes[posicao++] = (valor >> deslocamento) & 255;
  }
  return bytes.buffer;
}

export function identificarFoto(buffer: ArrayBuffer) {
  const b = new Uint8Array(buffer);
  if (b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { contentType: "image/jpeg", extensao: "jpg" };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((valor, i) => b[i] === valor))
    return { contentType: "image/png", extensao: "png" };
  if (
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return { contentType: "image/webp", extensao: "webp" };
  return null;
}

async function converterWeb(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const tipo =
    identificarFoto(buffer)?.contentType ?? "application/octet-stream";
  const url = URL.createObjectURL(new Blob([buffer], { type: tipo }));
  try {
    const imagem = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "A leitura da foto demorou demais. Selecione outra imagem.",
            ),
          ),
        15000,
      );
      imagem.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      imagem.onerror = () => {
        clearTimeout(timer);
        reject(
          new Error(
            "Este aparelho não conseguiu abrir a foto. Exporte-a como JPG ou PNG e tente novamente.",
          ),
        );
      };
      imagem.src = url;
    });
    const escala = Math.min(
      1,
      1280 / Math.max(imagem.naturalWidth, imagem.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw new Error("Não foi possível preparar a foto neste navegador.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return decodificarFotoBase64(canvas.toDataURL("image/jpeg", 0.8));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepararFotoExercicio(imagem: ImagePickerAsset) {
  if ((imagem.fileSize ?? 0) > 20 * 1024 * 1024)
    throw new Error("Selecione uma foto de até 20 MB.");
  // O seletor nativo fornece JPEG em base64. Não rotular os bytes com o MIME do arquivo original.
  let arquivoImagem =
    Platform.OS === "web"
      ? imagem.file
        ? await imagem.file.arrayBuffer()
        : await (await fetch(imagem.uri)).arrayBuffer()
      : imagem.base64
        ? decodificarFotoBase64(imagem.base64)
        : await new ArquivoExpo(imagem.uri).arrayBuffer();
  if (!arquivoImagem.byteLength)
    throw new Error("A foto veio vazia. Selecione-a novamente.");
  if (arquivoImagem.byteLength > 20 * 1024 * 1024)
    throw new Error("Selecione uma foto de até 20 MB.");
  if (Platform.OS === "web") arquivoImagem = await converterWeb(arquivoImagem);
  const formato = identificarFoto(arquivoImagem);
  if (!formato)
    throw new Error(
      "Não foi possível converter esta imagem. Escolha uma foto JPG, PNG ou WebP.",
    );
  if (arquivoImagem.byteLength > 5 * 1024 * 1024)
    throw new Error(
      "A foto ainda excede 5 MB. Recorte-a ou escolha uma imagem menor.",
    );
  return { arquivoImagem, ...formato };
}
