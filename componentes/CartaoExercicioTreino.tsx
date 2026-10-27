import React, { memo, useRef, useState } from "react";
import RepetirCarga from "./RepetirCarga";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { PlanoExercicio, SerieRascunho } from "../servicos/treinoLocal";
import type { UltimoExercicio } from "../servicos/ultimasSeriesTreino";

type Props = {
  exercicio: PlanoExercicio;
  series: SerieRascunho[];
  anterior?: UltimoExercicio;
  cor: string;
  proximaChave?: string;
  envioEmCurso?: boolean;
  bloqueado: boolean;
  chaveSalvando: string | null;
  onCampo: (chave: string, campo: "reps" | "weight_kg", valor: string) => void;
  onRepetirCarga: (
    exercicioId: string,
    carga: string,
    cargasAnteriores?: Record<string, string>,
  ) => void;
  onAlternar: (serie: SerieRascunho) => void;
  onCopiar: (id: string) => void;
  onEditar?: (id: string) => void;
  onRetirar?: (id: string) => void;
  onAdicionarSerie?: (id: string) => void;
  onRetirarSerie?: (serie: SerieRascunho) => void;
};

const ControleSerie = memo(function ControleSerie({
  serie,
  cor,
  proxima,
  bloqueado,
  salvando,
  onCampo,
  onAlternar,
}: {
  serie: SerieRascunho;
  cor: string;
  proxima: boolean;
  bloqueado: boolean;
  salvando: boolean;
  onCampo: Props["onCampo"];
  onAlternar: Props["onAlternar"];
}) {
  const desabilitado = bloqueado || salvando;
  const rotulo = `${serie.exercise_name}, série ${serie.set_number}`;
  const ajustar = (campo: "reps" | "weight_kg", delta: number) => {
    const atual = Number(serie[campo].replace(",", "."));
    const valor = Math.max(
      campo === "reps" ? 1 : 0,
      Math.min(
        campo === "reps" ? 1000 : 2000,
        Math.round(((Number.isFinite(atual) ? atual : 0) + delta) * 10) / 10,
      ),
    );
    onCampo(serie.chave, campo, String(valor));
  };
  return (
    <View
      style={[
        estilos.serie,
        (serie.concluida || proxima) && { borderColor: cor },
      ]}
    >
      <Text style={estilos.rotulo}>Série {serie.set_number}</Text>
      <View style={estilos.campos}>
        {(["reps", "weight_kg"] as const).map((campo) => (
          <View key={campo} style={estilos.campo}>
            <Text style={estilos.ajuda}>
              {campo === "reps" ? "Repetições realizadas" : "Carga (kg)"}
            </Text>
            <TextInput
              accessibilityLabel={`${rotulo}, ${campo === "reps" ? "repetições realizadas" : "carga em quilos"}`}
              style={estilos.input}
              value={serie[campo]}
              onChangeText={(valor) => onCampo(serie.chave, campo, valor)}
              keyboardType={campo === "reps" ? "number-pad" : "decimal-pad"}
              editable={!serie.concluida && !desabilitado}
            />
            <View style={estilos.campos}>
              {[-1, 1].map((sinal) => (
                <TouchableOpacity
                  key={sinal}
                  accessibilityRole="button"
                  accessibilityLabel={`${sinal < 0 ? "Diminuir" : "Aumentar"} ${campo === "reps" ? "repetições" : "carga em 2,5 kg"}, ${rotulo}`}
                  disabled={serie.concluida || desabilitado}
                  style={estilos.ajuste}
                  onPress={() =>
                    ajustar(campo, sinal * (campo === "reps" ? 1 : 2.5))
                  }
                >
                  <Text style={estilos.texto}>
                    {sinal < 0 ? "−" : "+"}
                    {campo === "reps" ? "1" : "2,5"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${serie.concluida ? "Desmarcar" : "Concluir"} ${rotulo}`}
        accessibilityState={{
          disabled: desabilitado,
          selected: serie.concluida,
        }}
        disabled={desabilitado}
        onPress={() => onAlternar(serie)}
        style={[
          estilos.concluir,
          { backgroundColor: serie.concluida ? "#26342B" : cor },
        ]}
      >
        {salvando ? (
          <ActivityIndicator color={cor} />
        ) : (
          <Text
            style={[
              estilos.texto,
              { color: serie.concluida ? cor : "#101312", textAlign: "center" },
            ]}
          >
            {serie.pendente
              ? serie.pendente === "salvar"
                ? "✓ Concluída · aguardando envio"
                : "↻ Desmarcada · aguardando envio"
              : serie.concluida
                ? "✓ Série concluída · desfazer"
                : "Marcar série concluída"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
});

export const CartaoExercicioTreino = memo(function CartaoExercicioTreino({
  exercicio,
  series,
  anterior,
  cor,
  proximaChave,
  bloqueado,
  envioEmCurso,
  chaveSalvando,
  onCampo,
  onRepetirCarga,
  onAlternar,
  onCopiar,
  onEditar,
  onRetirar,
  onAdicionarSerie,
  onRetirarSerie,
}: Props) {
  const [recolhido, setRecolhido] = useState(false);
  const [repetir, setRepetir] = useState(false);
  const cargasAntesDeRepetir = useRef<Record<string, string>>({});
  const mudarCampo: Props["onCampo"] = (chave, campo, valor) => {
    if (campo === "weight_kg" && repetir) onRepetirCarga(exercicio.id, valor);
    else onCampo(chave, campo, valor);
  };
  return (
    <View style={estilos.cartao}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${recolhido ? "Expandir" : "Recolher"} ${exercicio.name}`}
        accessibilityState={{ expanded: !recolhido }}
        onPress={() => setRecolhido((valor) => !valor)}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={[estilos.titulo, { flex: 1 }]}>{exercicio.name}</Text>
        <Text style={{ color: cor, fontSize: 24 }}>
          {recolhido ? "⌄" : "⌃"}
        </Text>
      </TouchableOpacity>
      <Text style={estilos.ajuda}>
        {series.filter((serie) => serie.concluida).length}/{series.length}{" "}
        séries concluídas
      </Text>
      {!recolhido ? (
        <>
          {exercicio.avulso ? (
            <Text style={[estilos.ajuda, { color: cor }]}>
              Adaptado nesta sessão
            </Text>
          ) : null}
          {onEditar || onRetirar ? (
            <View style={estilos.campos}>
              {onEditar ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${exercicio.name}`}
                  disabled={bloqueado}
                  onPress={() => onEditar(exercicio.id)}
                  style={estilos.copiar}
                >
                  <Text style={{ color: cor }}>Editar exercício</Text>
                </TouchableOpacity>
              ) : null}
              {onRetirar ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Retirar ${exercicio.name} desta sessão`}
                  disabled={bloqueado}
                  onPress={() => onRetirar(exercicio.id)}
                  style={estilos.copiar}
                >
                  <Text style={{ color: "#FCA5A5" }}>Retirar da sessão</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          <Text style={estilos.ajuda}>
            {series.filter((serie) => serie.concluida).length}/{series.length}{" "}
            séries concluídas · {exercicio.reps_goal} repetições previstas
          </Text>
          {anterior ? (
            <View style={estilos.referencia}>
              <Text style={estilos.texto}>
                Última sessão ·{" "}
                {new Date(anterior.data).toLocaleDateString("pt-BR")}
              </Text>
              <Text style={estilos.ajuda}>
                {[...anterior.series]
                  .sort((a, b) => a.set_number - b.set_number)
                  .map(
                    (serie) =>
                      `${serie.set_number}ª: ${serie.reps} × ${Number(serie.weight_kg).toLocaleString("pt-BR")} kg`,
                  )
                  .join("  ·  ")}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Usar última sessão de ${exercicio.name} nas séries não concluídas`}
                disabled={
                  bloqueado ||
                  !series.some((serie) => !serie.concluida && !serie.pendente)
                }
                style={estilos.copiar}
                onPress={() => onCopiar(exercicio.id)}
              >
                <Text style={{ color: cor, fontWeight: "800" }}>
                  Usar nas séries não concluídas
                </Text>
              </TouchableOpacity>
              <Text style={estilos.ajuda}>
                A cópia substitui apenas os campos das séries abertas deste
                rascunho. Suas cargas de referência permanecem salvas.
              </Text>
            </View>
          ) : null}
          <RepetirCarga
            marcado={repetir}
            cor={cor}
            bloqueado={bloqueado}
            rotulo={`Repetir carga nas séries abertas de ${exercicio.name}`}
            onAlterar={(valor) => {
              if (valor) {
                const abertas = series.filter(
                  (s) => !s.concluida && !s.excluida && !s.pendente,
                );
                cargasAntesDeRepetir.current = Object.fromEntries(
                  abertas.map((s) => [s.chave, s.weight_kg]),
                );
                onRepetirCarga(exercicio.id, abertas[0]?.weight_kg ?? "");
              } else
                onRepetirCarga(exercicio.id, "", cargasAntesDeRepetir.current);
              setRepetir(valor);
            }}
          />
          {series.map((serie) => (
            <View key={serie.chave}>
              <ControleSerie
                serie={serie}
                cor={cor}
                proxima={proximaChave === serie.chave}
                bloqueado={
                  bloqueado || Boolean(envioEmCurso) || chaveSalvando !== null
                }
                salvando={chaveSalvando === serie.chave}
                onCampo={mudarCampo}
                onAlternar={onAlternar}
              />
              {onRetirarSerie ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Retirar série ${serie.set_number} de ${exercicio.name}`}
                  disabled={bloqueado || series.length <= 1}
                  style={estilos.copiar}
                  onPress={() => onRetirarSerie(serie)}
                >
                  <Text style={estilos.ajuda}>Retirar esta série</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {onAdicionarSerie ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Adicionar série em ${exercicio.name}`}
              disabled={bloqueado || series.length >= 20}
              style={estilos.copiar}
              onPress={() => onAdicionarSerie(exercicio.id)}
            >
              <Text style={{ color: cor, fontWeight: "800" }}>
                + Adicionar série
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </View>
  );
});
const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: "#151A17",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  serie: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  titulo: { color: "#F0F4F1", fontWeight: "800", fontSize: 17 },
  rotulo: { color: "#A4ADA7", fontWeight: "800", fontSize: 12 },
  ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 19 },
  texto: { color: "#F0F4F1", fontWeight: "700" },
  campos: { flexDirection: "row", gap: 10 },
  campo: { flex: 1, minWidth: 0, gap: 6 },
  input: {
    color: "#F0F4F1",
    backgroundColor: "#101312",
    borderColor: "#38423B",
    borderWidth: 1,
    borderRadius: 9,
    padding: 10,
    minWidth: 0,
  },
  ajuste: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#45544A",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  concluir: {
    borderRadius: 9,
    padding: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  referencia: {
    backgroundColor: "#1C2720",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  copiar: { minHeight: 44, justifyContent: "center" },
});
