import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

type Treino = {
  id: string;
  name: string;
};

type Sessao = {
  id: string;
  plan_id: string | null;
  started_at: string;
  notes: string | null;
};

type Props = {
  onVoltar: () => void;
};

const nomesMeses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];

function dataLocal(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function dataDaSessao(valor: string) {
  const data = new Date(valor);
  return dataLocal(data);
}

export default function Frequencia({ onVoltar }: Props) {
  const hoje = new Date();

  const [usuarioId, setUsuarioId] = useState("");
  const [mesAtual, setMesAtual] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1),
  );
  const [dataSelecionada, setDataSelecionada] = useState(dataLocal(hoje));
  const [treinos, setTreinos] = useState<Treino[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [treinoSelecionado, setTreinoSelecionado] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregarDados = useCallback(async () => {
    setCarregando(true);

    try {
      const { data: usuario, error: erroUsuario } =
        await supabase.auth.getUser();

      if (erroUsuario || !usuario.user) {
        Alert.alert("Sessão inválida", "Entre novamente na sua conta.");
        return;
      }

      setUsuarioId(usuario.user.id);

      const [resultadoTreinos, resultadoSessoes] = await Promise.all([
        supabase
          .from("workout_plans")
          .select("id, name")
          .eq("user_id", usuario.user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("workout_sessions")
          .select("id, plan_id, started_at, notes")
          .eq("user_id", usuario.user.id)
          .order("started_at", { ascending: false }),
      ]);

      if (resultadoTreinos.error) {
        Alert.alert("Erro", resultadoTreinos.error.message);
        return;
      }

      if (resultadoSessoes.error) {
        Alert.alert("Erro", resultadoSessoes.error.message);
        return;
      }

      setTreinos((resultadoTreinos.data ?? []) as Treino[]);
      setSessoes((resultadoSessoes.data ?? []) as Sessao[]);
    } catch {
      Alert.alert("Erro", "Não foi possível carregar o calendário.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const ano = mesAtual.getFullYear();
  const mes = mesAtual.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const quantidadeDias = new Date(ano, mes + 1, 0).getDate();

  const diasDoCalendario = [
    ...Array.from({ length: primeiroDia }, () => null),
    ...Array.from({ length: quantidadeDias }, (_, indice) => indice + 1),
  ];

  const sessoesDoDia = sessoes.filter(
    (sessao) => dataDaSessao(sessao.started_at) === dataSelecionada,
  );

  const diasTreinados = new Set(
    sessoes.map((sessao) => dataDaSessao(sessao.started_at)),
  );

  const sessoesDoMes = sessoes.filter((sessao) => {
    const data = new Date(sessao.started_at);
    return data.getFullYear() === ano && data.getMonth() === mes;
  });

  const frequenciaMensal = new Set(
    sessoesDoMes.map((sessao) => dataDaSessao(sessao.started_at)),
  ).size;

  function mudarMes(direcao: number) {
    setMesAtual(new Date(ano, mes + direcao, 1));
  }

  async function registrarTreino() {
    if (!usuarioId || !treinoSelecionado || !dataSelecionada) {
      Alert.alert("Atenção", "Selecione um treino para registrar.");
      return;
    }

    if (dataSelecionada > dataLocal(new Date())) {
      Alert.alert(
        "Data inválida",
        "Você não pode registrar um treino em uma data futura.",
      );
      return;
    }

    setSalvando(true);

    try {
      const dataRegistro = new Date(
        `${dataSelecionada}T12:00:00`,
      ).toISOString();

      const sessoesExistentes = sessoes
        .filter((sessao) => dataDaSessao(sessao.started_at) === dataSelecionada)
        .sort(
          (a, b) =>
            new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
        );

      const sessaoExistente = sessoesExistentes.find(
        (sessao) => sessao.plan_id === treinoSelecionado,
      );

      if (sessaoExistente) {
        Alert.alert(
          "Treino já registrado",
          "Esse treino já aparece no histórico dessa data.",
        );
        return;
      }

      if (sessoesExistentes.length > 0) {
        const { error } = await supabase
          .from("workout_sessions")
          .update({
            plan_id: treinoSelecionado,
            notes: "Treino registrado pelo calendário",
          })
          .eq("id", sessoesExistentes[0].id)
          .eq("user_id", usuarioId);

        if (error) {
          Alert.alert("Erro ao registrar", error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("workout_sessions").insert({
          user_id: usuarioId,
          plan_id: treinoSelecionado,
          started_at: dataRegistro,
          finished_at: dataRegistro,
          notes: "Treino registrado pelo calendário",
        });

        if (error) {
          Alert.alert("Erro ao registrar", error.message);
          return;
        }
      }

      await carregarDados();
      Alert.alert("Treino registrado", "O calendário foi atualizado.");
    } catch {
      Alert.alert("Erro", "Não foi possível registrar o treino.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <ActivityIndicator size="large" color="#35D07F" />
        <Text style={estilos.textoSecundario}>Carregando calendário...</Text>
      </View>
    );
  }

  return (
    <View style={estilos.container}>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={estilos.conteudo}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Frequência de treino</Text>
        <Text style={estilos.subtitulo}>
          Registre os treinos que você realmente realizou. Você escolhe o dia e
          o treino, sem precisar definir uma semana fixa.
        </Text>

        <View style={estilos.cartaoResumo}>
          <Text style={estilos.resumoNumero}>{frequenciaMensal}</Text>
          <Text style={estilos.resumoTexto}>
            {frequenciaMensal === 1
              ? "dia treinado neste mês"
              : "dias treinados neste mês"}
          </Text>
        </View>

        <View style={estilos.cartaoCalendario}>
          <View style={estilos.navegacaoMes}>
            <TouchableOpacity
              style={estilos.botaoMes}
              onPress={() => mudarMes(-1)}
            >
              <Text style={estilos.textoBotaoMes}>‹</Text>
            </TouchableOpacity>

            <Text style={estilos.tituloMes}>
              {nomesMeses[mes]} {ano}
            </Text>

            <TouchableOpacity
              style={estilos.botaoMes}
              onPress={() => mudarMes(1)}
              disabled={ano === hoje.getFullYear() && mes >= hoje.getMonth()}
            >
              <Text
                style={[
                  estilos.textoBotaoMes,
                  ano === hoje.getFullYear() &&
                    mes >= hoje.getMonth() &&
                    estilos.textoDesabilitado,
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>

          <View style={estilos.gradeCalendario}>
            {diasSemana.map((dia, indice) => (
              <View key={`${dia}-${indice}`} style={estilos.celula}>
                <Text style={estilos.nomeDiaSemana}>{dia}</Text>
              </View>
            ))}

            {diasDoCalendario.map((dia, indice) => {
              if (dia === null) {
                return <View key={`vazio-${indice}`} style={estilos.celula} />;
              }

              const data = dataLocal(new Date(ano, mes, dia));
              const treinado = diasTreinados.has(data);
              const selecionado = data === dataSelecionada;
              const eHoje = data === dataLocal(hoje);

              return (
                <View key={data} style={estilos.celula}>
                  <TouchableOpacity
                    style={[
                      estilos.diaCalendario,
                      treinado && estilos.diaTreinado,
                      selecionado && estilos.diaSelecionado,
                      eHoje && estilos.diaHoje,
                    ]}
                    onPress={() => {
                      setDataSelecionada(data);
                      setTreinoSelecionado("");
                    }}
                  >
                    <Text
                      style={[
                        estilos.numeroDia,
                        treinado && estilos.numeroTreinado,
                        selecionado && estilos.numeroSelecionado,
                      ]}
                    >
                      {dia}
                    </Text>
                    {treinado && <View style={estilos.indicadorTreino} />}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={estilos.legenda}>
            <View style={estilos.indicadorTreino} />
            <Text style={estilos.textoLegenda}>Dia com treino registrado</Text>
          </View>
        </View>

        <View style={estilos.cartaoRegistro}>
          <Text style={estilos.tituloRegistro}>Registrar treino</Text>
          <Text style={estilos.dataRegistro}>
            {new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString(
              "pt-BR",
              {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              },
            )}
          </Text>

          {treinos.length === 0 ? (
            <Text style={estilos.textoSecundario}>
              Você ainda não cadastrou treinos. Acesse Meus treinos para criar o
              primeiro.
            </Text>
          ) : (
            <>
              <Text style={estilos.rotulo}>Qual treino você realizou?</Text>

              {treinos.map((treino) => {
                const selecionado = treinoSelecionado === treino.id;

                return (
                  <TouchableOpacity
                    key={treino.id}
                    style={[
                      estilos.opcaoTreino,
                      selecionado && estilos.opcaoTreinoSelecionada,
                    ]}
                    onPress={() => setTreinoSelecionado(treino.id)}
                  >
                    <Text
                      style={[
                        estilos.textoOpcao,
                        selecionado && estilos.textoOpcaoSelecionada,
                      ]}
                    >
                      {selecionado ? "✓  " : ""}
                      {treino.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  estilos.botaoSalvar,
                  (salvando || !treinoSelecionado) && estilos.botaoDesabilitado,
                ]}
                onPress={registrarTreino}
                disabled={salvando || !treinoSelecionado}
              >
                {salvando ? (
                  <ActivityIndicator color="#101312" />
                ) : (
                  <Text style={estilos.textoBotaoSalvar}>Confirmar treino</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {sessoesDoDia.length > 0 && (
            <View style={estilos.treinosDoDia}>
              <Text style={estilos.rotulo}>Treinos registrados neste dia</Text>
              {sessoesDoDia.map((sessao) => {
                const treino = treinos.find(
                  (item) => item.id === sessao.plan_id,
                );

                return (
                  <Text key={sessao.id} style={estilos.textoTreinoDoDia}>
                    ✓ {treino?.name ?? "Treino registrado"}
                  </Text>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
  },
  conteudo: {
    padding: 22,
    paddingBottom: 44,
  },
  centralizado: {
    flex: 1,
    backgroundColor: "#101312",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  marca: {
    color: "#35D07F",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F3F5F3",
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitulo: {
    color: "#A9B2AC",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 18,
  },
  textoVoltar: {
    color: "#35D07F",
    fontSize: 16,
    fontWeight: "600",
  },
  cartaoResumo: {
    backgroundColor: "#1B3024",
    borderColor: "#2C593E",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 18,
  },
  resumoNumero: {
    color: "#35D07F",
    fontSize: 36,
    fontWeight: "800",
  },
  resumoTexto: {
    color: "#D0D7D2",
    fontSize: 14,
    marginTop: 4,
  },
  cartaoCalendario: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 18,
  },
  navegacaoMes: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  tituloMes: {
    color: "#F3F5F3",
    fontSize: 18,
    fontWeight: "800",
  },
  botaoMes: {
    width: 42,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  textoBotaoMes: {
    color: "#35D07F",
    fontSize: 30,
  },
  textoDesabilitado: {
    color: "#536057",
  },
  gradeCalendario: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  celula: {
    width: "14.2857%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  nomeDiaSemana: {
    color: "#A9B2AC",
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 8,
  },
  diaCalendario: {
    width: 36,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  diaTreinado: {
    backgroundColor: "#1D4A31",
  },
  diaSelecionado: {
    borderColor: "#35D07F",
    borderWidth: 2,
  },
  diaHoje: {
    borderColor: "#6D8174",
  },
  numeroDia: {
    color: "#D0D7D2",
    fontSize: 14,
    fontWeight: "600",
  },
  numeroTreinado: {
    color: "#8DE8B0",
  },
  numeroSelecionado: {
    color: "#FFFFFF",
  },
  indicadorTreino: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#35D07F",
  },
  legenda: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  textoLegenda: {
    color: "#A9B2AC",
    fontSize: 12,
  },
  cartaoRegistro: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  tituloRegistro: {
    color: "#F3F5F3",
    fontSize: 20,
    fontWeight: "800",
  },
  dataRegistro: {
    color: "#35D07F",
    fontSize: 13,
    marginTop: 6,
    marginBottom: 20,
    textTransform: "capitalize",
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  opcaoTreino: {
    borderColor: "#343D37",
    borderWidth: 1,
    borderRadius: 11,
    padding: 13,
    marginBottom: 8,
  },
  opcaoTreinoSelecionada: {
    backgroundColor: "#1D4A31",
    borderColor: "#35D07F",
  },
  textoOpcao: {
    color: "#D0D7D2",
    fontSize: 14,
  },
  textoOpcaoSelecionada: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  botaoSalvar: {
    backgroundColor: "#35D07F",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: 10,
  },
  botaoDesabilitado: {
    opacity: 0.55,
  },
  textoBotaoSalvar: {
    color: "#101312",
    fontSize: 15,
    fontWeight: "800",
  },
  treinosDoDia: {
    borderTopWidth: 1,
    borderTopColor: "#343D37",
    marginTop: 18,
    paddingTop: 16,
    gap: 8,
  },
  textoTreinoDoDia: {
    color: "#8DE8B0",
    fontSize: 14,
  },
  textoSecundario: {
    color: "#A9B2AC",
    fontSize: 14,
    lineHeight: 21,
  },
});
