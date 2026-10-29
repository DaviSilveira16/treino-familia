export function dataIsoParaBrasileira(valor: string): string {
  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function mascararDataBrasileira(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

export function dataBrasileiraParaIso(valor: string): string | null {
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  const iso = `${ano}-${mes}-${dia}`;
  const data = new Date(`${iso}T12:00:00`);
  if (
    !Number.isFinite(data.getTime()) ||
    data.getFullYear() !== Number(ano) ||
    data.getMonth() + 1 !== Number(mes) ||
    data.getDate() !== Number(dia)
  )
    return null;
  return iso;
}
