import { Linking, Platform } from "react-native";
import { supabase } from "../supabase";
import { Alert } from "./alerta";
import { prepararAuthAndroid, abrirGoogleAndroid, cancelarAuthAndroid } from "./authAndroid";

export type ModoAutenticacao = "login" | "cadastro" | "recuperar";

type Opcoes = {
  nome: string;
  email: string;
  senha: string;
  corPadrao: string;
  urlAplicativo: string;
  setEnviando: (valor: boolean) => void;
  setModo: (valor: ModoAutenticacao) => void;
  setSenha: (valor: string) => void;
};

export function criarAcoesAutenticacao({
  nome, email, senha, corPadrao, urlAplicativo, setEnviando, setModo, setSenha,
}: Opcoes) {
  function validarEmail(valor: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());
  }

  async function entrar() {
    if (!validarEmail(email)) {
      Alert.alert("Atenção", "Digite um e-mail válido.");
      return;
    }

    if (!senha) {
      Alert.alert("Atenção", "Digite sua senha.");
      return;
    }

    setEnviando(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        Alert.alert("Não foi possível entrar", error.message);
      }
    } catch {
      Alert.alert("Erro", "Não foi possível conectar ao serviço.");
    } finally {
      setEnviando(false);
    }
  }

  async function entrarComGoogle() {
    setEnviando(true);

    try {
      const pedido = await prepararAuthAndroid("google");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: pedido?.redirectTo ?? urlAplicativo,
          skipBrowserRedirect: !!pedido || Platform.OS !== "web",
        },
      });

      if (error) {
        await cancelarAuthAndroid().catch(() => {});
        Alert.alert("Não foi possível entrar com Google", error.message);
        return;
      }

      if (pedido && data.url) {
        await abrirGoogleAndroid(data.url, pedido.state);
      } else if (Platform.OS !== "web" && data.url) {
        await Linking.openURL(data.url);
      }
    } catch (erro) {
      await cancelarAuthAndroid().catch(() => {});
      Alert.alert(
        "Erro",
        erro instanceof Error
          ? erro.message
          : "Não foi possível iniciar o login com Google.",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function cadastrar() {
    if (!nome.trim()) {
      Alert.alert("Atenção", "Digite seu nome.");
      return;
    }

    if (!validarEmail(email)) {
      Alert.alert("Atenção", "Digite um e-mail válido.");
      return;
    }

    if (senha.length < 6) {
      Alert.alert("Atenção", "A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setEnviando(true);

    try {
      const pedido = await prepararAuthAndroid("signup");
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          emailRedirectTo: pedido?.redirectTo ?? urlAplicativo,
          data: {
            nome: nome.trim(),
            tema_cor: corPadrao,
          },
        },
      });

      if (error) {
        await cancelarAuthAndroid().catch(() => {});
        Alert.alert("Não foi possível cadastrar", error.message);
        return;
      }

      if (data.session) {
        await cancelarAuthAndroid().catch(() => {});
        Alert.alert("Cadastro realizado", "Sua conta foi criada com sucesso.");
      } else {
        setModo("login");
        setSenha("");

        Alert.alert(
          "Confira seu e-mail",
          "Sua conta foi cadastrada. Se a confirmação de e-mail estiver habilitada, abra a mensagem enviada pelo Supabase e confirme sua conta antes de entrar.",
        );
      }
    } catch {
      Alert.alert("Erro", "Não foi possível conectar ao serviço.");
    } finally {
      setEnviando(false);
    }
  }

  async function recuperarSenha() {
    if (!validarEmail(email)) {
      Alert.alert("Atenção", "Digite o e-mail da sua conta.");
      return;
    }

    setEnviando(true);

    try {
      const pedido = await prepararAuthAndroid("recovery");
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: pedido?.redirectTo ?? urlAplicativo,
        },
      );

      if (error) {
        await cancelarAuthAndroid().catch(() => {});
        Alert.alert("Não foi possível enviar", error.message);
        return;
      }

      Alert.alert(
        "Solicitação enviada",
        "Se o endereço estiver cadastrado, você receberá as instruções para redefinir sua senha.",
      );

      setModo("login");
    } catch {
      Alert.alert("Erro", "Não foi possível conectar ao serviço.");
    } finally {
      setEnviando(false);
    }
  }
  return { entrar, entrarComGoogle, cadastrar, recuperarSenha };
}
