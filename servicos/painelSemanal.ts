export function chaveDiaPainel(data: Date) {
  return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")].join("-");
}
