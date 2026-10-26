import AsyncStorage from "@react-native-async-storage/async-storage";

type Amostra = { sessaoId: string; milissegundos: number };
const chave = (usuarioId: string) =>
  `@treino-familia:tempo-finalizacao:v1:${usuarioId}`;

async function lerAmostras(usuarioId: string): Promise<Amostra[]> {
  try {
    const dados: unknown = JSON.parse(
      (await AsyncStorage.getItem(chave(usuarioId))) ?? "[]",
    );
    return Array.isArray(dados)
      ? dados
          .filter(
            (item): item is Amostra =>
              Boolean(item) &&
              typeof item.sessaoId === "string" &&
              Number.isFinite(item.milissegundos) &&
              item.milissegundos > 0 &&
              item.milissegundos <= 300000,
          )
          .slice(-5)
      : [];
  } catch {
    return [];
  }
}

/** Usa durações reais deste aparelho e desta conta, sem inventar um prazo. */
export async function estimarTempoFinalizacao(
  usuarioId: string,
): Promise<number | null> {
  const valores = (await lerAmostras(usuarioId))
    .map((item) => item.milissegundos)
    .sort((a, b) => a - b);
  return valores.length
    ? Math.max(1, Math.ceil(valores[Math.floor(valores.length / 2)] / 1000))
    : null;
}

export async function registrarTempoFinalizacao(
  usuarioId: string,
  sessaoId: string,
  milissegundos: number,
) {
  if (
    !Number.isFinite(milissegundos) ||
    milissegundos <= 0 ||
    milissegundos > 300000
  )
    return;
  const anteriores = await lerAmostras(usuarioId);
  if (anteriores.some((item) => item.sessaoId === sessaoId)) return;
  await AsyncStorage.setItem(
    chave(usuarioId),
    JSON.stringify([...anteriores, { sessaoId, milissegundos }].slice(-5)),
  );
}
