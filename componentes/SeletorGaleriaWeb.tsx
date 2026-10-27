import React from "react";
import { Platform, View } from "react-native";
import type { ImagePickerAsset } from "expo-image-picker";

type Props = {
  children: React.ReactNode;
  disabled?: boolean;
  onSelecionar: (imagem: ImagePickerAsset) => void;
};

type CampoArquivoProps = {
  type: "file";
  accept: string;
  multiple: boolean;
  disabled: boolean;
  onChange: (evento: React.ChangeEvent<HTMLInputElement>) => void;
  "aria-label": string;
  style: React.CSSProperties;
};

// React Native Web não oferece um componente nativo de input type=file.
// Renderizamos o elemento HTML real sobre o botão para que o toque do usuário
// chegue diretamente ao seletor, sem depender de click() sintético ou showPicker().
const CampoArquivo = "input" as unknown as React.ComponentType<CampoArquivoProps>;

export default function SeletorGaleriaWeb({
  children,
  disabled = false,
  onSelecionar,
}: Props) {
  function aoSelecionarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const entrada = evento.currentTarget;
    const arquivo = entrada.files?.item(0) ?? null;
    // Permite escolher novamente a mesma foto depois de cancelar/trocar.
    entrada.value = "";
    if (!arquivo) return;

    if (!arquivo.type.startsWith("image/")) {
      if (typeof window !== "undefined") {
        window.alert("Arquivo inválido\n\nEscolha uma imagem JPG, PNG, WebP ou outro formato de imagem.");
      }
      return;
    }

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

    onSelecionar(imagem);
  }

  if (Platform.OS !== "web") return <>{children}</>;

  return (
    <View style={{ position: "relative" }}>
      {children}
      <CampoArquivo
        type="file"
        accept="image/*"
        multiple={false}
        disabled={disabled}
        aria-label="Escolher uma foto da galeria"
        onChange={aoSelecionarArquivo}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          opacity: 0.001,
          zIndex: 1000,
          cursor: "pointer",
          padding: 0,
          margin: 0,
          border: 0,
        }}
      />
    </View>
  );
}
