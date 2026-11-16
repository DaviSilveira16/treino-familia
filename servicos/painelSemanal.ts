export type DiaProgramado = { day_of_week: number; plan_id: string | null; is_rest_day: boolean };
export type PlanoPainel = { id: string; name: string };

export function proximoTreino(programacao: DiaProgramado[], planos: PlanoPainel[], hoje = new Date()) {
  const porDia = new Map(programacao.map((item) => [item.day_of_week, item]));
  const porPlano = new Map(planos.map((item) => [item.id, item.name]));
  for (let dias = 0; dias < 7; dias++) {
    const data = new Date(hoje);
    data.setDate(data.getDate() + dias);
    const item = porDia.get(data.getDay());
    const nome = item?.plan_id ? porPlano.get(item.plan_id) : undefined;
    if (!item?.is_rest_day && item?.plan_id && nome)
      return { planId: item.plan_id, planName: nome, data, dias };
  }
  return null;
}

export function chaveDiaPainel(data: Date) {
  return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")].join("-");
}
