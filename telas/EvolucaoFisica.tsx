import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

type Medicao = {
  id: string;
  user_id: string;
  measured_at: string;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  notes: string | null;
};

type CamposMedicao = {
  weight_kg: string;
  body_fat_percentage: string;
  chest_cm: string;
  waist_cm: string;
  hip_cm: string;
  arm_cm: string;
  thigh_cm: string;
  notes: string;
};

const camposVazios: CamposMedicao = {
  weight_kg: "",
  body_fat_percentage: "",
  chest_cm: "",
  waist_cm: "",
  hip_cm: "",
  arm_cm: "",
  thigh_cm: "",
  notes: "",
};

function converterNumero(valor: string): number | null {
  if (!valor.trim()) return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

function formatarData(valor: string) {
  const data = new Date(`${valor}T12:00:00`);
  return data.toLocaleDateString("pt-BR");
}

function formatarValor(valor: number | null, unidade: string) {
  if (valor === null || valor === undefined) return "—";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unidade}`;
}

export default function EvolucaoFisica({ onVoltar }: { onVoltar: () => void }) {
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [campos, setCampos] = useState<CamposMedicao>(camposVazios);
  const [dataMedicao, setDataMedicao] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregarMedicoes = useCallback(async (idUsuario: string) => {
    const { data, error } = await supabase
      .from("physical_measurements")
      .select(
        "id, user_id, measured_at, weight_kg, body_fat_percentage, chest_cm, waist_cm, hip_cm, arm_cm, thigh_cm, notes",
      )
      .eq("user_id", idUsuario)
      .order("measured_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      Alert.alert(
        "Erro",
        "Não foi possível carregar suas medições. Confira se executou o SQL de configuração.",
      );
      return;
    }

    setMedicoes((data ?? []) as Medicao[]);
  }, []);

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      const { data, error } = await supabase.auth.getUser();
      if (!ativo) return;

      if (error || !data.user) {
        Alert.alert(
          "Sessão expirada",
          "Entre novamente para consultar suas medições.",
        );
        setCarregando(false);
        return;
      }

      setUsuarioId(data.user.id);
      await carregarMedicoes(data.user.id);
      if (ativo) setCarregando(false);
    }

    iniciar();
    return () => {
      ativo = false;
    };
  }, [carregarMedicoes]);

  const resumoPeso = useMemo(() => {
    const registrosComPeso = medicoes.filter((item) => item.weight_kg !== null);
    if (registrosComPeso.length === 0) return null;
    const atual = registrosComPeso[0];
    const anterior = registrosComPeso.find(
      (item) => item.id !== atual.id && item.weight_kg !== null,
    );
    return {
      atual: atual.weight_kg as number,
      diferenca: anterior
        ? (atual.weight_kg as number) - (anterior.weight_kg as number)
        : null,
      data: atual.measured_at,
    };
  }, [medicoes]);

  const dadosGrafico = useMemo(() => {
    return medicoes
      .filter((item) => item.weight_kg !== null)
      .slice(0, 8)
      .reverse();
  }, [medicoes]);

  const pesoMaximo = Math.max(
    ...dadosGrafico.map((item) => item.weight_kg ?? 0),
    1,
  );

  function atualizarCampo(campo: keyof CamposMedicao, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvarMedicao() {
    if (!usuarioId) {
      Alert.alert(
        "Atenção",
        "Não foi possível identificar seu usuário. Entre novamente.",
      );
      return;
    }

    const peso = converterNumero(campos.weight_kg);
    if (peso === null || peso <= 0 || peso > 500) {
      Alert.alert("Peso obrigatório", "Informe um peso válido em quilogramas.");
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dataMedicao) ||
      Number.isNaN(new Date(`${dataMedicao}T12:00:00`).getTime())
    ) {
      Alert.alert("Data inválida", "Informe a data no formato AAAA-MM-DD.");
      return;
    }

    const dados = {
      user_id: usuarioId,
      measured_at: dataMedicao,
      weight_kg: peso,
      body_fat_percentage: converterNumero(campos.body_fat_percentage),
      chest_cm: converterNumero(campos.chest_cm),
      waist_cm: converterNumero(campos.waist_cm),
      hip_cm: converterNumero(campos.hip_cm),
      arm_cm: converterNumero(campos.arm_cm),
      thigh_cm: converterNumero(campos.thigh_cm),
      notes: campos.notes.trim() || null,
    };

    const valoresNumericos = [
      dados.body_fat_percentage,
      dados.chest_cm,
      dados.waist_cm,
      dados.hip_cm,
      dados.arm_cm,
      dados.thigh_cm,
    ];
    if (valoresNumericos.some((valor) => valor !== null && valor <= 0)) {
      Alert.alert(
        "Valor inválido",
        "As medidas preenchidas devem ser maiores que zero.",
      );
      return;
    }
    if (dados.body_fat_percentage !== null && dados.body_fat_percentage > 100) {
      Alert.alert(
        "Valor inválido",
        "O percentual de gordura deve estar entre 0 e 100.",
      );
      return;
    }

    setSalvando(true);
    const { error } = await supabase
      .from("physical_measurements")
      .insert(dados);
    setSalvando(false);

    if (error) {
      Alert.alert(
        "Erro ao salvar",
        "Não foi possível salvar a medição. Verifique a tabela e as políticas RLS no Supabase.",
      );
      return;
    }

    setCampos(camposVazios);
    setDataMedicao(new Date().toISOString().slice(0, 10));
    await carregarMedicoes(usuarioId);
    Alert.alert("Medição salva", "Sua evolução física foi atualizada.");
  }

  function campoMedicao(
    rotulo: string,
    campo: keyof CamposMedicao,
    unidade: string,
  ) {
    return (
      <View style={styles.campoContainer} key={campo}>
        <Text style={styles.rotulo}>{rotulo}</Text>
        <View style={styles.inputLinha}>
          <TextInput
            style={styles.input}
            value={campos[campo]}
            onChangeText={(valor) => atualizarCampo(campo, valor)}
            keyboardType={campo === "notes" ? "default" : "decimal-pad"}
            placeholder="—"
            placeholderTextColor="#6F7972"
            accessibilityLabel={rotulo}
          />
          {unidade ? <Text style={styles.unidade}>{unidade}</Text> : null}
        </View>
      </View>
    );
  }

  if (carregando) {
    return (
      <View style={styles.carregando}>
        <ActivityIndicator size="large" color="#35D07F" />
        <Text style={styles.textoSecundario}>Carregando sua evolução...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.tela}
      contentContainerStyle={styles.conteudo}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.cabecalho}>
        <TouchableOpacity onPress={onVoltar} style={styles.botaoVoltar}>
          <Text style={styles.botaoVoltarTexto}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Evolução física</Text>
        <Text style={styles.subtitulo}>
          Registre suas medidas e acompanhe as mudanças ao longo do tempo.
        </Text>
      </View>

      {resumoPeso ? (
        <View style={styles.cartaoResumo}>
          <Text style={styles.rotuloPequeno}>ÚLTIMO PESO REGISTRADO</Text>
          <Text style={styles.pesoDestaque}>
            {formatarValor(resumoPeso.atual, "kg")}
          </Text>
          <Text style={styles.textoSecundario}>
            Em {formatarData(resumoPeso.data)}
          </Text>
          {resumoPeso.diferenca !== null ? (
            <Text
              style={[
                styles.variacao,
                resumoPeso.diferenca > 0
                  ? styles.variacaoAlta
                  : resumoPeso.diferenca < 0
                    ? styles.variacaoBaixa
                    : null,
              ]}
            >
              {resumoPeso.diferenca > 0 ? "+" : ""}
              {resumoPeso.diferenca.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}{" "}
              kg desde a medição anterior
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Nova medição</Text>
        <Text style={styles.rotulo}>Data da medição (AAAA-MM-DD)</Text>
        <TextInput
          style={styles.inputData}
          value={dataMedicao}
          onChangeText={setDataMedicao}
          placeholder="AAAA-MM-DD"
          placeholderTextColor="#6F7972"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <View style={styles.gradeCampos}>
          {campoMedicao("Peso", "weight_kg", "kg")}
          {campoMedicao("Gordura corporal", "body_fat_percentage", "%")}
          {campoMedicao("Peito", "chest_cm", "cm")}
          {campoMedicao("Cintura", "waist_cm", "cm")}
          {campoMedicao("Quadril", "hip_cm", "cm")}
          {campoMedicao("Braço", "arm_cm", "cm")}
          {campoMedicao("Coxa", "thigh_cm", "cm")}
        </View>
        <Text style={styles.rotulo}>Observações (opcional)</Text>
        <TextInput
          style={[styles.inputData, styles.inputObservacoes]}
          value={campos.notes}
          onChangeText={(valor) => atualizarCampo("notes", valor)}
          placeholder="Ex.: medição feita pela manhã"
          placeholderTextColor="#6F7972"
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.botaoSalvar, salvando && styles.botaoDesabilitado]}
          onPress={salvarMedicao}
          disabled={salvando}
        >
          {salvando ? (
            <ActivityIndicator color="#101312" />
          ) : (
            <Text style={styles.botaoSalvarTexto}>Salvar medição</Text>
          )}
        </TouchableOpacity>
      </View>

      {dadosGrafico.length > 1 ? (
        <View style={styles.cartao}>
          <Text style={styles.tituloCartao}>Variação do peso</Text>
          <Text style={styles.textoSecundario}>
            Últimas {dadosGrafico.length} medições registradas
          </Text>
          <View style={styles.grafico}>
            {dadosGrafico.map((item) => {
              const altura = Math.max(
                8,
                ((item.weight_kg ?? 0) / pesoMaximo) * 120,
              );
              return (
                <View style={styles.colunaGrafico} key={item.id}>
                  <Text style={styles.valorGrafico}>
                    {(item.weight_kg ?? 0).toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                  </Text>
                  <View style={styles.baseBarra}>
                    <View style={[styles.barra, { height: altura }]} />
                  </View>
                  <Text style={styles.dataGrafico}>
                    {formatarData(item.measured_at).slice(0, 5)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.cartao}>
        <Text style={styles.tituloCartao}>Histórico de medições</Text>
        {medicoes.length === 0 ? (
          <Text style={styles.textoSecundario}>
            Você ainda não registrou medições. Salve a primeira acima para
            começar a acompanhar sua evolução.
          </Text>
        ) : (
          medicoes.map((item) => (
            <View style={styles.itemHistorico} key={item.id}>
              <View style={styles.itemHistoricoTopo}>
                <Text style={styles.dataHistorico}>
                  {formatarData(item.measured_at)}
                </Text>
                <Text style={styles.pesoHistorico}>
                  {formatarValor(item.weight_kg, "kg")}
                </Text>
              </View>
              <View style={styles.medidasHistorico}>
                {item.body_fat_percentage !== null ? (
                  <Text style={styles.medidaTexto}>
                    Gordura: {formatarValor(item.body_fat_percentage, "%")}
                  </Text>
                ) : null}
                {item.chest_cm !== null ? (
                  <Text style={styles.medidaTexto}>
                    Peito: {formatarValor(item.chest_cm, "cm")}
                  </Text>
                ) : null}
                {item.waist_cm !== null ? (
                  <Text style={styles.medidaTexto}>
                    Cintura: {formatarValor(item.waist_cm, "cm")}
                  </Text>
                ) : null}
                {item.hip_cm !== null ? (
                  <Text style={styles.medidaTexto}>
                    Quadril: {formatarValor(item.hip_cm, "cm")}
                  </Text>
                ) : null}
                {item.arm_cm !== null ? (
                  <Text style={styles.medidaTexto}>
                    Braço: {formatarValor(item.arm_cm, "cm")}
                  </Text>
                ) : null}
                {item.thigh_cm !== null ? (
                  <Text style={styles.medidaTexto}>
                    Coxa: {formatarValor(item.thigh_cm, "cm")}
                  </Text>
                ) : null}
              </View>
              {item.notes ? (
                <Text style={styles.observacaoHistorico}>{item.notes}</Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#101312" },
  conteudo: { padding: 20, paddingBottom: 40, gap: 16 },
  carregando: {
    flex: 1,
    backgroundColor: "#101312",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  cabecalho: { gap: 8, marginBottom: 4 },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 14,
  },
  botaoVoltarTexto: { color: "#35D07F", fontSize: 16, fontWeight: "700" },
  titulo: { color: "#F0F3F1", fontSize: 28, fontWeight: "800" },
  subtitulo: { color: "#A4ADA7", fontSize: 14, lineHeight: 20 },
  cartao: {
    backgroundColor: "#191E1B",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#303832",
    padding: 16,
    gap: 12,
  },
  cartaoResumo: {
    backgroundColor: "#1B3024",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#244C36",
    padding: 18,
    gap: 6,
  },
  rotuloPequeno: {
    color: "#B4C5B9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  pesoDestaque: { color: "#35D07F", fontSize: 34, fontWeight: "800" },
  textoSecundario: { color: "#A4ADA7", fontSize: 13, lineHeight: 19 },
  variacao: { color: "#D6DDD8", fontSize: 13, fontWeight: "600", marginTop: 4 },
  variacaoAlta: { color: "#FFB4A8" },
  variacaoBaixa: { color: "#35D07F" },
  tituloCartao: { color: "#F0F3F1", fontSize: 18, fontWeight: "800" },
  rotulo: {
    color: "#D6DDD8",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 5,
  },
  inputData: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#303832",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#F0F3F1",
    fontSize: 15,
  },
  gradeCampos: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  campoContainer: { width: "48%", flexGrow: 1, minWidth: 125 },
  inputLinha: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#303832",
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    color: "#F0F3F1",
    paddingVertical: 10,
    fontSize: 15,
    minWidth: 0,
  },
  unidade: { color: "#A4ADA7", fontSize: 12, marginLeft: 4 },
  inputObservacoes: { minHeight: 70, textAlignVertical: "top" },
  botaoSalvar: {
    backgroundColor: "#35D07F",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  botaoDesabilitado: { opacity: 0.65 },
  botaoSalvarTexto: { color: "#101312", fontSize: 15, fontWeight: "800" },
  grafico: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    minHeight: 170,
    paddingTop: 12,
    gap: 5,
  },
  colunaGrafico: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  valorGrafico: { color: "#D6DDD8", fontSize: 10, fontWeight: "700" },
  baseBarra: {
    height: 122,
    justifyContent: "flex-end",
    width: "65%",
    alignItems: "stretch",
  },
  barra: {
    backgroundColor: "#35D07F",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    width: "100%",
  },
  dataGrafico: { color: "#A4ADA7", fontSize: 10 },
  itemHistorico: {
    borderTopWidth: 1,
    borderTopColor: "#303832",
    paddingTop: 12,
    paddingBottom: 4,
    gap: 7,
  },
  itemHistoricoTopo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dataHistorico: { color: "#D6DDD8", fontSize: 14, fontWeight: "700" },
  pesoHistorico: { color: "#35D07F", fontSize: 16, fontWeight: "800" },
  medidasHistorico: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  medidaTexto: { color: "#A4ADA7", fontSize: 12 },
  observacaoHistorico: { color: "#D6DDD8", fontSize: 13, fontStyle: "italic" },
});
