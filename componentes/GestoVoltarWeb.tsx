import React, { useMemo, useRef } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";

type Propriedades = {
  children: React.ReactNode;
  podeVoltar: boolean;
  onVoltar: () => void;
};

export default function GestoVoltarWeb({
  children,
  podeVoltar,
  onVoltar,
}: Propriedades) {
  const deslocamento = useRef(new Animated.Value(0)).current;
  const larguraRef = useRef(0);
  const gestoAtivo = useRef(false);
  const podeVoltarRef = useRef(podeVoltar);
  const voltarRef = useRef(onVoltar);
  const { width } = useWindowDimensions();

  larguraRef.current = width;
  podeVoltarRef.current = podeVoltar;
  voltarRef.current = onVoltar;

  const manipuladores = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evento) =>
          Platform.OS === "web" &&
          podeVoltarRef.current &&
          evento.nativeEvent.pageX <= 24,

        onMoveShouldSetPanResponder: (_, gesto) =>
          Platform.OS === "web" &&
          podeVoltarRef.current &&
          gesto.dx > 8 &&
          Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.25,

        onPanResponderGrant: () => {
          gestoAtivo.current = true;
          deslocamento.stopAnimation();
        },

        onPanResponderMove: (_, gesto) => {
          if (gesto.dx > 0) {
            deslocamento.setValue(Math.min(gesto.dx, larguraRef.current));
          }
        },

        onPanResponderRelease: (_, gesto) => {
          gestoAtivo.current = false;

          const largura = larguraRef.current;
          const concluir =
            podeVoltarRef.current &&
            (gesto.dx > largura * 0.3 || gesto.vx > 0.55);

          if (concluir) {
            Animated.timing(deslocamento, {
              toValue: largura,
              duration: 160,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) {
                deslocamento.setValue(0);
                voltarRef.current();
              }
            });
          } else {
            Animated.spring(deslocamento, {
              toValue: 0,
              speed: 22,
              bounciness: 3,
              useNativeDriver: true,
            }).start();
          }
        },

        onPanResponderTerminate: () => {
          gestoAtivo.current = false;

          Animated.spring(deslocamento, {
            toValue: 0,
            speed: 22,
            bounciness: 3,
            useNativeDriver: true,
          }).start();
        },

        onShouldBlockNativeResponder: () => false,
      }),
    [deslocamento],
  );

  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <Animated.View
        {...manipuladores.panHandlers}
        style={{
          flex: 1,
          backgroundColor: "#101312",
          transform: [{ translateX: deslocamento }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
