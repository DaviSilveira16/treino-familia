type Celula = string | number | null | undefined;

export function montarCsv(cabecalho: string[], linhas: Celula[][]) {
  const escapar = (valor: Celula) => {
    if (valor == null) return "";
    if (typeof valor === "number")
      return Number.isFinite(valor) ? String(valor).replace(".", ",") : "";
    const seguro = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(valor) ? "'" + valor : valor;
    return '"' + seguro.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + [cabecalho, ...linhas].map((linha) => linha.map(escapar).join(";")).join("\r\n");
}

export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
