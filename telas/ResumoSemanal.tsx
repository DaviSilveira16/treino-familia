import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabase";
import { obterRevisaoDeDados } from "../servicos/revisaoDados";
import {
  lerCache,
  lerCacheParaExibicao,
  salvarCache,
} from "../servicos/cacheConsultas";
import { medir, registrarTempo } from "../servicos/performance";

type Props = { corTema?: string };
type DadosSemana = {
  treinos: number;
  cardios: number;
  minutos: number;
  calorias: number;
  caloriasDisponiveis: number;
};

let rpcIndisponivel = false;
function registrarResumoTotal(inicio: number) {
  registrarTempo("resumo.total", inicio);
}
function inicioSemana(date: Date) {
  const inicio = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diferenca = (inicio.getDay() + 6) % 7;
  inicio.setDate(inicio.getDate() - diferenca);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
}
function formatarMinutos(minutos: number) {
  const seguros = Math.max(0, Math.round(minutos));
  const h = Math.floor(seguros / 60);
  const m = seguros % 60;
  return h ? `${h}h ${m} min` : `${m} min`;
}

export default function ResumoSemanal({ corTema = "#35D07F" }: Props) {
  const [dados, setDados] = useState<DadosSemana>({
    treinos: 0,
    cardios: 0,
    minutos: 0,
    calorias: 0,
    caloriasDisponiveis: 0,
  });
  const [carregando, setCarregando] = useState(true);
  const ultimaConsultaRef = useRef(0);
  const ultimaRevisaoRef = useRef(-1);
  const dadosCarregadosRef = useRef(false);
  const [erro, setErro] = useState("");

  const emFocoRef = useRef(false);
  const pedidoRef = useRef<AbortController | null>(null);
  const versaoPedidoRef = useRef(0);
  const carregar = useCallback(async (atualizacaoManual = false) => {
    pedidoRef.current?.abort();
    const controlador = new AbortController();
    pedidoRef.current = controlador;
    const versao = ++versaoPedidoRef.current;
    const valido = () =>
      !controlador.signal.aborted &&
      versao === versaoPedidoRef.current &&
      emFocoRef.current;
    if (!dadosCarregadosRef.current) setCarregando(true);
    if (valido()) setErro("");
    const inicioMedicao = Date.now();
    try {
      const { data: usuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (!valido()) return;
      if (erroUsuario || !usuario.user)
        throw new Error("Não foi possível carregar o resumo da semana.");
      const revisaoAntes = obterRevisaoDeDados();
      const inicio = inicioSemana(new Date());
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 7);
      const chave = `resumo-semanal:${inicio.toISOString()}`;
      const anterior = !atualizacaoManual
        ? lerCacheParaExibicao<DadosSemana>(usuario.user.id, chave)
        : undefined;
      if (anterior && valido()) {
        setDados(anterior);
        setCarregando(false);
        dadosCarregadosRef.current = true;
      }
      const cache = !atualizacaoManual
        ? lerCache<DadosSemana>(usuario.user.id, chave)
        : undefined;
      if (cache) {
        if (valido()) {
          setDados(cache);
          setCarregando(false);
          dadosCarregadosRef.current = true;
          ultimaConsultaRef.current = Date.now();
          ultimaRevisaoRef.current = obterRevisaoDeDados();
        }
        return;
      }

      // RPC agrega no PostgreSQL e respeita RLS (SECURITY INVOKER).
      // Se a migração opcional não existir, mantém o cálculo original.
      let novosDados: DadosSemana | null = null;
      if (!rpcIndisponivel) {
        const resultado = await medir("resumo.rpc", async () =>
          supabase
            .rpc("tf_resumo_semanal", {
              p_inicio: inicio.toISOString(),
              p_fim: fim.toISOString(),
            })
            .abortSignal(controlador.signal),
        );
        if (!valido()) return;
        if (!resultado.error && resultado.data) {
          const r = resultado.data as DadosSemana;
          if (
            [
              r.treinos,
              r.cardios,
              r.minutos,
              r.calorias,
              r.caloriasDisponiveis,
            ].every(
              (valor) => typeof valor === "number" && Number.isFinite(valor),
            )
          ) {
            novosDados = r;
          }
        } else if (
          resultado.error?.code === "PGRST202" ||
          resultado.error?.code === "42883"
        ) {
          rpcIndisponivel = true;
        } else if (resultado.error) {
          throw resultado.error;
        }
      }
      if (!novosDados) {
        const [resultadoTreinos, resultadoCardios] = await medir(
          "resumo.fallback",
          () =>
            Promise.all([
              supabase
                .from("workout_sessions")
                .select("status, duration_minutes, active_calories")
                .eq("user_id", usuario.user!.id)
                .gte("started_at", inicio.toISOString())
                .lt("started_at", fim.toISOString())
                .abortSignal(controlador.signal),
              supabase
                .from("cardio_sessions")
                .select("duration_minutes, active_calories")
                .eq("user_id", usuario.user!.id)
                .gte("started_at", inicio.toISOString())
                .lt("started_at", fim.toISOString())
                .abortSignal(controlador.signal),
            ]),
        );
        if (!valido()) return;
        if (resultadoTreinos.error) throw resultadoTreinos.error;
        if (resultadoCardios.error) throw resultadoCardios.error;
        const treinos = (resultadoTreinos.data ?? []).filter(
          (item) => item.status !== "em_andamento",
        );
        const cardios = resultadoCardios.data ?? [];
        const todas = [...treinos, ...cardios];
        novosDados = {
          treinos: treinos.length,
          cardios: cardios.length,
          minutos: todas.reduce(
            (soma, item) => soma + (Number(item.duration_minutes) || 0),
            0,
          ),
          calorias: Math.round(
            todas.reduce(
              (soma, item) => soma + (Number(item.active_calories) || 0),
              0,
            ),
          ),
          caloriasDisponiveis: todas.filter(
            (item) => item.active_calories != null,
          ).length,
        };
      }
      if (!valido()) return;
      // Uma gravação confirmada durante a requisição invalida o resultado.
      if (revisaoAntes !== obterRevisaoDeDados()) return;
      const revisaoNoFim = obterRevisaoDeDados();
      salvarCache(usuario.user.id, chave, novosDados, 20000);
      setDados(novosDados);
      dadosCarregadosRef.current = true;
      ultimaConsultaRef.current = Date.now();
      ultimaRevisaoRef.current = revisaoNoFim;
    } catch (e) {
      if (!valido()) return;
      // Em falha de rede, preservar os últimos números em vez de apagar a tela.
      if (!dadosCarregadosRef.current)
        setErro(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar o resumo semanal.",
        );
    } finally {
      if (valido()) setCarregando(false);
      if (valido()) {
        // O tempo completo inclui autenticação e tempo de agregação.
        registrarResumoTotal(inicioMedicao);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      emFocoRef.current = true;
      if (
        Date.now() - ultimaConsultaRef.current >= 12000 ||
        ultimaRevisaoRef.current !== obterRevisaoDeDados()
      ) {
        void carregar();
      }
      return () => {
        emFocoRef.current = false;
        pedidoRef.current?.abort();
        versaoPedidoRef.current++;
      };
    }, [carregar]),
  );

  return (
    <View style={estilos.container}>
      <View style={estilos.topo}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={estilos.titulo}>Seu resumo semanal</Text>
          <Text style={estilos.subtitulo}>
            Segunda a domingo · semana atual
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            void carregar(true);
          }}
          style={estilos.atualizar}
        >
          <Text style={[estilos.textoAtualizar, { color: corTema }]}>↻</Text>
        </TouchableOpacity>
      </View>
      {carregando ? (
        <ActivityIndicator color={corTema} />
      ) : erro ? (
        <Text style={estilos.erro}>{erro}</Text>
      ) : (
        <>
          <View style={estilos.grade}>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🏋️</Text>
              <Text style={estilos.numero}>{dados.treinos}</Text>
              <Text style={estilos.rotulo}>Treinos</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🏃</Text>
              <Text style={estilos.numero}>{dados.cardios}</Text>
              <Text style={estilos.rotulo}>Cardios</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>⏱️</Text>
              <Text style={estilos.numero}>
                {formatarMinutos(dados.minutos)}
              </Text>
              <Text style={estilos.rotulo}>Tempo registrado</Text>
            </View>
            <View style={estilos.indicador}>
              <Text style={estilos.emoji}>🔥</Text>
              <Text style={estilos.numero}>
                {dados.calorias.toLocaleString("pt-BR")}
              </Text>
              <Text style={estilos.rotulo}>Kcal estimadas</Text>
            </View>
          </View>
          {dados.caloriasDisponiveis === 0 ? (
            <Text style={estilos.nota}>
              As calorias aparecerão após registrar sessões com estimativa
              calculada. Registros antigos não são recalculados.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    backgroundColor: "#151A17",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    gap: 13,
    marginBottom: 18,
  },
  topo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titulo: { color: "#F0F4F1", fontSize: 17, fontWeight: "800" },
  subtitulo: { color: "#98A39B", fontSize: 12 },
  atualizar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  textoAtualizar: { fontSize: 22, fontWeight: "800" },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  indicador: {
    flexGrow: 1,
    flexBasis: "44%",
    backgroundColor: "#1D241F",
    borderRadius: 11,
    padding: 11,
    gap: 4,
    minWidth: 105,
  },
  emoji: { fontSize: 18 },
  numero: { color: "#F0F4F1", fontSize: 20, fontWeight: "900" },
  rotulo: { color: "#9BA69E", fontSize: 11 },
  erro: { color: "#F28B82", fontSize: 12 },
  nota: { color: "#8F9A92", fontSize: 11, lineHeight: 16 },
});
