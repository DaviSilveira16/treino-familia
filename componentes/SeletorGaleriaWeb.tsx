import React, { useEffect, useRef } from "react";
import type { ImagePickerAsset } from "expo-image-picker";
import { abrirSeletorDeFotosWeb } from "../servicos/seletorGaleriaWeb";

type Props = {
  disabled?: boolean;
  capture?: "environment" | "user";
  onSelecionar: (imagem: ImagePickerAsset) => void;
  onErro: (erro: Error) => void;
  onAbrir?: () => void;
  rotulo?: string;
  texto?: string;
  corTema?: string;
  compacto?: boolean;
};

export function EntradaGaleriaWeb({
  disabled = false,
  capture,
  onSelecionar,
  onErro,
  onAbrir,
  rotulo = "Escolher foto",
  texto = "Adicionar foto",
  corTema = "#35D07F",
  compacto = false,
}: Props) {
  const limparRef = useRef<(() => void) | null>(null);
  useEffect(() => () => limparRef.current?.(), []);

  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={disabled}
      onClick={(evento) => {
        evento.stopPropagation();
        limparRef.current?.();
        onAbrir?.();
        // Síncrono: o Chrome recebe a abertura dentro do próprio clique.
        limparRef.current = abrirSeletorDeFotosWeb({
          capture,
          onSelecionar,
          onErro,
        });
      }}
      style={{
        display: "inline-flex",
        boxSizing: "border-box",
        appearance: "none",
        flex: "1 1 0%",
        minWidth: 0,
        margin: 0,
        alignItems: "center",
        justifyContent: "center",
        gap: compacto ? 3 : 6,
        minHeight: 44,
        padding: compacto ? "9px 6px" : "9px 10px",
        border: `1px solid ${corTema}55`,
        borderRadius: 10,
        color: corTema,
        backgroundColor: `${corTema}14`,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        fontSize: compacto ? 12 : 13,
        fontWeight: 700,
        lineHeight: compacto ? "18px" : "20px",
        whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg
        width={compacto ? 14 : 18}
        height={compacto ? 14 : 18}
        style={{ flexShrink: 0 }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {capture ? (
          <>
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
            <circle cx="12" cy="13" r="4" />
          </>
        ) : (
          <>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </>
        )}
      </svg>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {texto}
      </span>
    </button>
  );
}
