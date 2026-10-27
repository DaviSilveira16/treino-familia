import React, { useEffect, useRef } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import type { ImagePickerAsset } from "expo-image-picker";

type Props = {
  children: React.ReactNode;
  disabled?: boolean;
  onSelecionar: (imagem: ImagePickerAsset) => void;
};

export default function SeletorGaleriaWeb({
  children,
  disabled = false,
  onSelecionar,
}: Props) {
  const entradaRef = useRef<HTMLInputElement | null>(null);
  const callbackRef = useRef(onSelecionar);
  const desabilitadoRef = useRef(disabled);
  callbackRef.current = onSelecionar;
  desabilitadoRef.current = disabled;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    // Um input real anexado ao documento é mais confiável no Chrome Android/PWA
    // do que renderizar uma tag HTML diretamente dentro da árvore do React Native.
    const entrada = document.createElement("input");
    entrada.type = "file";
    entrada.accept = "image/*";
    entrada.multiple = false;
    entrada.setAttribute("aria-label", "Escolher uma foto da galeria");
    entrada.tabIndex = -1;
    Object.assign(entrada.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: "-1",
    });

    const aoSelecionarArquivo = () => {
      const arquivo = entrada.files?.item(0) ?? null;
      // Permite selecionar a mesma imagem novamente depois de trocar/cancelar.
      entrada.value = "";
      if (!arquivo || !arquivo.type.startsWith("image/")) return;

      const uri = URL.createObjectURL(arquivo);
      const imagem = {
        uri,
        file: arquivo,
        fileName: arquivo.name,
        fileSize: arquivo.size,
        width: 0,
        height: 0,
        type: "image",
        mimeType: arquivo.type || undefined,
      } as ImagePickerAsset;

      callbackRef.current(imagem);
    };

    entrada.addEventListener("change", aoSelecionarArquivo);
    document.body.appendChild(entrada);
    entradaRef.current = entrada;

    return () => {
      entrada.removeEventListener("change", aoSelecionarArquivo);
      entrada.remove();
      entradaRef.current = null;
    };
  }, []);

  function abrirGaleria() {
    if (disabled || desabilitadoRef.current) return;
    const entrada = entradaRef.current;
    if (!entrada) {
      if (typeof window !== "undefined") {
        window.alert(
          "Não foi possível abrir a galeria. Atualize a página e tente novamente.",
        );
      }
      return;
    }

    // A abertura ocorre de forma síncrona no toque do usuário, requisito do navegador.
    entrada.value = "";
    try {
      if (typeof entrada.showPicker === "function") entrada.showPicker();
      else entrada.click();
    } catch {
      try {
        entrada.click();
      } catch {
        if (typeof window !== "undefined") {
          window.alert(
            "O navegador não conseguiu abrir a galeria. Tente atualizar a página ou abrir o app no Chrome.",
          );
        }
      }
    }
  }

  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={{ position: "relative", alignSelf: "stretch" }}>
      {children}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Escolher uma foto da galeria"
        activeOpacity={1}
        disabled={disabled}
        onPress={abrirGaleria}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          elevation: 1000,
          backgroundColor: "transparent",
        }}
      />
    </View>
  );
}
