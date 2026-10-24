let revisao = 0;

export function registrarMudancaDeDados(): void {
  revisao += 1;
}

export function obterRevisaoDeDados(): number {
  return revisao;
}
