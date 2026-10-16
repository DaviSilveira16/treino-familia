import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";

type Props = {
  usuario: User;
  onVoltar: () => void;
};

export default function Perfil({ usuario, onVoltar }: Props) {
  const nomeAtual =
    typeof usuario.user_metadata?.nome === "string"
      ? usuario.user_metadata.nome
      : "";

  const fotoAtual =
    typeof usuario.user_metadata?.foto_url === "string"
      ? usuario.user_metadata.foto_url
      : null;

  const [nome, setNome] = useState(nomeAtual);
  const [fotoUrl, setFotoUrl] = useState<string | null>(fotoAtual);
  const [senhaAtualizada, setSenhaAtualizada] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);

  async function salvarNome() {
    if (!nome.trim()) {
      Alert.alert("Atenção", "Digite seu nome.");
      return;
    }

    setSalvandoNome(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...usuario.user_metadata,
          nome: nome.trim(),
        },
      });

      if (error) {
        Alert.alert("Erro", error.message);
        return;
      }

      Alert.alert("Sucesso", "Seu nome foi atualizado.");
    } catch {
      Alert.alert("Erro", "Não foi possível atualizar seu nome.");
    } finally {
      setSalvandoNome(false);
    }
  }

  async function escolherFoto() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissao.granted) {
      Alert.alert(
        "Permissão necessária",
        "Permita o acesso à galeria para escolher sua foto de perfil.",
      );
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (resultado.canceled || !resultado.assets[0]) {
      return;
    }

    const imagem = resultado.assets[0];
    setEnviandoFoto(true);

    try {
      const resposta = await fetch(imagem.uri);
      const arquivo = await resposta.blob();

      const extensaoEncontrada = imagem.uri.match(/\.(jpg|jpeg|png|webp)$/i);
      const extensao = extensaoEncontrada
        ? extensaoEncontrada[1].toLowerCase()
        : "jpg";

      const tipoArquivo =
        imagem.mimeType ||
        (extensao === "png"
          ? "image/png"
          : extensao === "webp"
            ? "image/webp"
            : "image/jpeg");

      const caminho = `${usuario.id}/avatar.${extensao}`;

      const { error: erroUpload } = await supabase.storage
        .from("avatars")
        .upload(caminho, arquivo, {
          upsert: true,
          contentType: tipoArquivo,
        });

      if (erroUpload) {
        throw erroUpload;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(caminho);

      const urlFoto = `${data.publicUrl}?v=${Date.now()}`;

      const { error: erroPerfil } = await supabase.auth.updateUser({
        data: {
          ...usuario.user_metadata,
          nome: nome.trim() || nomeAtual,
          foto_url: urlFoto,
        },
      });

      if (erroPerfil) {
        throw erroPerfil;
      }

      setFotoUrl(urlFoto);
      Alert.alert("Sucesso", "Sua foto de perfil foi atualizada.");
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível enviar a foto.";

      Alert.alert("Erro ao atualizar foto", mensagem);
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function alterarSenha() {
    if (senhaAtualizada.length < 6) {
      Alert.alert("Atenção", "A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (senhaAtualizada !== confirmacaoSenha) {
      Alert.alert("Atenção", "As senhas digitadas não são iguais.");
      return;
    }

    setAlterandoSenha(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: senhaAtualizada,
      });

      if (error) {
        Alert.alert("Erro", error.message);
        return;
      }

      setSenhaAtualizada("");
      setConfirmacaoSenha("");

      Alert.alert("Sucesso", "Sua senha foi alterada.");
    } catch {
      Alert.alert("Erro", "Não foi possível alterar sua senha.");
    } finally {
      setAlterandoSenha(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={estilos.textoVoltar}>‹ Voltar</Text>
        </TouchableOpacity>

        <Text style={estilos.marca}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Meu perfil</Text>
        <Text style={estilos.subtitulo}>
          Gerencie suas informações pessoais.
        </Text>

        <View style={estilos.cartaoFoto}>
          <TouchableOpacity
            style={estilos.areaFoto}
            onPress={escolherFoto}
            disabled={enviandoFoto}
          >
            {fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={estilos.foto} />
            ) : (
              <View style={estilos.fotoVazia}>
                <Text style={estilos.letraAvatar}>
                  {(nome.trim() || usuario.email || "A")
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}

            <View style={estilos.botaoCamera}>
              <Text style={estilos.iconeCamera}>✎</Text>
            </View>
          </TouchableOpacity>

          {enviandoFoto ? (
            <ActivityIndicator color="#35D07F" style={estilos.carregandoFoto} />
          ) : (
            <TouchableOpacity onPress={escolherFoto}>
              <Text style={estilos.linkFoto}>Alterar foto</Text>
            </TouchableOpacity>
          )}

          <Text style={estilos.email}>{usuario.email}</Text>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Informações pessoais</Text>

          <Text style={estilos.rotulo}>Nome</Text>
          <TextInput
            style={estilos.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Seu nome"
            placeholderTextColor="#828A85"
            autoCapitalize="words"
            editable={!salvandoNome}
          />

          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              salvandoNome && estilos.botaoDesabilitado,
            ]}
            onPress={salvarNome}
            disabled={salvandoNome}
          >
            {salvandoNome ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>Salvar nome</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Segurança</Text>
          <Text style={estilos.descricaoSecao}>
            Escolha uma nova senha para sua conta.
          </Text>

          <Text style={estilos.rotulo}>Nova senha</Text>
          <TextInput
            style={estilos.input}
            value={senhaAtualizada}
            onChangeText={setSenhaAtualizada}
            placeholder="Mínimo de 6 caracteres"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            editable={!alterandoSenha}
          />

          <Text style={estilos.rotulo}>Confirmar nova senha</Text>
          <TextInput
            style={estilos.input}
            value={confirmacaoSenha}
            onChangeText={setConfirmacaoSenha}
            placeholder="Digite a senha novamente"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            editable={!alterandoSenha}
          />

          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              alterandoSenha && estilos.botaoDesabilitado,
            ]}
            onPress={alterarSenha}
            disabled={alterandoSenha}
          >
            {alterandoSenha ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>Alterar senha</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101312",
  },
  conteudo: {
    paddingHorizontal: 22,
    paddingTop: 58,
    paddingBottom: 36,
  },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 22,
  },
  textoVoltar: {
    color: "#35D07F",
    fontSize: 16,
    fontWeight: "700",
  },
  marca: {
    color: "#35D07F",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F0F3F1",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitulo: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  cartaoFoto: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 20,
    alignItems: "center",
    padding: 24,
    marginBottom: 18,
  },
  areaFoto: {
    position: "relative",
    marginBottom: 14,
  },
  foto: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "#35D07F",
  },
  fotoVazia: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#244C36",
    borderWidth: 2,
    borderColor: "#35D07F",
    alignItems: "center",
    justifyContent: "center",
  },
  letraAvatar: {
    color: "#35D07F",
    fontSize: 44,
    fontWeight: "800",
  },
  botaoCamera: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#35D07F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#191E1B",
  },
  iconeCamera: {
    color: "#101312",
    fontSize: 20,
    fontWeight: "800",
  },
  linkFoto: {
    color: "#35D07F",
    fontSize: 14,
    fontWeight: "700",
  },
  carregandoFoto: {
    marginVertical: 5,
  },
  email: {
    color: "#A4ADA7",
    fontSize: 13,
    marginTop: 12,
  },
  cartao: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 18,
  },
  descricaoSecao: {
    color: "#A4ADA7",
    fontSize: 13,
    marginTop: -10,
    marginBottom: 18,
    lineHeight: 19,
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#F0F3F1",
    marginBottom: 12,
  },
  botaoPrincipal: {
    backgroundColor: "#35D07F",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  botaoDesabilitado: {
    opacity: 0.65,
  },
  textoBotaoPrincipal: {
    color: "#101312",
    fontWeight: "800",
    fontSize: 15,
  },
});
