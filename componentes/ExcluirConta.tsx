import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

export default function ExcluirConta({ usuarioId, email, exportar }: {
  usuarioId: string;
  email?: string;
  exportar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const executar = async (acao: () => Promise<void>) => {
    if (ocupado) return;
    setOcupado(true);
    setMensagem("");
    try { await acao(); }
    catch (erro) { setMensagem(erro instanceof Error ? erro.message : "Não foi possível confirmar a operação."); }
    finally { setOcupado(false); }
  };
  const botao = (rotulo: string, acao: () => void, disabled = false) => (
    <Pressable accessibilityRole="button" disabled={ocupado || disabled} onPress={acao} style={s.botao}>
      <Text style={s.texto}>{rotulo}</Text>
    </Pressable>
  );

  async function enviarCodigo() {
    const { data } = await supabase.auth.getUser();
    if (!email || data.user?.id !== usuarioId) throw new Error("Entre novamente para continuar.");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw new Error("Não foi possível enviar o código. Aguarde e tente novamente.");
    setEnviado(true);
    setCodigo("");
    setMensagem("Confira o código enviado ao seu e-mail.");
  }

  async function excluir() {
    const { data: sessao } = await supabase.auth.getSession();
    if (sessao.session?.user.id !== usuarioId) throw new Error("A conta mudou. Abra o Perfil novamente.");
    const { error } = await supabase.functions.invoke("excluir-conta", { body: { codigo: codigo.trim(), confirmacao } });
    if (error) {
      const resposta = await (error.context instanceof Response ? error.context.json().catch(() => null) : null);
      throw new Error(resposta?.mensagem ?? "O servidor ainda não confirmou a exclusão.");
    }
    try {
      const chaves = await AsyncStorage.getAllKeys();
      const proprias = chaves.filter((chave) => chave.startsWith("@treino-familia:") && chave.split(":").includes(usuarioId));
      if (proprias.length) await AsyncStorage.multiRemove(proprias);
    } finally {
      await supabase.auth.signOut({ scope: "local" });
    }
    setAberto(false);
  }

  return (
    <View style={s.cartao}>
      {botao(aberto ? "Cancelar exclusão" : "Excluir minha conta e meus dados", () => {
        setAberto(!aberto);
        setEnviado(false);
        setConfirmacao("");
        setCodigo("");
        setMensagem("");
      })}
      {aberto && <>
        <Text style={s.texto}>A exclusão é permanente. Seus registros, publicações e fotos serão removidos. Famílias com dados de outras pessoas precisam ter a titularidade resolvida antes. Fichas já entregues a alunos permanecem com eles e o vínculo é encerrado.</Text>
        {botao("Exportar backup antes de excluir", () => void executar(exportar))}
        {botao(enviado ? "Enviar novo código" : "Enviar código de confirmação por e-mail", () => void executar(enviarCodigo), !email)}
        {enviado && <>
          <Text style={s.texto}>Código de e-mail</Text>
          <TextInput style={s.botao} accessibilityLabel="Código de e-mail" value={codigo} onChangeText={setCodigo} keyboardType="number-pad" />
          <Text style={s.texto}>Digite EXCLUIR para confirmar</Text>
          <TextInput style={s.botao} accessibilityLabel="Digite EXCLUIR para confirmar" value={confirmacao} onChangeText={setConfirmacao} autoCapitalize="characters" />
          {botao("Confirmar exclusão definitiva", () => void executar(excluir), confirmacao !== "EXCLUIR" || !/^\d{6,10}$/.test(codigo.trim()))}
        </>}
        {mensagem ? <Text accessibilityLiveRegion="polite" style={s.texto}>{mensagem}</Text> : null}
      </>}
    </View>
  );
}

const s = StyleSheet.create({
  cartao: { gap: 12, borderWidth: 1, borderColor: "#87534E", borderRadius: 16, backgroundColor: "#191E1B", padding: 14 },
  botao: { minHeight: 44, borderWidth: 1, borderColor: "#87534E", borderRadius: 9, padding: 10, justifyContent: "center", color: "#F0F3F1" },
  texto: { color: "#FFD3CB", fontSize: 14, lineHeight: 21 },
});
