import type { ImagePickerAsset } from "expo-image-picker";

type OpcoesSeletor = {
  capture?: "environment" | "user";
  onSelecionar: (imagem: ImagePickerAsset) => void;
  onErro: (erro: Error) => void;
};

/** Deve ser chamada diretamente no clique, antes de qualquer await ou mudança de tela. */
export function abrirSeletorDeFotosWeb({
  capture,
  onSelecionar,
  onErro,
}: OpcoesSeletor): () => void {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = "image/*";
  entrada.multiple = false;
  entrada.hidden = true;
  if (capture) entrada.setAttribute("capture", capture);

  const limpar = () => {
    entrada.removeEventListener("change", selecionar);
    entrada.removeEventListener("cancel", limpar);
    entrada.remove();
  };
  const selecionar = () => {
    const arquivo = entrada.files?.item(0);
    limpar();
    if (!arquivo) return;
    let imagem: ImagePickerAsset | undefined;
    try {
      imagem = prepararArquivoDaGaleriaWeb(arquivo);
      onSelecionar(imagem);
    } catch (erro) {
      if (imagem) URL.revokeObjectURL(imagem.uri);
      onErro(
        erro instanceof Error
          ? erro
          : new Error("Não foi possível ler a foto selecionada."),
      );
    }
  };
  entrada.addEventListener("change", selecionar);
  entrada.addEventListener("cancel", limpar);

  // Fora da árvore do ScrollView: eventos do formulário não disputam o toque.
  document.body.appendChild(entrada);
  try {
    // O Safari expõe showPicker, mas não abre arquivos por esse método.
    const usaWebKit =
      typeof navigator !== "undefined" &&
      navigator.vendor === "Apple Computer, Inc.";
    if (typeof entrada.showPicker === "function" && !usaWebKit) {
      try {
        entrada.showPicker();
      } catch {
        // Navegadores com implementação parcial ainda suportam o clique nativo.
        entrada.click();
      }
    } else {
      entrada.click();
    }
  } catch {
    limpar();
    onErro(
      new Error(
        "O navegador não conseguiu abrir as fotos. Toque novamente para tentar.",
      ),
    );
  }
  return limpar;
}

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
