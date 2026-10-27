import type { ImagePickerAsset } from "expo-image-picker";

/** Opens the Android/browser photo chooser directly in the original tap handler. */
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
    // Android WebView/Chrome may ignore clicks on display:none or off-screen inputs.
    Object.assign(entrada.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "2px",
      height: "2px",
      opacity: "0.01",
      zIndex: "2147483647",
      pointerEvents: "auto",
    });

    let finalizado = false;
    let temporizadorFoco: ReturnType<typeof setTimeout> | undefined;
    const limpar = () => {
      entrada.removeEventListener("change", aoAlterar);
      entrada.removeEventListener("cancel", aoCancelar);
      window.removeEventListener("focus", aoVoltarAoNavegador);
      if (temporizadorFoco) clearTimeout(temporizadorFoco);
      entrada.remove();
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
      const mimeType = arquivo.type.startsWith("image/")
        ? arquivo.type
        : (tipoPorExtensao[extensao] ?? "");
      if (!mimeType) {
        falhar(new Error("Escolha um arquivo de imagem da galeria."));
        return;
      }
      if (!arquivo.size) {
        falhar(
          new Error("A imagem selecionada está vazia. Escolha outra foto."),
        );
        return;
      }
      try {
        concluir({
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
        });
      } catch (erro) {
        falhar(erro);
      }
    };
    const aoCancelar = () => concluir(null);
    const aoVoltarAoNavegador = () => {
      temporizadorFoco = setTimeout(() => {
        if (!entrada.files?.length) concluir(null);
      }, 15000);
    };

    entrada.addEventListener("change", aoAlterar);
    entrada.addEventListener("cancel", aoCancelar);
    window.addEventListener("focus", aoVoltarAoNavegador, { once: true });
    document.body.appendChild(entrada);
    try {
      // Must happen synchronously during the real tap; Android rejects delayed synthetic clicks.
      if (typeof entrada.showPicker === "function") entrada.showPicker();
      else entrada.click();
    } catch (erro) {
      try {
        entrada.click();
      } catch {
        falhar(erro);
      }
    }
  });
}
