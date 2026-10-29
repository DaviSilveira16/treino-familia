export type PerfilMetabolico = {
  pesoKg: number;
  alturaCm: number;
  idade: number;
  sexo: "masculino" | "feminino";
};

/** Mifflin–St Jeor: estimativa de gasto em repouso, não uma medição individual.
 * Fonte original: https://pubmed.ncbi.nlm.nih.gov/2305711/
 */
export function metabolismoRepousoKcalDia(perfil: PerfilMetabolico): number {
  return Math.max(
    0,
    10 * perfil.pesoKg +
      6.25 * perfil.alturaCm -
      5 * perfil.idade +
      (perfil.sexo === "masculino" ? 5 : -161),
  );
}

export function calcularGastoRepouso(
  perfil: PerfilMetabolico | null,
): number | null {
  if (
    !perfil ||
    !Number.isFinite(perfil.pesoKg) ||
    perfil.pesoKg < 20 ||
    perfil.pesoKg > 400 ||
    !Number.isFinite(perfil.alturaCm) ||
    perfil.alturaCm < 100 ||
    perfil.alturaCm > 250 ||
    !Number.isInteger(perfil.idade) ||
    perfil.idade < 18 ||
    perfil.idade > 110 ||
    (perfil.sexo !== "masculino" && perfil.sexo !== "feminino")
  )
    return null;
  return Math.round(metabolismoRepousoKcalDia(perfil));
}
