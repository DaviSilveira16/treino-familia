import type { ImagePickerAsset } from "expo-image-picker";

/** Converte o arquivo escolhido por um input HTML real em um asset do Expo. */
export function prepararArquivoDaGaleriaWeb(arquivo: File): ImagePickerAsset {
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  const tipos: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    heic: "image/heic",
    heif: "image/heif",
    bmp: "image/bmp",
  };
  const mimeType = arquivo.type.startsWith("image/")
    ? arquivo.type
    : (tipos[extensao] ?? "");
  if (!mimeType) throw new Error("Escolha um arquivo de imagem da galeria.");
  if (!arquivo.size)
    throw new Error("A imagem selecionada está vazia. Escolha outra foto.");

  return {
    uri: URL.createObjectURL(arquivo),
    width: 0,
    height: 0,
    type: "image",
    fileName: arquivo.name || null,
    fileSize: arquivo.size,
    mimeType,
    file: arquivo,
    base64: null,
    duration: null,
    assetId: null,
  };
}
