export function noAndroidWrapper(): boolean {
  return typeof navigator !== "undefined" && /TreinoFamiliaAndroid\/1\.[1-9]\d*/.test(navigator.userAgent);
}
export const ORIGEM_PRODUCAO = "https://treino-familia-zeta.vercel.app";
