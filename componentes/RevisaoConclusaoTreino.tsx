import React from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import ResumoRegistroTreino from "./ResumoRegistroTreino";
import RepetirCarga from "./RepetirCarga";
import ProgressoFinalizacao from "./ProgressoFinalizacao";
import { estilos } from "../telas/TreinoAtivo.estilos";

type Resumo = React.ComponentProps<typeof ResumoRegistroTreino>;
export type DestinoModeloTreino = "novo" | "adicionar" | "sessao";
type Props = {
  visivel: boolean;
  salvando: boolean;
  inicioFinalizacao: number | null;
  estimativaFinalizacao: number | null;
  online: boolean;
  corTema: string;
  perfil: Resumo["perfil"];
  seriesDoResumo: Resumo["series"];
  duracaoFinal: string;
  setDuracaoFinal: Resumo["onDuracao"];
  intensidade: Resumo["intensidade"];
  setIntensidade: Resumo["onIntensidade"];
  esforco: Resumo["esforco"];
  setEsforco: Resumo["onEsforco"];
  destinoModelo: DestinoModeloTreino;
  setDestinoModelo: (destino: DestinoModeloTreino) => void;
  podeAdicionar: boolean;
  nomeNovoPlano: string;
  setNomeNovoPlano: (nome: string) => void;
  aceitarCargaZero: boolean;
  setAceitarCargaZero: (aceitar: boolean) => void;
  erroConclusao: string;
  fotoEmEnvio: boolean;
  onFechar: () => void;
  onEditarCargas: () => void;
  onConfirmar: () => Promise<void>;
};

export default function RevisaoConclusaoTreino({
  visivel, salvando, inicioFinalizacao, estimativaFinalizacao, online, corTema,
  perfil, seriesDoResumo, duracaoFinal, setDuracaoFinal, intensidade, setIntensidade,
  esforco, setEsforco, destinoModelo, setDestinoModelo, podeAdicionar, nomeNovoPlano,
  setNomeNovoPlano, aceitarCargaZero, setAceitarCargaZero, erroConclusao, fotoEmEnvio,
  onFechar, onEditarCargas, onConfirmar,
}: Props) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visivel}
      onRequestClose={() => {
        if (!salvando) onFechar();
      }}
    >
      <View style={{ flex: 1, backgroundColor: "#000B" }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 18,
          }}
        >
          <View
            style={[
              estilos.cartao,
              { width: "100%", maxWidth: 560, alignSelf: "center", gap: 16 },
            ]}
          >
            <Text style={estilos.tituloCartao}>
              Revisar e concluir treino
            </Text>
            {salvando && inicioFinalizacao !== null ? (
              <ProgressoFinalizacao
                inicio={inicioFinalizacao}
                estimativa={estimativaFinalizacao}
                salvando
                online={online}
                erro={false}
                cor={corTema}
              />
            ) : (
              <Text style={estilos.secundario}>
                {estimativaFinalizacao === null
                  ? "Ao confirmar, a conclusão será salva neste aparelho e enviada ao servidor. O tempo depende da conexão."
                  : `Previsão de envio após confirmar: cerca de ${estimativaFinalizacao} s, com base nos envios anteriores deste aparelho. Pode variar conforme a conexão.`}
              </Text>
            )}
            <ResumoRegistroTreino
              perfil={perfil}
              series={seriesDoResumo}
              duracao={duracaoFinal}
              onDuracao={setDuracaoFinal}
              intensidade={intensidade}
              onIntensidade={setIntensidade}
              esforco={esforco}
              onEsforco={setEsforco}
              cor={corTema}
              bloqueado={salvando}
            />
            <Text style={estilos.tituloCartao}>
              Como guardar este treino?
            </Text>
            {(
              [
                ["novo", "Criar novo treino"],
                ["adicionar", "Adicionar novos exercícios ao original"],
                ["sessao", "Usar só nesta sessão"],
              ] as const
            ).map(([modo, titulo]) => (
              <TouchableOpacity
                key={modo}
                accessibilityRole="button"
                accessibilityLabel={titulo}
                accessibilityState={{ selected: destinoModelo === modo }}
                disabled={
                  salvando ||
                  (modo === "adicionar" &&
                    !podeAdicionar)
                }
                onPress={() => setDestinoModelo(modo)}
                style={[
                  estilos.botaoSecundario,
                  {
                    borderColor: destinoModelo === modo ? corTema : "#45544A",
                  },
                ]}
              >
                <Text style={estilos.textoOpcao}>
                  {destinoModelo === modo ? "✓ " : ""}
                  {titulo}
                </Text>
              </TouchableOpacity>
            ))}
            {destinoModelo === "novo" ? (
              <TextInput
                accessibilityLabel="Nome do novo treino"
                placeholder="Ex.: Treino academia da viagem"
                placeholderTextColor="#828A85"
                value={nomeNovoPlano}
                onChangeText={setNomeNovoPlano}
                maxLength={100}
                editable={!salvando}
                style={{
                  borderWidth: 1,
                  borderColor: corTema,
                  borderRadius: 10,
                  padding: 12,
                  color: "#F0F4F1",
                }}
              />
            ) : null}
            <Text style={estilos.secundario}>
              {destinoModelo === "novo"
                ? "Cria um plano com os exercícios e cargas desta sessão e vincula esta conclusão a ele. O original é preservado."
                : destinoModelo === "adicionar"
                  ? "Acrescenta os exercícios novos ao original e atualiza as cargas e séries dos exercícios realizados para usar no próximo treino."
                  : "Guarda as adaptações de exercícios só nesta sessão. As cargas e séries realizadas dos exercícios já cadastrados passam a ser o padrão do treino."}
            </Text>
            {seriesDoResumo.some((serie) => serie.weight_kg === 0) ? (
              <View style={{ gap: 10 }}>
                <Text style={estilos.aviso}>
                  Há{" "}
                  {
                    seriesDoResumo.filter((serie) => serie.weight_kg === 0)
                      .length
                  }{" "}
                  série(s) concluída(s) sem carga informada ou com 0 kg.
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Editar cargas zeradas"
                  disabled={salvando}
                  style={estilos.botaoSecundario}
                  onPress={onEditarCargas}
                >
                  <Text style={estilos.textoOpcao}>Editar cargas</Text>
                </TouchableOpacity>
                <RepetirCarga
                  marcado={aceitarCargaZero}
                  onAlterar={setAceitarCargaZero}
                  cor={corTema}
                  bloqueado={salvando}
                  rotulo="Concluir mesmo assim com carga zero"
                />
              </View>
            ) : null}
            {erroConclusao ? (
              <Text accessibilityRole="alert" style={estilos.aviso}>
                {erroConclusao}
              </Text>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Confirmar conclusão do treino"
              disabled={salvando || fotoEmEnvio}
              onPress={() => void onConfirmar()}
              style={[estilos.botaoPrimario, { backgroundColor: corTema }]}
            >
              <Text style={estilos.textoPrimario}>
                {salvando ? "Guardando..." : "Confirmar conclusão do treino"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={salvando}
              onPress={onFechar}
              style={estilos.botaoSecundario}
            >
              <Text style={estilos.textoOpcao}>Continuar treinando</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
