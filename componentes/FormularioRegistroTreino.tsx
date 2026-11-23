import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";
import { CartaoExercicioTreino } from "./CartaoExercicioTreino";
import ResumoRegistroTreino from "./ResumoRegistroTreino";
import {
  guardarRegistroManual,
  montarRegistroManual,
} from "../servicos/registroTreinoManual";
import RepetirCarga from "./RepetirCarga";
import { proximoExercicioAberto } from "../servicos/avancoExercicio";
import {
  repetirCargaNasSeries,
  acrescentarSerie,
} from "../servicos/treinoAdaptavel";
import type {
  PerfilCalculoTreino,
  IntensidadeTreino,
} from "../servicos/caloriasTreino";
import type {
  EsforcoPercebido,
  PlanoExercicio,
  SerieRascunho,
} from "../servicos/treinoLocal";

export default function FormularioRegistroTreino({
  usuarioId,
  planId,
  planName,
  dia,
  perfil,
  cor,
  onSalvo,
  onRolarPara,
}: {
  usuarioId: string;
  planId: string;
  planName: string;
  dia: string;
  perfil: PerfilCalculoTreino | null;
  cor: string;
  onSalvo: (pendente: boolean, mensagem?: string) => Promise<void>;
  onRolarPara?: (y: number) => void;
}) {
  const [exercicios, setExercicios] = useState<PlanoExercicio[]>([]),
    [series, setSeries] = useState<SerieRascunho[]>([]);
  const [carregando, setCarregando] = useState(true),
    [salvando, setSalvando] = useState(false),
    [erro, setErro] = useState("");
  const [duracao, setDuracao] = useState(""),
    [intensidade, setIntensidade] = useState<IntensidadeTreino | null>(null),
    [esforco, setEsforco] = useState<EsforcoPercebido>("nao_informado");
  const envio = useRef(false);
  const [aceitarZero, setAceitarZero] = useState(false);
  const seriesRef = useRef(series);
  const formularioRef = useRef<React.ComponentRef<typeof View>>(null);
  const cartoesRef = useRef(new Map<string, React.ComponentRef<typeof View>>());
  const formularioYRef = useRef(0);
  const revisaoLayoutRef = useRef(0);
  const revisoesRef = useRef(new Map<string, number>());
  const avancoRef = useRef<{ destino: string; origem?: string; revisaoMinima: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const rolarRef = useRef(onRolarPara);
  useEffect(() => { rolarRef.current = onRolarPara; }, [onRolarPara]);

  function tentarAvancar() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pedido = avancoRef.current;
      const destino = pedido && cartoesRef.current.get(pedido.destino);
      const formulario = formularioRef.current;
      if (!pedido || !destino || !formulario || (pedido.origem &&
        (revisoesRef.current.get(pedido.origem) ?? 0) <= pedido.revisaoMinima)) return;
      // No navegador, mover o próximo cartão não dispara necessariamente onLayout.
      // Medimos o destino depois que o cartão concluído mudou de tamanho.
      destino.measureLayout(formulario, (_x, y) => {
        if (avancoRef.current !== pedido || !Number.isFinite(y)) return;
        avancoRef.current = null;
        rolarRef.current?.(formularioYRef.current + y);
      });
    });
  }

  function registrarLayout(id: string) {
    revisoesRef.current.set(id, ++revisaoLayoutRef.current);
    if (avancoRef.current) tentarAvancar();
  }

  function guardarCartao(id: string, cartao: React.ComponentRef<typeof View> | null) {
    if (cartao) cartoesRef.current.set(id, cartao);
    else cartoesRef.current.delete(id);
  }

  function alterarSeries(
    novas: SerieRascunho[],
    exercicioConcluido?: string,
    todas = false,
  ) {
    const anteriores = seriesRef.current;
    seriesRef.current = novas;
    avancoRef.current = null;
    const seriesDoExercicio = novas.filter(
      s => s.exercise_id === exercicioConcluido && !s.excluida,
    );
    const acabouDeConcluir = exercicioConcluido &&
      anteriores.some(s => s.exercise_id === exercicioConcluido && !s.excluida && !s.concluida) &&
      seriesDoExercicio.length > 0 && seriesDoExercicio.every(s => s.concluida);
    if (onRolarPara && (todas || acabouDeConcluir)) {
      avancoRef.current = {
        destino: todas ? "resumo" : proximoExercicioAberto(exercicioConcluido!, exercicios, novas) ?? "resumo",
        origem: todas ? undefined : exercicioConcluido,
        // Uma conclusão aguarda as posições medidas depois do recolhimento.
        revisaoMinima: revisaoLayoutRef.current,
      };
      tentarAvancar();
    }
    setSeries(novas);
  }

  useEffect(() => () => {
    avancoRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro("");
      try {
        const { data: lista, error } = await supabase
          .from("exercises")
          .select("id, name, sets_goal, reps_goal")
          .eq("user_id", usuarioId)
          .eq("plan_id", planId)
          .order("position", { ascending: true })
          .abortSignal(controller.signal);
        if (error) throw error;
        const base = (lista ?? []) as PlanoExercicio[];
        if (!base.length)
          throw new Error(
            "Este plano ainda não tem exercícios. Cadastre os exercícios em Meus treinos.",
          );
        const { data: referencias, error: erroCargas } = await supabase
          .from("exercise_load_defaults")
          .select("exercise_id, set_number, reps, weight_kg")
          .eq("user_id", usuarioId)
          .in(
            "exercise_id",
            base.map((e) => e.id),
          )
          .abortSignal(controller.signal);
        if (erroCargas) throw erroCargas;
        const abertas: SerieRascunho[] = base.flatMap((e) =>
          Array.from(
            {
              length: Math.min(
                20,
                Math.max(
                  1,
                  Number(e.sets_goal) || 1,
                  referencias?.filter((r) => r.exercise_id === e.id).length ??
                    0,
                ),
              ),
            },
            (_, i) => {
              const r = referencias?.find(
                (r) => r.exercise_id === e.id && Number(r.set_number) === i + 1,
              );
              return {
                chave: `${e.id}:${i + 1}`,
                exercise_id: e.id,
                exercise_name: e.name,
                set_number: i + 1,
                reps: String(r?.reps ?? (e.reps_goal.match(/\d+/)?.[0] || "8")),
                weight_kg: r ? String(r.weight_kg) : "",
                concluida: false,
              };
            },
          ),
        );
        if (ativo) {
          setExercicios(base);
          seriesRef.current = abertas;
          setSeries(abertas);
        }
      } catch (e) {
        if (ativo && !controller.signal.aborted)
          setErro(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar o plano.",
          );
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
      controller.abort();
    };
  }, [usuarioId, planId]);
  const salvar = async () => {
    if (envio.current) return;
    envio.current = true;
    setSalvando(true);
    setErro("");
    try {
      if (
        series.some(
          (s) => s.concluida && Number(s.weight_kg.replace(",", ".")) === 0,
        ) &&
        !aceitarZero
      )
        throw new Error(
          "Há séries com carga zero. Edite as cargas ou confirme que deseja concluir mesmo assim.",
        );
      if (!intensidade) throw new Error("Informe a intensidade do treino.");
      const rascunho = montarRegistroManual({
        usuarioId,
        planId,
        planName,
        dia,
        perfil,
        exercicios,
        series: series.map((s) => ({
          ...s,
          weight_kg: s.weight_kg.trim() || "0",
        })),
        duracao: Number(duracao.replace(",", ".")),
        intensidade,
        esforco,
      });
      const resultado = await guardarRegistroManual(rascunho);
      await onSalvo(!resultado.concluido, resultado.erro);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível guardar o registro.",
      );
    } finally {
      envio.current = false;
      setSalvando(false);
    }
  };
  if (carregando)
    return (
      <ActivityIndicator
        color={cor}
        accessibilityLabel="Carregando exercícios do registro"
      />
    );
  return (
    <View
      ref={formularioRef}
      collapsable={false}
      style={s.grupo}
      onLayout={evento => { formularioYRef.current = evento.nativeEvent.layout.y; }}
    >
      <Text style={s.ajuda}>
        Confira o que realmente realizou. As cargas do plano são sugestões
        editáveis e só entram no histórico depois de você marcar as séries. Este
        registro não altera as referências do plano.
      </Text>
      {series.length ? (
        <>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Marcar todas as séries deste registro"
            disabled={salvando}
            onPress={() =>
              alterarSeries(seriesRef.current.map(s => ({ ...s, concluida: true })), undefined, true)
            }
            style={s.botao}
          >
            <Text style={{ color: cor }}>
              Marcar todas as séries do plano como realizadas
            </Text>
          </TouchableOpacity>
          {exercicios.map((e) => (
            <CartaoExercicioTreino
              key={e.id}
              exercicio={e}
              series={series.filter((s) => s.exercise_id === e.id)}
              referencia={cartao => guardarCartao(e.id, cartao)}
              onLayout={() => registrarLayout(e.id)}
              onConcluido={tentarAvancar}
              cor={cor}
              bloqueado={salvando}
              chaveSalvando={null}
              onCopiar={() => {}}
              onRepetirCarga={(id, carga, anteriores) =>
                alterarSeries(repetirCargaNasSeries(seriesRef.current, id, carga, anteriores))
              }
              onCampo={(chave, campo, valor) =>
                alterarSeries(
                  seriesRef.current.map((s) =>
                    s.chave === chave && !s.concluida
                      ? { ...s, [campo]: valor }
                      : s,
                  ),
                )
              }
              onAlternar={(serie) =>
                alterarSeries(
                  seriesRef.current.map((s) =>
                    s.chave === serie.chave
                      ? { ...s, concluida: !s.concluida }
                      : s,
                  ),
                  serie.exercise_id ?? undefined,
                )
              }
              onAdicionarSerie={() =>
                alterarSeries(
                  seriesRef.current.filter((s) => s.exercise_id === e.id).length < 20
                    ? [...seriesRef.current, acrescentarSerie(e, seriesRef.current)]
                    : seriesRef.current,
                )
              }
              onRetirarSerie={(serie) =>
                alterarSeries(
                  seriesRef.current.filter((s) => s.exercise_id === e.id).length > 1
                    ? seriesRef.current.filter((s) => s.chave !== serie.chave)
                    : seriesRef.current,
                  e.id,
                )
              }
            />
          ))}
          <View ref={cartao => guardarCartao("resumo", cartao)} collapsable={false}>
            <ResumoRegistroTreino
              perfil={perfil}
              series={series
                .filter((s) => s.concluida)
                .map((s) => ({
                  exercise_id: s.exercise_id,
                  exercise_name: s.exercise_name,
                  set_number: s.set_number,
                  reps: Number(s.reps),
                  weight_kg: Number(s.weight_kg.replace(",", ".")),
                }))}
              duracao={duracao}
              onDuracao={setDuracao}
              intensidade={intensidade}
              onIntensidade={setIntensidade}
              esforco={esforco}
              onEsforco={setEsforco}
              cor={cor}
              bloqueado={salvando}
            />
          </View>
          <Text style={s.ajuda}>
            O calendário usa meio-dia como referência da data escolhida e guarda
            a duração informada. O horário não representa uma medição por
            cronômetro.
          </Text>
          {series.some(
            (s) => s.concluida && Number(s.weight_kg.replace(",", ".")) === 0,
          ) ? (
            <RepetirCarga
              marcado={aceitarZero}
              onAlterar={setAceitarZero}
              cor={cor}
              bloqueado={salvando}
              rotulo="Concluir mesmo assim com carga zero"
            />
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Confirmar registro de musculação"
            disabled={salvando}
            onPress={() => void salvar()}
            style={[s.botao, { backgroundColor: cor }]}
          >
            <Text style={s.escuro}>
              {salvando ? "Guardando..." : "Confirmar treino realizado"}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
      {erro ? (
        <Text accessibilityRole="alert" style={s.erro}>
          {erro}
        </Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  grupo: { gap: 16, marginTop: 12 },
  ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 20 },
  erro: { color: "#FCA5A5" },
  botao: {
    minHeight: 44,
    padding: 12,
    borderRadius: 10,
    borderColor: "#45544A",
    borderWidth: 1,
    justifyContent: "center",
  },
  escuro: { color: "#101312", fontWeight: "800", textAlign: "center" },
});
