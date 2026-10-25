import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleProp,
  ImageStyle,
  StyleSheet,
} from "react-native";
import { obterPreviewWeb } from "../servicos/previewsFotosWeb";

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  larguraPreview?: number;
};

/**
 * No Safari, não decodifica fotos de cartões fora da área visível.
 * Nunca altera, recomprime nem substitui o arquivo original no Storage.
 */
export default function ImagemLeve({
  uri,
  style,
  resizeMode = "cover",
  larguraPreview = 720,
}: Props) {
  const elemento = useRef<HTMLImageElement | null>(null);
  const [preview, setPreview] = useState<{ origem: string; url: string } | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let ativo = true;
    let liberar: (() => void) | undefined;
    let iniciado = false;
    function carregar() {
      if (iniciado) return;
      iniciado = true;
      void obterPreviewWeb(uri, larguraPreview).then((resultado) => {
        if (!ativo) { resultado.liberar(); return; }
        liberar = resultado.liberar;
        setPreview({ origem: uri, url: resultado.uri });
      }).catch(() => {
        if (ativo) setPreview({ origem: uri, url: uri });
      });
    }
    const observador = typeof IntersectionObserver !== "undefined" && elemento.current
      ? new IntersectionObserver((entradas) => {
          if (entradas.some((entrada) => entrada.isIntersecting)) {
            observador?.disconnect();
            carregar();
          }
        }, { rootMargin: "200px" })
      : null;
    if (observador && elemento.current) observador.observe(elemento.current);
    else carregar();
    return () => {
      ativo = false;
      observador?.disconnect();
      liberar?.();
    };
  }, [uri, larguraPreview]);
  if (Platform.OS === "web") {
    return React.createElement("img", {
      ref: elemento,
      src: preview?.origem === uri ? preview.url : undefined,
      alt: "",
      loading: "lazy",
      decoding: "async",
      draggable: false,
      onError: () => {
        if (preview?.origem === uri && preview.url !== uri)
          setPreview({ origem: uri, url: uri });
      },
      style: {
        ...StyleSheet.flatten(style),
        objectFit:
          resizeMode === "contain"
            ? "contain"
            : resizeMode === "stretch"
              ? "fill"
              : "cover",
        display: "block",
      },
    });
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}
