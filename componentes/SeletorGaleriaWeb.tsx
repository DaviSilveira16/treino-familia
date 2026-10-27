import React from "react";
import type { ImagePickerAsset } from "expo-image-picker";
import { prepararArquivoDaGaleriaWeb } from "../servicos/seletorGaleriaWeb";

type Props = {
  disabled?: boolean;
  onSelecionar: (imagem: ImagePickerAsset) => void;
  onErro: (erro: Error) => void;
  onAbrir?: () => void;
  rotulo?: string;
};

/**
 * O próprio input HTML cobre a área visível do botão e recebe o toque físico.
 * Chrome/Android e Safari/iOS podem bloquear input.click() em um elemento
 * criado fora da tela; o toque direto no input não depende desse comportamento.
 * Monte este componente dentro de uma View com position: 'relative'.
 */
export function EntradaGaleriaWeb({
  disabled = false,
  onSelecionar,
  onErro,
  onAbrir,
  rotulo = "Escolher uma foto da galeria",
}: Props) {
  return React.createElement("input", {
    type: "file",
    accept: "image/*",
    disabled,
    multiple: false,
    title: rotulo,
    "aria-label": rotulo,
    onClick: () => onAbrir?.(),
    onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
      const entrada = evento.currentTarget;
      const arquivo = entrada.files?.item(0);
      // Permite escolher o mesmo arquivo novamente depois de uma tentativa.
      entrada.value = "";
      if (!arquivo) return;
      try {
        onSelecionar(prepararArquivoDaGaleriaWeb(arquivo));
      } catch (problema) {
        onErro(
          problema instanceof Error
            ? problema
            : new Error("Não foi possível ler a imagem selecionada."),
        );
      }
    },
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      opacity: 0.01,
      cursor: disabled ? "not-allowed" : "pointer",
      zIndex: 2,
      margin: 0,
      padding: 0,
      border: 0,
      // Não usar display:none, visibility:hidden nem coordenadas fora da tela.
      pointerEvents: disabled ? "none" : "auto",
    },
  });
}
