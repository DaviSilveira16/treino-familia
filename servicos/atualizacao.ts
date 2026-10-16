
import { Alert, Linking, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";

export const VERSAO_INSTALADA = "1.0.0";

export const URL_VERSOES =
  "https://SEU-DOMINIO.com/treino-familia/versoes.json";

type VersaoPublicada = {
  versao: string;
  androidUrl: string;
  iosUrl: string;
  mensagem?: string;
};

function compararVersoes(atual: string, publicada: string): boolean {
  const partesAtuais = atual.split(".").map(Number);
  const partesPublicadas = publicada.split(".").map(Number);
  const tamanho = Math.max(partesAtuais.length, partesPublicadas.length);

  for (let indice = 0; indice < tamanho; indice++) {
    const numeroAtual = partesAtuais[indice] ?? 0;
    const numeroPublicado = partesPublicadas[indice] ?? 0;

    if (
      !Number.isInteger(numeroAtual) ||
      !Number.isInteger(numeroPublicado) ||
      numeroAtual < 0 ||
      numeroPublicado < 0
    ) {
      return false;
    }

    if (numeroPublicado > numeroAtual) {
      return true;
    }

    if (numeroPublicado < numeroAtual) {
      return false;
    }
  }

  return false;
}

export async function verificarAtualizacao() {
  const conexao = await NetInfo.fetch();

  if (
    conexao.type !== "wifi" ||
    conexao.isConnected !== true ||
    conexao.isInternetReachable === false
  ) {
    return null;
  }

  const resposta = await fetch(URL_VERSOES, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!resposta.ok) {
    throw new Error("Não foi possível consultar as versões.");
  }

  const dados: VersaoPublicada = await resposta.json();

  if (
    typeof dados.versao !== "string" ||
    typeof dados.androidUrl !== "string" ||
    typeof dados.iosUrl !== "string"
  ) {
    throw new Error("O arquivo de versões está inválido.");
  }

  if (!compararVersoes(VERSAO_INSTALADA, dados.versao)) {
    return null;
  }

  const url =
    Platform.OS === "ios" ? dados.iosUrl : dados.androidUrl;

  if (!url.startsWith("https://")) {
    throw new Error("O endereço da atualização não é seguro.");
  }

  return {
    versao: dados.versao,
    url,
    mensagem:
      dados.mensagem ||
      "Uma nova versão do Treino Família está disponível.",
  };
}

export function avisarAtualizacao(
  versao: string,
  url: string,
  mensagem: string,
) {
  Alert.alert(
    "Atualização disponível",
    `${mensagem}\n\nNova versão: ${versao}`,
    [
      {
        text: "Agora não",
        style: "cancel",
      },
      {
        text: "Atualizar",
        onPress: () => {
          Linking.openURL(url).catch(() => {
            Alert.alert(
              "Erro",
              "Não foi possível abrir o endereço da atualização.",
            );
          });
        },
      },
    ],
    {
      cancelable: true,
    },
  );
}
