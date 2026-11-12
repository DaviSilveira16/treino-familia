import React from "react";
import { Image, Modal, Platform, Text, TouchableOpacity, View } from "react-native";
import type { ExercicioComFoto } from "./useFotoExercicio";

export default function ModalFotoExercicio({ origemFotoAberta, fotoCarregandoId, corTema, escolherFonteFoto, onFechar, onExcluir }: {
  origemFotoAberta: ExercicioComFoto | null;
  fotoCarregandoId: string | null;
  corTema: string;
  escolherFonteFoto: (fonte: "biblioteca" | "camera") => void;
  onFechar: () => void;
  onExcluir?: () => void;
}) {
  return (
    <Modal
        transparent
        animationType="fade"
        visible={Boolean(origemFotoAberta)}
        onRequestClose={onFechar}
        statusBarTranslucent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#000D",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 480,
              alignSelf: "center",
              backgroundColor: "#191E1B",
              borderRadius: 18,
              padding: 16,
              gap: 14,
              borderWidth: 1,
              borderColor: "#303A33",
            }}
          >
            <Text
              style={{
                color: "#F0F3F1",
                fontSize: 20,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              Visualizar foto
            </Text>
            <Text
              style={{
                color: "#A4ADA7",
                fontSize: 14,
                textAlign: "center",
              }}
              numberOfLines={2}
            >
              {origemFotoAberta?.name ?? "Foto do exercício"}
            </Text>
            {origemFotoAberta?.photo_url ? (
              <Image
                accessibilityLabel={`Foto do exercício ${origemFotoAberta.name}`}
                source={{ uri: origemFotoAberta.photo_url }}
                resizeMode="contain"
                style={{
                  width: "100%",
                  height: 280,
                  maxHeight: "55%",
                  borderRadius: 12,
                  backgroundColor: "#0D110F",
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: 160,
                  borderRadius: 12,
                  backgroundColor: "#0D110F",
                  borderWidth: 1,
                  borderColor: "#303A33",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 18,
                }}
              >
                <Text
                  style={{
                    color: "#A4ADA7",
                    textAlign: "center",
                    lineHeight: 21,
                  }}
                >
                  Este exercício ainda não tem foto. Escolha uma imagem da
                  galeria para adicioná-la.
                </Text>
              </View>
            )}
            {Platform.OS !== "web" ? (
              <>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Escolher uma foto da galeria"
                  style={{
                    minHeight: 50,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: corTema,
                  }}
                  disabled={Boolean(fotoCarregandoId)}
                  onPress={() => escolherFonteFoto("biblioteca")}
                >
                  <Text style={{ color: "#101312", fontWeight: "800" }}>
                    Escolher foto da galeria
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => escolherFonteFoto("camera")}
                  disabled={Boolean(fotoCarregandoId)}
                  style={{
                    minHeight: 46,
                    justifyContent: "center",
                    padding: 11,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: corTema,
                  }}
                >
                  <Text
                    style={{
                      color: corTema,
                      fontWeight: "800",
                      textAlign: "center",
                    }}
                  >
                    Tirar foto com a câmera
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
            {origemFotoAberta?.photo_path && onExcluir ? (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={Boolean(fotoCarregandoId)}
                onPress={onExcluir}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: "#F29B9B", fontWeight: "800", textAlign: "center" }}>Excluir foto</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onFechar}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: "#A4ADA7", textAlign: "center" }}>
                Fechar visualização
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
  );
}
