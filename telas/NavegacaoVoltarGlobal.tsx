import React, { ReactNode, useEffect, useRef } from "react";
import {
  BackHandler,
  PanResponder,
  Platform,
  StyleSheet,
  View,
} from "react-native";

type Props = {
  children: ReactNode;
  onVoltar: () => void;
  ativo?: boolean;
};

export default function NavegacaoVoltarGlobal({
  children,
  onVoltar,
  ativo = true,
}: Props) {
  const voltarRef = useRef(onVoltar);
  const gestoConcluido = useRef(false);

  voltarRef.current = onVoltar;

  const gesto = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,

      onMoveShouldSetPanResponder: (_, movimento) =>
        ativo &&
        movimento.x0 <= 36 &&
        movimento.dx > 8 &&
        Math.abs(movimento.dx) > Math.abs(movimento.dy) * 1.2,

      onPanResponderGrant: () => {
        gestoConcluido.current = false;
      },

      onPanResponderTerminationRequest: () => false,

      onPanResponderRelease: (_, movimento) => {
        if (
          !gestoConcluido.current &&
          ativo &&
          movimento.x0 <= 36 &&
          movimento.dx >= 55 &&
          Math.abs(movimento.dx) > Math.abs(movimento.dy) * 1.2
        ) {
          gestoConcluido.current = true;
          voltarRef.current();
        }
      },

      onPanResponderTerminate: () => {
        gestoConcluido.current = false;
      },
    }),
  ).current;

  useEffect(() => {
    if (!ativo || Platform.OS === "ios") {
      return;
    }

    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      voltarRef.current();
      return true;
    });

    return () => assinatura.remove();
  }, [ativo]);

  return (
    <View style={estilos.container}>
      {children}

      {ativo && <View style={estilos.areaGesto} {...gesto.panHandlers} />}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101312",
  },
  areaGesto: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 36,
    zIndex: 999,
    backgroundColor: "transparent",
  },
});
