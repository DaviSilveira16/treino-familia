import React from "react";
import { Text, View } from "react-native";
import type { ResumoDia } from "../../servicos/nutricaoCalculos";
import { BotaoNutricao, estilosNutricao as estilos, numeroKcal } from "./NutricaoBase";

type Props = {
  resumo: ResumoDia;
  atividadesConferidas?: boolean;
  onAbrirMetas: () => void;
};

export default function CartaoSaldo({
  resumo,
  atividadesConferidas = true,
  onAbrirMetas,
}: Props) {
  const saldo = resumo.situacao === "futuro"
    ? null
    : resumo.saldo ?? (resumo.gastoTotal !== null && resumo.itensConsumidos > 0
      ? resumo.consumido.kcal - resumo.gastoTotal
      : null);
  const titulo = !atividadesConferidas
    ? "Atividades aguardando conferência"
    : resumo.situacao === "futuro"
      ? "Planejamento futuro"
      : resumo.situacao === "insuficiente"
        ? "Dados insuficientes para fechar o saldo"
        : resumo.situacao === "parcial"
          ? "Balanço provisório · registros parciais"
          : resumo.situacao === "manutencao"
            ? "Próximo da manutenção"
            : resumo.situacao === "deficit"
              ? "Déficit estimado"
              : "Superávit estimado";
  const motivos: string[] = [];
  if (resumo.gastoBase === null && resumo.situacao !== "futuro")
    motivos.push("a base diária ainda não está configurada para este dia");
  if (resumo.desconhecidas > 0)
    motivos.push(`${resumo.desconhecidas} atividade(s) não têm estimativa de calorias`);
  if (!atividadesConferidas)
    motivos.push("não foi possível conferir as atividades no servidor");

  return (
    <View style={estilos.card} accessibilityLiveRegion="polite">
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={{ color: "#F0F3F1", fontSize: 26, fontWeight: "800" }}>
        {saldo === null
          ? "—"
          : `${saldo > 0 ? "+" : saldo < 0 ? "−" : ""}${numeroKcal(Math.abs(saldo))} kcal`}
      </Text>
      <Text style={estilos.texto}>Consumo confirmado: {numeroKcal(resumo.consumido.kcal)} kcal</Text>
      <Text style={estilos.texto}>
        Proteínas {numeroKcal(resumo.consumido.proteinas)} g · Carboidratos {numeroKcal(resumo.consumido.carboidratos)} g · Gorduras {numeroKcal(resumo.consumido.gorduras)} g
      </Text>
      <Text style={estilos.pequeno}>
        Total planejado nas refeições: {numeroKcal(resumo.planejado.kcal)} kcal. Só o que foi confirmado entra no consumo.
      </Text>
      <Text style={estilos.texto}>
        Base diária sem treinos: {resumo.gastoBase === null ? "não configurada para este dia" : `${numeroKcal(resumo.gastoBase)} kcal`}
      </Text>
      <Text style={estilos.texto}>Exercícios registrados: {numeroKcal(resumo.gastoExercicio)} kcal ativas</Text>
      <Text style={estilos.texto}>
        Gasto total estimado: {resumo.gastoTotal === null ? "ainda indisponível" : `${numeroKcal(resumo.gastoTotal)} kcal`}
      </Text>
      {resumo.gastoTotal === null && motivos.length > 0 ? (
        <>
          <Text style={[estilos.pequeno, { color: "#FFD090" }]} accessibilityRole="alert">
            Para concluir a estimativa: {motivos.join("; ")}.
          </Text>
          {resumo.gastoBase === null ? (
            <BotaoNutricao
              titulo="Configurar base diária em Minhas metas"
              cor="#35D07F"
              onPress={onAbrirMetas}
            />
          ) : null}
        </>
      ) : null}
      {resumo.pendentes > 0 ? (
        <Text style={estilos.pequeno}>
          {resumo.pendentes} atividade(s) aguardando confirmação do servidor.
        </Text>
      ) : null}
      {resumo.diferencaMeta !== null ? (
        <Text style={estilos.texto}>
          {numeroKcal(Math.abs(resumo.diferencaMeta))} kcal {resumo.diferencaMeta > 0 ? "acima" : "abaixo"} da meta alimentar. A meta alimentar é separada do saldo energético.
        </Text>
      ) : null}
    </View>
  );
}
