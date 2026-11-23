export const TABELAS_BACKUP = ["workout_plans", "exercises", "exercise_load_defaults", "workout_sessions", "workout_sets", "cardio_activities", "cardio_sessions", "physical_measurements", "weekly_workout_schedule", "nutrition_foods", "nutrition_goals", "nutrition_templates", "nutrition_days", "nutrition_preferences"] as const;
export type TabelaBackup = typeof TABELAS_BACKUP[number];
export type Backup = { formato: "treino-familia-backup"; versao: 1 | 2; tabelas: Partial<Record<TabelaBackup, Record<string, unknown>[]>> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIMITE_BACKUP = 10 * 1024 * 1024;
export function validarBackup(texto: string): Backup {
  if (new TextEncoder().encode(texto).length > LIMITE_BACKUP) throw new Error("O arquivo excede 10 MB.");
  const b = JSON.parse(texto) as Backup;
  if (!b || b.formato !== "treino-familia-backup" || ![1,2].includes(b.versao) || !b.tabelas || Array.isArray(b.tabelas)) throw new Error("Formato ou versão de backup não reconhecidos.");
  let quantidade = 0;
  for (const [tabela, linhas] of Object.entries(b.tabelas)) {
    if (!TABELAS_BACKUP.includes(tabela as TabelaBackup) || !Array.isArray(linhas)) throw new Error("O backup contém uma tabela não permitida.");
    const ids = new Set<string>();
    for (const linha of linhas) {
      if (!linha || typeof linha !== "object" || Array.isArray(linha) || typeof linha.id !== "string" || !uuid.test(linha.id) || ids.has(linha.id)) throw new Error(`Identificador inválido ou repetido em ${tabela}.`);
      ids.add(linha.id);
      for (const [campo, valor] of Object.entries(linha)) {
        if (["__proto__", "constructor", "prototype"].includes(campo)) throw new Error("Campo não permitido.");
        if (typeof valor === "number" && !Number.isFinite(valor)) throw new Error("Número inválido no arquivo.");
        if (typeof valor === "string" && valor.length > 20000) throw new Error("Texto muito extenso no arquivo.");
        if (["plan_id", "exercise_id", "session_id", "activity_id"].includes(campo) && valor !== null && (typeof valor !== "string" || !uuid.test(valor))) throw new Error("Referência inválida no arquivo.");
      }
      quantidade++;
    }
  }
  if (!quantidade || quantidade > 10000) throw new Error("O backup precisa conter entre 1 e 10.000 registros.");
  return { formato: b.formato, versao: b.versao, tabelas: b.tabelas };
}
