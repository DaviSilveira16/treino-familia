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
 * Seleção direta pelo controle NATIVO de arquivos do navegador.
 *
 * Não envolver em TouchableOpacity, não sobrepor outro botão nem ocultar
 * o input. No Chrome Android, o toque deve chegar diretamente ao <input>
 * visível; picker.open(), input.click() e inputs invisíveis podem ser
 * bloqueados ou perder a ativação do usuário, especialmente em modais.
 * Sem `capture`, para não forçar a câmera no lugar da galeria.
 */
export function EntradaGaleriaWeb({
  disabled = false,
  onSelecionar,
  onErro,
  onAbrir,
  rotulo = "Selecionar foto do dispositivo",
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
      entrada.value = ""; // permite escolher a mesma foto mais de uma vez
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
      // O próprio controle do Chrome fica visível e recebe o toque.
      // Evitar position:absolute, opacity:0 e display:none.
      display: "block",
      position: "relative",
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      minHeight: 48,
      padding: "10px 8px",
      borderRadius: 9,
      border: "1px solid #66766C",
      backgroundColor: "#243129",
      color: "#F3F7F4",
      fontSize: 13,
      lineHeight: "22px",
      opacity: disabled ? 0.55 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      // A seleção é feita pelo botão nativo "Escolher arquivo" do Chrome.
      // Não existe overlay de React Native para interceptar o toque.
      pointerEvents: disabled ? "none" : "auto",
    },
  });
}
