import type { ImagePickerAsset } from "expo-image-picker";

/**
 * Abre o seletor de imagens do próprio navegador. O input.click() é chamado
 * sincronicamente durante o evento de toque para preservar a ativação do usuário
 * exigida pelo Chrome/Android (o seletor web do Expo usa um evento sintético).
 */
export function selecionarImagemDaGaleriaWeb(): Promise<ImagePickerAsset | null> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return Promise.reject(
      new Error("A galeria só pode ser aberta no navegador."),
    );
  }

  return new Promise((resolve, reject) => {
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = "image/*";
    entrada.multiple = false;
    entrada.setAttribute("aria-label", "Escolher uma foto da galeria");
    entrada.style.position = "fixed";
    entrada.style.left = "-10000px";
    entrada.style.top = "0";
    entrada.style.width = "1px";
    entrada.style.height = "1px";
    entrada.style.opacity = "0";
    entrada.style.pointerEvents = "none";

    let finalizado = false;
    let temporizadorFoco: ReturnType<typeof setTimeout> | null = null;

    const limpar = () => {
      entrada.removeEventListener("change", aoAlterar);
      entrada.removeEventListener("cancel", aoCancelar);
      window.removeEventListener("focus", aoVoltarAoNavegador);
      if (temporizadorFoco) clearTimeout(temporizadorFoco);
      if (entrada.parentNode) entrada.parentNode.removeChild(entrada);
    };

    const concluir = (imagem: ImagePickerAsset | null) => {
      if (finalizado) return;
      finalizado = true;
      limpar();
      resolve(imagem);
    };

    const falhar = (erro: unknown) => {
      if (finalizado) return;
      finalizado = true;
      limpar();
      reject(erro);
    };

    const aoAlterar = () => {
      const arquivo = entrada.files?.item(0);
      if (!arquivo) {
        concluir(null);
        return;
      }
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
      const tipoPorExtensao: Record<string, string> = {
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
      const tipoImagem = arquivo.type.startsWith("image/")
        ? arquivo.type
        : (tipoPorExtensao[extensao] ?? "");
      if (!tipoImagem.startsWith("image/")) {
        falhar(new Error("Selecione uma foto JPG, PNG ou WebP."));
        return;
      }
      if (arquivo.size <= 0) {
        falhar(
          new Error("A imagem selecionada está vazia. Escolha outra foto."),
        );
        return;
      }

      try {
        const uri = URL.createObjectURL(arquivo);
        concluir({
          uri,
          width: 0,
          height: 0,
          type: "image",
          fileName: arquivo.name || null,
          fileSize: arquivo.size,
          mimeType: tipoImagem,
          file: arquivo,
          base64: null,
          duration: null,
          assetId: null,
        });
      } catch (erro) {
        falhar(erro);
      }
    };

    const aoCancelar = () => concluir(null);

    const aoVoltarAoNavegador = () => {
      // Alguns navegadores Android não emitem o evento "cancel" ao fechar o seletor.
      temporizadorFoco = setTimeout(() => {
        if (!entrada.files?.length) concluir(null);
      }, 900);
    };

    entrada.addEventListener("change", aoAlterar);
    entrada.addEventListener("cancel", aoCancelar);
    window.addEventListener("focus", aoVoltarAoNavegador, { once: true });
    document.body.appendChild(entrada);

    try {
      // Não colocar await, Promise.then ou setState antes deste clique.
      // O navegador precisa reconhecer este comando como parte do toque original.
      entrada.click();
    } catch (erro) {
      falhar(erro);
    }
  });
}
