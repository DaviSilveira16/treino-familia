import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Alert } from "../servicos/alerta";
import { supabase } from "../supabase";
import { categoriaDoCardio } from "../servicos/caloriasCardio";

type Cardio = {
  id: string;
  nome: string;
  tipo: string;
  duracao_min: number | null;
  distancia_km: number | null;
  calorias: number | null;
  observacoes: string | null;
};
type Props = { onVoltar: () => void; corTema?: string };
const TIPOS = [
  "Escadas",
  "Esteira",
  "Bicicleta",
  "Caminhada",
  "Corrida",
  "Elíptico",
  "Pilates",
];

function permiteDistancia(tipo: string) {
  return ["esteira", "caminhada", "corrida", "bicicleta"].includes(
    categoriaDoCardio(tipo),
  );
}

export default function MeusCardios({ onVoltar, corTema = "#35D07F" }: Props) {
  const [cardios, setCardios] = useState<Cardio[]>([]);
  const [usuarioId, setUsuarioId] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Escadas");
  const [duracao, setDuracao] = useState("");
  const [distancia, setDistancia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: usuarioData, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !usuarioData.user)
        throw new Error("Entre novamente na sua conta.");
      setUsuarioId(usuarioData.user.id);
      const { data, error } = await supabase
        .from("cardio_activities")
        .select("id, nome, tipo, duracao_min, distancia_km, observacoes")
        .eq("user_id", usuarioData.user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setCardios((data ?? []) as Cardio[]);
    } catch (erro) {
      Alert.alert(
        "Erro",
        erro instanceof Error
          ? erro.message
          : "Não foi possível carregar os cardios.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function limparFormulario() {
    setNome("");
    setTipo("Escadas");
    setDuracao("");
    setDistancia("");
    setObservacoes("");
    setEditando(null);
  }

  function editar(cardio: Cardio) {
    setEditando(cardio.id);
    setNome(cardio.nome);
    setTipo(cardio.tipo);
    setDuracao(cardio.duracao_min == null ? "" : String(cardio.duracao_min));
    setDistancia(
      permiteDistancia(cardio.tipo) && cardio.distancia_km != null
        ? String(cardio.distancia_km)
        : "",
    );
    setObservacoes(cardio.observacoes ?? "");
  }

  async function salvar() {
    if (!usuarioId || !nome.trim()) {
      Alert.alert("Atenção", "Informe um nome para o cardio.");
      return;
    }
    const minutos = duracao.trim() ? Number(duracao.replace(",", ".")) : null;
    const km =
      permiteDistancia(tipo) && distancia.trim()
        ? Number(distancia.replace(",", "."))
        : null;
    if (
      (minutos !== null && (!Number.isFinite(minutos) || minutos < 0)) ||
      (km !== null && (!Number.isFinite(km) || km < 0))
    ) {
      Alert.alert(
        "Valores inválidos",
        "Duração e distância, quando aplicável, devem ser números iguais ou maiores que zero.",
      );
      return;
    }
    setSalvando(true);
    try {
      const registro = {
        user_id: usuarioId,
        nome: nome.trim(),
        tipo,
        duracao_min: minutos,
        distancia_km: km,
        observacoes: observacoes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      const resposta = editando
        ? await supabase
            .from("cardio_activities")
            .update(registro)
            .eq("id", editando)
            .eq("user_id", usuarioId)
        : await supabase.from("cardio_activities").insert(registro);
      if (resposta.error) throw resposta.error;
      limparFormulario();
      await carregar();
      Alert.alert(
        "Salvo",
        "Cardio salvo como referência para os próximos registros.",
      );
    } catch (erro) {
      Alert.alert(
        "Erro ao salvar",
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar o cardio.",
      );
    } finally {
      setSalvando(false);
    }
  }

  function excluir(cardio: Cardio) {
    Alert.alert(
      "Excluir cardio",
      `Deseja excluir o modelo “${cardio.nome}”? Os registros antigos do histórico serão preservados.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("cardio_activities")
              .delete()
              .eq("id", cardio.id)
              .eq("user_id", usuarioId);
            if (error) Alert.alert("Erro", error.message);
            else {
              if (editando === cardio.id) limparFormulario();
              await carregar();
            }
          },
        },
      ],
    );
  }

  return (
    <View style={estilos.container}>
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={estilos.voltar} onPress={onVoltar}>
          <Text style={{ color: corTema, fontSize: 16, fontWeight: "700" }}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Meus Cardios</Text>
        <Text style={estilos.subtitulo}>
          Cadastre seus cardios e salve valores de referência. Cada sessão
          registrada na Frequência terá uma cópia própria dos dados, preservada
          no Histórico.
        </Text>
        <View style={estilos.cartao}>
          <Text style={estilos.tituloCartao}>
            {editando ? "Editar cardio" : "Cadastrar cardio"}
          </Text>
          <Text style={estilos.rotulo}>Nome</Text>
          <TextInput
            style={estilos.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Ex.: Escada pós-treino"
            placeholderTextColor="#7D8881"
          />
          <Text style={estilos.rotulo}>Tipo</Text>
          <View style={estilos.tipos}>
            {TIPOS.map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => {
                  setTipo(item);
                  if (!permiteDistancia(item)) setDistancia("");
                }}
                style={[
                  estilos.tipo,
                  (tipo === item ||
                    (tipo === "Escada" && item === "Escadas")) && {
                    borderColor: corTema,
                    backgroundColor: `${corTema}20`,
                  },
                ]}
              >
                <Text
                  style={[
                    estilos.tipoTexto,
                    (tipo === item ||
                      (tipo === "Escada" && item === "Escadas")) && {
                      color: corTema,
                    },
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.rotulo}>Duração (minutos)</Text>
          <TextInput
            style={estilos.input}
            value={duracao}
            onChangeText={setDuracao}
            keyboardType="decimal-pad"
            placeholder="Ex.: 20"
            placeholderTextColor="#7D8881"
          />
          {permiteDistancia(tipo) ? (
            <>
              <Text style={estilos.rotulo}>Distância (km, opcional)</Text>
              <TextInput
                style={estilos.input}
                value={distancia}
                onChangeText={setDistancia}
                keyboardType="decimal-pad"
                placeholder="Ex.: 3,5"
                placeholderTextColor="#7D8881"
              />
            </>
          ) : null}
          <Text style={estilos.descricaoCalorias}>
            As calorias serão estimadas quando você registrar a sessão na
            Frequência, usando seu peso, altura, idade, sexo, duração e
            intensidade. Não é necessário informar calorias manualmente.
          </Text>
          <Text style={estilos.rotulo}>Observações (opcional)</Text>
          <TextInput
            style={[estilos.input, estilos.multilinha]}
            value={observacoes}
            onChangeText={setObservacoes}
            multiline
            placeholder="Inclua ritmo, nível ou detalhes"
            placeholderTextColor="#7D8881"
          />
          <TouchableOpacity
            style={[
              estilos.botao,
              { backgroundColor: corTema },
              salvando && { opacity: 0.6 },
            ]}
            onPress={salvar}
            disabled={salvando}
          >
            {salvando ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotao}>
                {editando ? "Salvar alterações" : "Salvar cardio"}
              </Text>
            )}
          </TouchableOpacity>
          {editando && (
            <TouchableOpacity
              style={estilos.cancelar}
              onPress={limparFormulario}
            >
              <Text style={estilos.textoCancelar}>Cancelar edição</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={estilos.tituloLista}>Cardios cadastrados</Text>
        {carregando ? (
          <ActivityIndicator color={corTema} size="large" />
        ) : cardios.length === 0 ? (
          <Text style={estilos.vazio}>
            Nenhum cardio cadastrado. Crie seu primeiro acima.
          </Text>
        ) : (
          cardios.map((cardio) => (
            <View key={cardio.id} style={estilos.item}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.nomeCardio}>{cardio.nome}</Text>
                <Text style={estilos.detalhes}>
                  {cardio.tipo}
                  {cardio.duracao_min != null
                    ? ` · ${cardio.duracao_min} min`
                    : ""}
                  {permiteDistancia(cardio.tipo) && cardio.distancia_km != null
                    ? ` · ${cardio.distancia_km} km`
                    : ""}
                </Text>
                {cardio.observacoes ? (
                  <Text style={estilos.detalhes}>{cardio.observacoes}</Text>
                ) : null}
              </View>
              <View style={estilos.acoes}>
                <TouchableOpacity onPress={() => editar(cardio)}>
                  <Text style={[estilos.acao, { color: corTema }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => excluir(cardio)}>
                  <Text style={[estilos.acao, { color: "#F29B9B" }]}>
                    Excluir
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, minHeight: 0, backgroundColor: "#101312" },
  conteudo: {
    padding: 22,
    paddingTop: Platform.OS === "web" ? 8 : 22,
    paddingBottom: 44,
  },
  voltar: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 18 },
  marca: { fontSize: 12, fontWeight: "800", letterSpacing: 2, marginBottom: 8 },
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
  cartao: {
    backgroundColor: "#191E1B",
    borderColor: "#2B332E",
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  tituloCartao: {
    color: "#F3F5F3",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  rotulo: {
    color: "#D9E0DB",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#F3F5F3",
    fontSize: 14,
  },
  descricaoCalorias: {
    color: "#A4ADA7",
    fontSize: 12,
    lineHeight: 17,
    marginTop: -5,
    marginBottom: 10,
  },
  multilinha: { minHeight: 78, textAlignVertical: "top" },
  tipos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipo: {
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tipoTexto: { color: "#D9E0DB", fontSize: 13 },
  botao: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  textoBotao: { color: "#101312", fontWeight: "800", fontSize: 15 },
  cancelar: { alignItems: "center", padding: 12 },
  textoCancelar: { color: "#D9E0DB", fontWeight: "600" },
  tituloLista: {
    color: "#F3F5F3",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 14,
  },
  vazio: {
    color: "#A9B2AC",
    backgroundColor: "#191E1B",
    borderRadius: 14,
    padding: 18,
    lineHeight: 21,
  },
  item: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
  },
  nomeCardio: {
    color: "#F3F5F3",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
  },
  detalhes: { color: "#A9B2AC", fontSize: 12, lineHeight: 18, marginTop: 3 },
  acoes: { gap: 12, alignItems: "flex-end" },
  acao: { fontSize: 13, fontWeight: "800" },
});
