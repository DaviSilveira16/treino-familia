import React, { useEffect } from "react";
import { Platform } from "react-native";
import { createPortal } from "react-dom";
import type { ImagePickerAsset } from "expo-image-picker";
import { prepararArquivoDaGaleriaWeb } from "../servicos/seletorGaleriaWeb";

type Props = {
  aberto: boolean;
  titulo?: string;
  bloqueado?: boolean;
  onFechar: () => void;
  onSelecionar: (imagem: ImagePickerAsset) => void;
  onErro: (erro: Error) => void;
  onAbrirSeletor?: () => void;
};

/**
 * Menu de origem da foto no navegador, semelhante à folha de ações do iOS.
 *
 * Os dois itens contêm <input type=file> REAL, ocupando toda a área tocável.
 * Assim, é o próprio toque no input que solicita ao Chrome Android a câmera
 * ou a fototeca. Nunca executamos input.click(), launchImageLibraryAsync()
 * após setState/await, nem tentamos abrir um input dentro do Modal RN Web.
 * O portal no document.body também evita interceptação pelo Modal/ScrollView.
 */
export function SeletorFotoPopup({
  aberto,
  titulo = "Adicionar foto",
  bloqueado = false,
  onFechar,
  onSelecionar,
  onErro,
  onAbrirSeletor,
}: Props) {
  useEffect(() => {
    if (!aberto || Platform.OS !== "web") return;
    const voltar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", voltar);
    return () => document.removeEventListener("keydown", voltar);
  }, [aberto, onFechar]);

  if (!aberto || Platform.OS !== "web" || typeof document === "undefined")
    return null;

  const selecionar = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const entrada = evento.currentTarget;
    const arquivo = entrada.files?.item(0);
    entrada.value = "";
    if (!arquivo) return;
    try {
      onSelecionar(prepararArquivoDaGaleriaWeb(arquivo));
      onFechar();
    } catch (erro) {
      onErro(
        erro instanceof Error
          ? erro
          : new Error("Não foi possível acessar a imagem selecionada."),
      );
    }
  };

  const opcao = (origem: "camera" | "fototeca") => (
    <label
      key={origem}
      style={{
        position: "relative",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        minHeight: 62,
        padding: "12px 18px",
        color: "#F5F7F5",
        background: "#29332C",
        border: "1px solid #4C5C50",
        borderRadius: 13,
        fontSize: 17,
        fontWeight: 650,
        cursor: bloqueado ? "not-allowed" : "pointer",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 25 }}>
        {origem === "camera" ? "📷" : "🖼️"}
      </span>
      <span>{origem === "camera" ? "Câmera" : "Fototeca"}</span>
      <input
        type="file"
        accept="image/*"
        capture={origem === "camera" ? "environment" : undefined}
        aria-label={
          origem === "camera"
            ? "Tirar foto com a câmera"
            : "Escolher foto da fototeca"
        }
        disabled={bloqueado}
        onClick={(evento) => {
          evento.stopPropagation();
          onAbrirSeletor?.();
        }}
        onChange={selecionar}
        style={{
          // O input REAL recebe o toque diretamente; não usar .click() nem display:none.
          position: "absolute",
          inset: 0,
          display: "block",
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          opacity: 0.01,
          cursor: "pointer",
          zIndex: 1,
        }}
      />
    </label>
  );

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "16px 12px max(20px, env(safe-area-inset-bottom))",
        backgroundColor: "rgba(0,0,0,.74)",
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar opções de foto"
        style={{
          position: "absolute",
          inset: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
        }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          borderRadius: 20,
          backgroundColor: "#19231C",
          boxSizing: "border-box",
          boxShadow: "0 12px 50px rgba(0,0,0,.5)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            color: "#F5F7F5",
            fontWeight: 750,
            fontSize: 19,
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          {titulo}
        </div>
        {opcao("camera")}
        {opcao("fototeca")}
        <button
          type="button"
          onClick={onFechar}
          style={{
            minHeight: 52,
            marginTop: 5,
            border: "1px solid #66766C",
            borderRadius: 13,
            color: "#F5F7F5",
            backgroundColor: "#37443A",
            fontSize: 16,
            fontWeight: 650,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </section>
    </div>,
    document.body,
  );
}
