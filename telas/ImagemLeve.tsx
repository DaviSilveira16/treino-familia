import React from "react";
import {
  Image,
  Platform,
  StyleProp,
  ImageStyle,
  StyleSheet,
} from "react-native";

type Props = {
  uri: string;
  style: StyleProp<ImageStyle>;
  resizeMode?: "cover" | "contain" | "stretch" | "center";
};

/**
 * No Safari, não decodifica fotos de cartões fora da área visível.
 * Nunca altera, recomprime nem substitui o arquivo original no Storage.
 */
export default function ImagemLeve({
  uri,
  style,
  resizeMode = "cover",
}: Props) {
  if (Platform.OS === "web") {
    return React.createElement("img", {
      src: uri,
      alt: "",
      loading: "lazy",
      decoding: "async",
      draggable: false,
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
