import React, { ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  Platform,
  StyleSheet,
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
  const ativoRef = useRef(ativo);
  const fechandoRef = useRef(false);
  const deslocamento = useRef(new Animated.Value(0)).current;

  voltarRef.current = onVoltar;
  ativoRef.current = ativo;

  const animarParaOrigem = () => {
    fechandoRef.current = false;
    Animated.spring(deslocamento, {
      toValue: 0,
      useNativeDriver: Platform.OS !== "web",
      tension: 180,
      friction: 24,
    }).start();
  };

  const iniciarVolta = () => {
    if (fechandoRef.current || !ativoRef.current) {
      return;
    }

    fechandoRef.current = true;
    const largura = Dimensions.get("window").width;

    Animated.timing(deslocamento, {
      toValue: largura,
      duration: 160,
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      if (!finished) {
        fechandoRef.current = false;
        return;
      }

      voltarRef.current();
    });
  };

  const gestoDeVoltar = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, movimento) =>
        ativoRef.current &&
        movimento.x0 <= 28 &&
        movimento.dx > 6 &&
        Math.abs(movimento.dx) > Math.abs(movimento.dy) * 1.2,
      onMoveShouldSetPanResponder: (_, movimento) =>
        ativoRef.current &&
        movimento.x0 <= 28 &&
        movimento.dx > 6 &&
        Math.abs(movimento.dx) > Math.abs(movimento.dy) * 1.2,
      onPanResponderGrant: () => {
        fechandoRef.current = false;
        deslocamento.stopAnimation();
      },
      onPanResponderMove: (_, movimento) => {
        if (movimento.dx > 0 && !fechandoRef.current) {
          deslocamento.setValue(movimento.dx);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, movimento) => {
        const largura = Dimensions.get("window").width;
        const concluiu =
          ativoRef.current &&
          (movimento.dx >= largura * 0.25 || movimento.vx >= 0.55);

        if (concluiu) {
          iniciarVolta();
          return;
        }

        animarParaOrigem();
      },
      onPanResponderTerminate: animarParaOrigem,
    }),
  ).current;

  useEffect(() => {
    if (Platform.OS === "ios" || Platform.OS === "web" || !ativo) {
      return;
    }

    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      voltarRef.current();
      return true;
    });

    return () => assinatura.remove();
  }, [ativo]);

  return (
    <Animated.View
      {...(Platform.OS === "web" ? gestoDeVoltar.panHandlers : {})}
      style={[
        estilos.container,
        {
          transform: [{ translateX: deslocamento }],
          shadowOpacity: Platform.OS === "web" ? 0.18 : 0,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
    shadowColor: "#000000",
    shadowOffset: { width: -3, height: 0 },
    shadowRadius: 12,
  },
});
