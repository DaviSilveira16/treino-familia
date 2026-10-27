import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Familia } from "../servicos/familias";

export default function MinhasFamilias({
  familias,
  ativaId,
  usuarioId,
  cor,
  bloqueado,
  criando,
  onSelecionar,
  onCriar,
  onRenomear,
  onSair,
  onExcluir,
}: {
  familias: Familia[];
  ativaId: string | null;
  usuarioId: string;
  cor: string;
  bloqueado: boolean;
  criando: boolean;
  onSelecionar: (id: string) => void;
  onCriar: (nome: string) => Promise<boolean>;
  onRenomear: (id: string, nome: string) => Promise<boolean>;
  onSair: (id: string) => Promise<boolean>;
  onExcluir: (id: string) => Promise<boolean>;
}) {
  const [formulario, setFormulario] = useState(false);
  const [nome, setNome] = useState("");
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [exclusaoId, setExclusaoId] = useState<string | null>(null);
  const [nomeConfirmacao, setNomeConfirmacao] = useState("");

  const criar = async () => {
    if (await onCriar(nome)) {
      setNome("");
      setFormulario(false);
    }
  };

  const sair = async (familia: Familia) => {
    const mensagem = `Você deixará de acessar as publicações e o painel de “${familia.name}”. Para voltar, precisará de um novo convite. A família não será excluída.`;
    let confirmado = false;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      confirmado = window.confirm(`Sair da família?\n\n${mensagem}`);
    } else {
      confirmado = await new Promise<boolean>((resolve) => {
        Alert.alert("Sair da família?", mensagem, [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Sair", style: "destructive", onPress: () => resolve(true) },
        ]);
      });
    }
    if (confirmado) await onSair(familia.id);
  };

  return (
    <View style={s.cartao}>
      <Text style={s.titulo}>
        Minhas famílias{familias.length ? ` (${familias.length})` : ""}
      </Text>
      <Text style={s.ajuda}>
        Escolha com quem deseja compartilhar. Cada família tem seu próprio
        convite, painel e publicações.
      </Text>

      {familias.map((familia) => {
        const ativa = familia.id === ativaId;
        const proprietaria = familia.owner_user_id === usuarioId;
        const editando = renomeandoId === familia.id;
        const confirmandoExclusao = exclusaoId === familia.id;
        const nomeConfere = nomeConfirmacao.trim() === familia.name.trim();

        return (
          <View
            key={familia.id}
            style={[
              s.opcao,
              ativa && { borderColor: cor, backgroundColor: `${cor}18` },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Abrir família ${familia.name}`}
              accessibilityState={{ selected: ativa, disabled: bloqueado }}
              disabled={bloqueado || editando || confirmandoExclusao}
              onPress={() => onSelecionar(familia.id)}
              activeOpacity={0.8}
            >
              <Text style={[s.nome, ativa && { color: cor }]}>
                {ativa ? "✓ " : ""}
                {familia.name}
              </Text>
              <Text style={s.ajuda}>
                {proprietaria ? "Criada por você" : "Você participa"}
                {ativa ? " · selecionada" : ""}
              </Text>
            </TouchableOpacity>

            {editando ? (
              <View style={s.grupoAcao}>
                <TextInput
                  accessibilityLabel="Novo nome da família"
                  value={nomeEdicao}
                  onChangeText={setNomeEdicao}
                  placeholder="Novo nome da família"
                  placeholderTextColor="#758178"
                  maxLength={70}
                  editable={!bloqueado}
                  style={s.input}
                />
                <View style={s.linhaBotoes}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={
                      bloqueado ||
                      !nomeEdicao.trim() ||
                      nomeEdicao.trim() === familia.name
                    }
                    onPress={async () => {
                      if (await onRenomear(familia.id, nomeEdicao.trim()))
                        setRenomeandoId(null);
                    }}
                    style={[
                      s.botaoPequeno,
                      {
                        backgroundColor: cor,
                        opacity:
                          bloqueado ||
                          !nomeEdicao.trim() ||
                          nomeEdicao.trim() === familia.name
                            ? 0.5
                            : 1,
                      },
                    ]}
                  >
                    <Text style={s.escuro}>Salvar nome</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={bloqueado}
                    onPress={() => setRenomeandoId(null)}
                    style={s.botaoPequeno}
                  >
                    <Text style={s.nome}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {confirmandoExclusao ? (
              <View style={s.confirmacaoExclusao}>
                <Text style={s.alertaTitulo}>
                  Excluir família permanentemente?
                </Text>
                <Text style={s.alertaTexto}>
                  Esta ação removerá a família, os vínculos dos membros e as
                  publicações do grupo. Não pode ser desfeita.
                </Text>
                <Text style={s.alertaTexto}>
                  Etapa 2: digite exatamente o nome da família para confirmar.
                </Text>
                <TextInput
                  accessibilityLabel="Digite o nome da família para confirmar a exclusão"
                  value={nomeConfirmacao}
                  onChangeText={setNomeConfirmacao}
                  placeholder={familia.name}
                  placeholderTextColor="#758178"
                  maxLength={70}
                  editable={!bloqueado}
                  style={s.input}
                />
                <View style={s.linhaBotoes}>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={bloqueado || !nomeConfere}
                    onPress={async () => {
                      if (await onExcluir(familia.id)) {
                        setExclusaoId(null);
                        setNomeConfirmacao("");
                      }
                    }}
                    style={[
                      s.botaoPequeno,
                      s.botaoPerigo,
                      { opacity: bloqueado || !nomeConfere ? 0.45 : 1 },
                    ]}
                  >
                    <Text style={s.textoPerigo}>
                      {bloqueado ? "Excluindo..." : "Excluir definitivamente"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={bloqueado}
                    onPress={() => {
                      setExclusaoId(null);
                      setNomeConfirmacao("");
                    }}
                    style={s.botaoPequeno}
                  >
                    <Text style={s.nome}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!editando && !confirmandoExclusao ? (
              <View style={s.linhaBotoes}>
                {proprietaria ? (
                  <>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={bloqueado}
                      onPress={() => {
                        setExclusaoId(null);
                        setNomeConfirmacao("");
                        setRenomeandoId(familia.id);
                        setNomeEdicao(familia.name);
                      }}
                      style={[s.botaoAcao, { borderColor: cor }]}
                    >
                      <Text style={{ color: cor, fontWeight: "800" }}>
                        Renomear
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={bloqueado}
                      onPress={() => {
                        setRenomeandoId(null);
                        setExclusaoId(familia.id);
                        setNomeConfirmacao("");
                      }}
                      style={[s.botaoAcao, s.botaoPerigo]}
                    >
                      <Text style={s.textoPerigo}>Excluir família</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={bloqueado}
                    onPress={() => void sair(familia)}
                    style={[s.botaoAcao, s.botaoPerigo]}
                  >
                    <Text style={s.textoPerigo}>Sair da família</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      {formulario || !familias.length ? (
        <View style={s.grupo}>
          <Text style={s.nome}>
            {familias.length ? "Criar outra família" : "Criar uma família"}
          </Text>
          <TextInput
            accessibilityLabel="Nome da nova família"
            value={nome}
            onChangeText={setNome}
            placeholder="Ex.: Família Silva, amigos da academia"
            placeholderTextColor="#758178"
            maxLength={70}
            editable={!bloqueado}
            style={s.input}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Confirmar criação de família"
            disabled={bloqueado || !nome.trim()}
            onPress={() => void criar()}
            style={[
              s.botao,
              {
                backgroundColor: cor,
                opacity: bloqueado || !nome.trim() ? 0.55 : 1,
              },
            ]}
          >
            {criando ? (
              <ActivityIndicator color="#0C120E" />
            ) : (
              <Text style={s.escuro}>Criar família</Text>
            )}
          </TouchableOpacity>
          {familias.length ? (
            <TouchableOpacity
              accessibilityRole="button"
              disabled={bloqueado}
              onPress={() => setFormulario(false)}
              style={s.botao}
            >
              <Text style={s.nome}>Cancelar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Criar outra família"
          disabled={bloqueado}
          onPress={() => setFormulario(true)}
          style={[s.botao, { borderWidth: 1, borderColor: cor }]}
        >
          <Text style={{ color: cor, fontWeight: "800" }}>
            + Criar outra família
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  cartao: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 15,
    padding: 14,
    gap: 12,
  },
  titulo: { color: "#F0F4F1", fontSize: 18, fontWeight: "800" },
  ajuda: { color: "#A4ADA7", fontSize: 12, lineHeight: 19 },
  nome: { color: "#E1E8E3", fontWeight: "800", fontSize: 14 },
  grupo: { gap: 10 },
  grupoAcao: { gap: 9, marginTop: 8 },
  opcao: {
    borderWidth: 1,
    borderColor: "#354139",
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    gap: 10,
  },
  input: {
    color: "#F0F4F1",
    backgroundColor: "#101312",
    borderWidth: 1,
    borderColor: "#45544A",
    borderRadius: 10,
    padding: 12,
  },
  botao: {
    minHeight: 44,
    borderRadius: 10,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  linhaBotoes: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  botaoAcao: {
    borderWidth: 1,
    borderColor: "#45544A",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  botaoPequeno: {
    borderWidth: 1,
    borderColor: "#45544A",
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 38,
  },
  escuro: { color: "#101312", fontWeight: "800" },
  botaoPerigo: { backgroundColor: "#351C1C", borderColor: "#713737" },
  textoPerigo: { color: "#FF9292", fontWeight: "800", fontSize: 12 },
  confirmacaoExclusao: {
    marginTop: 6,
    padding: 11,
    gap: 9,
    borderWidth: 1,
    borderColor: "#713737",
    borderRadius: 10,
    backgroundColor: "#211717",
  },
  alertaTitulo: { color: "#FF9292", fontSize: 14, fontWeight: "900" },
  alertaTexto: { color: "#D8C5C5", fontSize: 12, lineHeight: 18 },
});
