import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  avisarAtualizacao,
  verificarAtualizacao,
} from "./servicos/atualizacao";
import {
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import {
  CardStyleInterpolators,
  createStackNavigator,
} from "@react-navigation/stack";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Perfil from "./telas/Perfil";
import Frequencia from "./telas/Frequencia";
import TreinoDoDia from "./telas/TreinoDoDia";
import MeusTreinos from "./telas/MeusTreinos";
import MeusCardios from "./telas/MeusCardios";
import EvolucaoFisica from "./telas/EvolucaoFisica";
import HistoricoTreinos from "./telas/HistoricoTreinos";
import TreinoAtivo from "./telas/TreinoAtivo";
import EvolucaoTreinos from "./telas/EvolucaoTreinos";
import ResumoSemanal from "./telas/ResumoSemanal";
import ComunidadeFamilia from "./telas/ComunidadeFamilia";
import NavegacaoInferior from "./telas/NavegacaoInferior";
import NavegacaoVoltarGlobal from "./telas/NavegacaoVoltarGlobal";

type ModoAutenticacao = "login" | "cadastro" | "recuperar";

type Rotas = {
  Inicio: undefined;
  perfil: undefined;
  treinos: undefined;
  cardios: undefined;
  evolucao: undefined;
  historico: undefined;
  frequencia: undefined;
  evolucaoTreinos: undefined;
  treinoAtivo: { planId: string; planName: string };
  comunidade: undefined;
};

const Pilha = createStackNavigator<Rotas>();
const referenciaNavegacao = createNavigationContainerRef<Rotas>();

const COR_PADRAO = "#35D07F";

const CORES_TEMA = [
  "#35D07F",
  "#0878D1",
  "#FF5CA8",
  "#A78BFA",
  "#F05252",
  "#FB923C",
  "#22D3EE",
  "#FACC15",
];

const URL_APLICATIVO = "https://treino-familia-zeta.vercel.app/";

function obterCorTema(valor: unknown): string {
  if (typeof valor === "string" && CORES_TEMA.includes(valor)) {
    return valor;
  }

  return COR_PADRAO;
}

const telas = [
  {
    id: "treinos",
    titulo: "Meus treinos",
    descricao: "Acesse seus treinos e exercícios",
    emoji: "🏋️",
  },
  {
    id: "cardios",
    titulo: "Meus Cardios",
    descricao: "Cadastre e acompanhe seus cardios",
    emoji: "🏃",
  },
  {
    id: "evolucao",
    titulo: "Evolução física",
    descricao: "Acompanhe seu peso e suas medidas",
    emoji: "📈",
  },
  {
    id: "evolucaoTreinos",
    titulo: "Evolução dos treinos",
    descricao: "Compare cargas, repetições e volume por exercício",
    emoji: "📊",
  },
  {
    id: "historico",
    titulo: "Histórico",
    descricao: "Consulte seus treinos anteriores",
    emoji: "📋",
  },
  {
    id: "frequencia",
    titulo: "Frequência",
    descricao: "Veja sua frequência de treinamento",
    emoji: "📅",
  },
] as const;

export default function App() {
  const versaoAvisada = useRef<string | null>(null);
  const verificacaoEmAndamento = useRef(false);
  const toqueInicialWeb = useRef<{ x: number; y: number } | null>(null);

  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<ModoAutenticacao>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [corTema, setCorTema] = useState(COR_PADRAO);
  const [rotaAtual, setRotaAtual] = useState<keyof Rotas>("Inicio");
  const assinaturaHistoricoWeb = useRef("");
  const ignorarProximoHistoricoWeb = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const raiz = document.getElementById("root");
    if (!raiz) return;

    const estilosOriginais = {
      alturaDocumento: document.documentElement.style.height,
      alturaCorpo: document.body.style.height,
      alturaMinimaCorpo: document.body.style.minHeight,
      margemCorpo: document.body.style.margin,
      overflowCorpo: document.body.style.overflow,
      fundoCorpo: document.body.style.backgroundColor,
      alturaRaiz: raiz.style.height,
      alturaMinimaRaiz: raiz.style.minHeight,
      larguraRaiz: raiz.style.width,
      overflowRaiz: raiz.style.overflow,
      fundoRaiz: raiz.style.backgroundColor,
    };

    const estaInstaladoComoAplicativo =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    const alturaAplicativo = estaInstaladoComoAplicativo ? "100lvh" : "100dvh";

    document.documentElement.style.height = "100%";
    document.body.style.height = alturaAplicativo;
    document.body.style.minHeight = alturaAplicativo;
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.backgroundColor = "#101312";
    raiz.style.height = alturaAplicativo;
    raiz.style.minHeight = alturaAplicativo;
    raiz.style.width = "100%";
    raiz.style.overflow = "hidden";
    raiz.style.backgroundColor = "#101312";

    return () => {
      document.documentElement.style.height = estilosOriginais.alturaDocumento;
      document.body.style.height = estilosOriginais.alturaCorpo;
      document.body.style.minHeight = estilosOriginais.alturaMinimaCorpo;
      document.body.style.margin = estilosOriginais.margemCorpo;
      document.body.style.overflow = estilosOriginais.overflowCorpo;
      document.body.style.backgroundColor = estilosOriginais.fundoCorpo;
      raiz.style.height = estilosOriginais.alturaRaiz;
      raiz.style.minHeight = estilosOriginais.alturaMinimaRaiz;
      raiz.style.width = estilosOriginais.larguraRaiz;
      raiz.style.overflow = estilosOriginais.overflowRaiz;
      raiz.style.backgroundColor = estilosOriginais.fundoRaiz;
    };
  }, []);

  function atualizarRotaAtual() {
    const rota = referenciaNavegacao.getCurrentRoute();
    const estado = referenciaNavegacao.getRootState();
    if (!rota) return;

    setRotaAtual(rota.name as keyof Rotas);

    if (Platform.OS !== "web" || typeof window === "undefined" || !estado) {
      return;
    }

    const assinatura = `${estado.index}:${estado.routes
      .map((item) => `${item.key}:${item.name}`)
      .join("|")}`;
    if (assinatura === assinaturaHistoricoWeb.current) return;

    assinaturaHistoricoWeb.current = assinatura;
    if (ignorarProximoHistoricoWeb.current) {
      ignorarProximoHistoricoWeb.current = false;
      return;
    }

    window.history.pushState(
      {
        treinoFamilia: true,
        assinatura,
        rota: rota.name,
        parametros: rota.params ?? null,
      },
      "",
      window.location.href,
    );
  }

  function atualizarSessao(novaSessao: Session | null) {
    setSessao(novaSessao);
    setCorTema(obterCorTema(novaSessao?.user.user_metadata?.tema_cor));
  }

  useEffect(() => {
    if (Platform.OS !== "web" || !sessao || typeof window === "undefined") {
      return;
    }

    function tratarVoltaDoNavegador(evento: PopStateEvent) {
      if (!referenciaNavegacao.isReady()) return;
      const estadoAnterior = evento.state as {
        treinoFamilia?: boolean;
        assinatura?: string;
        rota?: string;
        parametros?: unknown;
      } | null;
      if (!estadoAnterior?.treinoFamilia || !estadoAnterior.rota) return;

      const rotaAtualWeb = referenciaNavegacao.getCurrentRoute()?.name;
      if (
        estadoAnterior.assinatura &&
        estadoAnterior.assinatura === assinaturaHistoricoWeb.current
      ) {
        if (referenciaNavegacao.canGoBack()) {
          ignorarProximoHistoricoWeb.current = true;
          referenciaNavegacao.goBack();
        }
        return;
      }

      ignorarProximoHistoricoWeb.current = true;
      try {
        if (
          estadoAnterior.rota === rotaAtualWeb &&
          referenciaNavegacao.canGoBack()
        ) {
          referenciaNavegacao.goBack();
          return;
        }
        referenciaNavegacao.navigate(
          estadoAnterior.rota as keyof Rotas,
          estadoAnterior.parametros as never,
        );
      } catch {
        ignorarProximoHistoricoWeb.current = false;
        if (referenciaNavegacao.canGoBack()) referenciaNavegacao.goBack();
      }
    }

    window.addEventListener("popstate", tratarVoltaDoNavegador);
    return () => window.removeEventListener("popstate", tratarVoltaDoNavegador);
  }, [sessao]);

  useEffect(() => {
    if (Platform.OS !== "android" || !sessao) {
      return;
    }

    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!referenciaNavegacao.isReady()) {
        return true;
      }

      if (referenciaNavegacao.canGoBack()) {
        referenciaNavegacao.goBack();
        return true;
      }

      const rota = referenciaNavegacao.getCurrentRoute()?.name;
      if (rota && rota !== "Inicio") {
        referenciaNavegacao.navigate("Inicio");
        return true;
      }

      Alert.alert(
        "Sair do Treino Família?",
        "Deseja realmente sair do aplicativo?",
        [
          { text: "Continuar no app", style: "cancel" },
          {
            text: "Sair",
            style: "destructive",
            onPress: () => BackHandler.exitApp(),
          },
        ],
      );
      return true;
    });

    return () => assinatura.remove();
  }, [sessao]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      return;
    }

    function iniciarToque(evento: TouchEvent) {
      if (evento.touches.length !== 1) {
        toqueInicialWeb.current = null;
        return;
      }

      const toque = evento.touches[0];

      toqueInicialWeb.current =
        toque.clientX <= 36 ? { x: toque.clientX, y: toque.clientY } : null;
    }

    function finalizarToque(evento: TouchEvent) {
      const inicio = toqueInicialWeb.current;
      toqueInicialWeb.current = null;

      if (!inicio || evento.changedTouches.length !== 1) {
        return;
      }

      const toque = evento.changedTouches[0];
      const deslocamentoX = toque.clientX - inicio.x;
      const deslocamentoY = toque.clientY - inicio.y;

      const eDeslizeParaVoltar =
        deslocamentoX >= 65 &&
        Math.abs(deslocamentoX) > Math.abs(deslocamentoY) * 1.3;

      if (
        eDeslizeParaVoltar &&
        referenciaNavegacao.isReady() &&
        referenciaNavegacao.canGoBack()
      ) {
        referenciaNavegacao.goBack();
      }
    }

    function cancelarToque() {
      toqueInicialWeb.current = null;
    }

    document.addEventListener("touchstart", iniciarToque, { passive: true });
    document.addEventListener("touchend", finalizarToque, { passive: true });
    document.addEventListener("touchcancel", cancelarToque, { passive: true });

    return () => {
      document.removeEventListener("touchstart", iniciarToque);
      document.removeEventListener("touchend", finalizarToque);
      document.removeEventListener("touchcancel", cancelarToque);
    };
  }, []);

  useEffect(() => {
    let componenteAtivo = true;

    async function carregarSessao() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          Alert.alert("Erro", "Não foi possível verificar sua sessão.");
        }

        if (componenteAtivo) {
          atualizarSessao(data.session);
          setCarregando(false);
        }
      } catch {
        if (componenteAtivo) {
          Alert.alert("Erro", "Não foi possível verificar sua sessão.");
          setCarregando(false);
        }
      }
    }

    carregarSessao();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      atualizarSessao(novaSessao);
      setCarregando(false);
    });

    return () => {
      componenteAtivo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let componenteAtivo = true;
    let conectadoAoWifi = false;

    async function consultarAtualizacao() {
      if (!componenteAtivo || verificacaoEmAndamento.current) {
        return;
      }

      verificacaoEmAndamento.current = true;

      try {
        const atualizacao = await verificarAtualizacao();

        if (
          componenteAtivo &&
          atualizacao &&
          versaoAvisada.current !== atualizacao.versao
        ) {
          versaoAvisada.current = atualizacao.versao;

          avisarAtualizacao(
            atualizacao.versao,
            atualizacao.url,
            atualizacao.mensagem,
          );
        }
      } catch {
      } finally {
        verificacaoEmAndamento.current = false;
      }
    }

    const cancelarMonitoramento = NetInfo.addEventListener((estado) => {
      const estaNoWifi = estado.type === "wifi" && estado.isConnected === true;

      if (estaNoWifi && !conectadoAoWifi) {
        consultarAtualizacao();
      }

      if (!estaNoWifi) {
        versaoAvisada.current = null;
      }

      conectadoAoWifi = estaNoWifi;
    });

    const monitorarAplicativo = AppState.addEventListener(
      "change",
      (estado) => {
        if (estado === "active") {
          consultarAtualizacao();
        }
      },
    );

    NetInfo.fetch()
      .then((estado) => {
        if (estado.type === "wifi" && estado.isConnected === true) {
          conectadoAoWifi = true;
          consultarAtualizacao();
        }
      })
      .catch(() => {});

    return () => {
      componenteAtivo = false;
      cancelarMonitoramento();
      monitorarAplicativo.remove();
    };
  }, []);

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
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: URL_APLICATIVO,
          skipBrowserRedirect: Platform.OS !== "web",
        },
      });

      if (error) {
        Alert.alert("Não foi possível entrar com Google", error.message);
        return;
      }

      if (Platform.OS !== "web" && data.url) {
        await Linking.openURL(data.url);
      }
    } catch {
      Alert.alert("Erro", "Não foi possível iniciar o login com Google.");
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
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          emailRedirectTo: URL_APLICATIVO,
          data: {
            nome: nome.trim(),
            tema_cor: COR_PADRAO,
          },
        },
      });

      if (error) {
        Alert.alert("Não foi possível cadastrar", error.message);
        return;
      }

      if (data.session) {
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
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: URL_APLICATIVO,
        },
      );

      if (error) {
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

  async function sair() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      Alert.alert("Erro", "Não foi possível sair da sua conta.");
      return;
    }

    setNome("");
    setEmail("");
    setSenha("");
    setModo("login");
    setCorTema(COR_PADRAO);
  }

  if (carregando) {
    return (
      <View style={estilos.carregando}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.textoCarregando}>
          Carregando Treino Família...
        </Text>
      </View>
    );
  }

  if (!sessao) {
    return (
      <KeyboardAvoidingView
        style={estilos.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar barStyle="light-content" />

        <ScrollView
          contentContainerStyle={estilos.conteudoAutenticacao}
          keyboardShouldPersistTaps="handled"
        >
          <View style={estilos.logoContainer}>
            <Text style={estilos.logo}>💪</Text>
            <Text style={estilos.titulo}>Treino Família</Text>
            <Text style={estilos.subtitulo}>
              Evoluindo juntos, treino após treino.
            </Text>
          </View>

          <View style={estilos.cartaoAutenticacao}>
            <Text style={estilos.tituloFormulario}>
              {modo === "login"
                ? "Bem-vindo de volta!"
                : modo === "cadastro"
                  ? "Crie sua conta"
                  : "Recuperar senha"}
            </Text>

            <Text style={estilos.descricaoFormulario}>
              {modo === "login"
                ? "Entre para acessar seus treinos."
                : modo === "cadastro"
                  ? "Cadastre-se para começar sua jornada."
                  : "Informe seu e-mail para receber as instruções."}
            </Text>

            {modo === "cadastro" && (
              <View style={estilos.campoContainer}>
                <Text style={estilos.rotulo}>Nome</Text>
                <TextInput
                  style={estilos.input}
                  placeholder="Seu nome"
                  placeholderTextColor="#828A85"
                  value={nome}
                  onChangeText={setNome}
                  autoCapitalize="words"
                  editable={!enviando}
                />
              </View>
            )}

            <View style={estilos.campoContainer}>
              <Text style={estilos.rotulo}>E-mail</Text>
              <TextInput
                style={estilos.input}
                placeholder="seuemail@exemplo.com"
                placeholderTextColor="#828A85"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!enviando}
              />
            </View>

            {modo !== "recuperar" && (
              <View style={estilos.campoContainer}>
                <Text style={estilos.rotulo}>Senha</Text>
                <TextInput
                  style={estilos.input}
                  placeholder="Mínimo de 6 caracteres"
                  placeholderTextColor="#828A85"
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!enviando}
                />
              </View>
            )}

            <TouchableOpacity
              style={[
                estilos.botaoPrincipal,
                { backgroundColor: corTema },
                enviando && estilos.botaoDesabilitado,
              ]}
              onPress={() => {
                if (modo === "login") {
                  entrar();
                } else if (modo === "cadastro") {
                  cadastrar();
                } else {
                  recuperarSenha();
                }
              }}
              disabled={enviando}
            >
              {enviando ? (
                <ActivityIndicator color="#101312" />
              ) : (
                <Text style={estilos.textoBotaoPrincipal}>
                  {modo === "login"
                    ? "Entrar"
                    : modo === "cadastro"
                      ? "Criar conta"
                      : "Enviar instruções"}
                </Text>
              )}
            </TouchableOpacity>

            {modo === "login" && (
              <>
                <TouchableOpacity
                  style={[
                    estilos.botaoGoogle,
                    enviando && estilos.botaoDesabilitado,
                  ]}
                  onPress={entrarComGoogle}
                  disabled={enviando}
                  activeOpacity={0.8}
                >
                  <Text style={estilos.googleLetra}>G</Text>
                  <Text style={estilos.textoBotaoGoogle}>
                    Continuar com Google
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={estilos.linkContainer}
                  onPress={() => setModo("recuperar")}
                  disabled={enviando}
                >
                  <Text style={[estilos.link, { color: corTema }]}>
                    Esqueci minha senha
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={estilos.divisor} />

            <Text style={estilos.textoAlternativo}>
              {modo === "login"
                ? "Ainda não tem uma conta?"
                : modo === "cadastro"
                  ? "Já tem uma conta?"
                  : "Lembrou sua senha?"}
            </Text>

            <TouchableOpacity
              style={[estilos.botaoSecundario, { borderColor: corTema }]}
              onPress={() => {
                setModo(modo === "cadastro" ? "login" : "cadastro");
                setSenha("");
              }}
              disabled={enviando || modo === "recuperar"}
            >
              <Text style={[estilos.textoBotaoSecundario, { color: corTema }]}>
                {modo === "cadastro" ? "Fazer login" : "Criar uma conta"}
              </Text>
            </TouchableOpacity>

            {modo === "recuperar" && (
              <TouchableOpacity
                style={estilos.linkContainer}
                onPress={() => setModo("login")}
              >
                <Text style={[estilos.link, { color: corTema }]}>
                  Voltar para o login
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={estilos.rodape}>
            Seu espaço para acompanhar sua evolução.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const nomeCompleto =
    sessao.user.user_metadata?.nome ||
    sessao.user.user_metadata?.full_name ||
    sessao.user.email?.split("@")[0] ||
    "Atleta";

  const nomeUsuario = nomeCompleto.trim().split(/\s+/).slice(0, 2).join(" ");

  const fotoUrl =
    typeof sessao.user.user_metadata?.foto_url === "string"
      ? sessao.user.user_metadata.foto_url
      : typeof sessao.user.user_metadata?.avatar_url === "string"
        ? sessao.user.user_metadata.avatar_url
        : null;

  return (
    <NavigationContainer
      ref={referenciaNavegacao}
      onReady={atualizarRotaAtual}
      onStateChange={atualizarRotaAtual}
    >
      <View style={{ flex: 1, backgroundColor: "#101312" }}>
        <StatusBar barStyle="light-content" />

        <Pilha.Navigator
          initialRouteName="Inicio"
          screenOptions={{
            headerShown: false,
            gestureEnabled: Platform.OS !== "web",
            gestureDirection: "horizontal",
            gestureResponseDistance: 40,
            gestureVelocityImpact: 0.3,
            cardOverlayEnabled: true,
            cardShadowEnabled: true,
            detachPreviousScreen: Platform.OS === "web" ? false : undefined,
            cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
            transitionSpec: {
              open: {
                animation: "timing",
                config: {
                  duration: 280,
                },
              },
              close: {
                animation: "timing",
                config: {
                  duration: 240,
                },
              },
            },
            cardStyle: {
              flex: 1,
              backgroundColor:
                Platform.OS === "web" ? "transparent" : "#101312",
            },
          }}
        >
          <Pilha.Screen name="Inicio">
            {({ navigation }) => (
              <View style={estilos.container}>
                <ScrollView
                  contentContainerStyle={estilos.conteudoHome}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={estilos.topoHome}>
                    <View style={estilos.informacoesUsuario}>
                      <Text style={[estilos.marcaPequena, { color: corTema }]}>
                        TREINO FAMÍLIA
                      </Text>

                      <Text
                        style={estilos.tituloHome}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        Olá, {nomeUsuario}!
                      </Text>

                      <Text style={estilos.subtituloHome}>
                        Vamos treinar hoje?
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        estilos.avatar,
                        {
                          backgroundColor: `${corTema}30`,
                          borderColor: corTema,
                        },
                      ]}
                      onPress={() => navigation.navigate("perfil")}
                      activeOpacity={0.8}
                    >
                      {fotoUrl ? (
                        <Image
                          source={{ uri: fotoUrl }}
                          style={estilos.imagemAvatar}
                        />
                      ) : (
                        <Text style={[estilos.avatarTexto, { color: corTema }]}>
                          {nomeUsuario.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View
                    style={[
                      estilos.banner,
                      {
                        backgroundColor: `${corTema}18`,
                        borderColor: `${corTema}70`,
                      },
                    ]}
                  >
                    <Text style={estilos.bannerEmoji}>🔥</Text>

                    <View style={estilos.bannerTextoContainer}>
                      <Text style={estilos.bannerTitulo}>
                        Sua evolução começa aqui
                      </Text>

                      <Text style={estilos.bannerDescricao}>
                        Mantenha a consistência e supere seus limites.
                      </Text>
                    </View>
                  </View>

                  <TreinoDoDia
                    onAbrirProgramacao={() => navigation.navigate("frequencia")}
                    onAbrirTreino={() => navigation.navigate("treinos")}
                    corTema={corTema}
                  />

                  <ResumoSemanal corTema={corTema} />

                  <Text style={estilos.tituloSecao}>Seu espaço de treino</Text>

                  <View style={estilos.listaCartoes}>
                    {telas.map((tela) => (
                      <TouchableOpacity
                        key={tela.id}
                        style={estilos.cartaoHome}
                        onPress={() => navigation.navigate(tela.id)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            estilos.iconeCartao,
                            { backgroundColor: `${corTema}20` },
                          ]}
                        >
                          <Text style={estilos.emojiCartao}>{tela.emoji}</Text>
                        </View>

                        <View style={estilos.textoCartao}>
                          <Text style={estilos.tituloCartao}>
                            {tela.titulo}
                          </Text>

                          <Text style={estilos.descricaoCartao}>
                            {tela.descricao}
                          </Text>
                        </View>

                        <Text style={[estilos.setaCartao, { color: corTema }]}>
                          ›
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={estilos.botaoSair}
                    onPress={sair}
                    activeOpacity={0.8}
                  >
                    <Text style={estilos.textoBotaoSair}>Sair da conta</Text>
                  </TouchableOpacity>

                  <Text style={estilos.rodapeHome}>
                    Treino Família · Evoluindo juntos
                  </Text>
                </ScrollView>
              </View>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="perfil">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <Perfil
                  usuario={sessao.user}
                  onVoltar={() => navigation.goBack()}
                  onTemaAlterado={setCorTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="treinos">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <MeusTreinos
                  onVoltar={() => navigation.goBack()}
                  onIniciarTreino={(treino) =>
                    navigation.navigate("treinoAtivo", {
                      planId: treino.id,
                      planName: treino.name,
                    })
                  }
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="cardios">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <MeusCardios
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="evolucao">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <EvolucaoFisica
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="historico">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <HistoricoTreinos
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="frequencia">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <Frequencia
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="comunidade">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <ComunidadeFamilia corTema={corTema} />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="evolucaoTreinos">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <EvolucaoTreinos
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="treinoAtivo">
            {({ navigation, route }) => (
              <NavegacaoVoltarGlobal
                onVoltar={() => navigation.goBack()}
                ativo={navigation.canGoBack()}
              >
                <TreinoAtivo
                  route={route}
                  onVoltar={() => navigation.goBack()}
                  corTema={corTema}
                />
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>
        </Pilha.Navigator>
        {sessao ? (
          <NavegacaoInferior
            corTema={corTema}
            rotaAtual={rotaAtual}
            onNavegar={(rota) => {
              if (referenciaNavegacao.isReady()) {
                referenciaNavegacao.navigate(rota);
              }
            }}
          />
        ) : null}
      </View>
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
  },
  carregando: {
    flex: 1,
    backgroundColor: "#101312",
    justifyContent: "center",
    alignItems: "center",
  },
  textoCarregando: {
    color: "#F0F3F1",
    marginTop: 14,
    fontSize: 15,
  },
  conteudoAutenticacao: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    fontSize: 48,
    marginBottom: 12,
  },
  titulo: {
    fontSize: 30,
    fontWeight: "800",
    color: "#F0F3F1",
    textAlign: "center",
  },
  subtitulo: {
    fontSize: 14,
    color: "#A4ADA7",
    marginTop: 8,
    textAlign: "center",
  },
  cartaoAutenticacao: {
    backgroundColor: "#191E1B",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2B332E",
    padding: 22,
  },
  tituloFormulario: {
    fontSize: 23,
    fontWeight: "800",
    color: "#F0F3F1",
  },
  descricaoFormulario: {
    fontSize: 14,
    color: "#A4ADA7",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  campoContainer: {
    marginBottom: 17,
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
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
  },
  botaoPrincipal: {
    backgroundColor: COR_PADRAO,
    paddingVertical: 16,
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
    fontSize: 16,
  },
  botaoGoogle: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 14,
    gap: 10,
  },
  googleLetra: {
    color: "#4285F4",
    fontSize: 20,
    fontWeight: "800",
  },
  textoBotaoGoogle: {
    color: "#202124",
    fontSize: 15,
    fontWeight: "700",
  },
  linkContainer: {
    alignItems: "center",
    paddingTop: 18,
  },
  link: {
    color: COR_PADRAO,
    fontWeight: "600",
    fontSize: 14,
  },
  divisor: {
    height: 1,
    backgroundColor: "#303832",
    marginVertical: 22,
  },
  textoAlternativo: {
    color: "#A4ADA7",
    textAlign: "center",
    fontSize: 14,
  },
  botaoSecundario: {
    borderWidth: 1,
    borderColor: COR_PADRAO,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 13,
  },
  textoBotaoSecundario: {
    color: COR_PADRAO,
    fontWeight: "700",
    fontSize: 15,
  },
  rodape: {
    color: "#6F7972",
    fontSize: 12,
    textAlign: "center",
    marginTop: 26,
  },
  conteudoHome: {
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 30,
  },
  topoHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 12,
  },
  informacoesUsuario: {
    flex: 1,
    minWidth: 0,
  },
  marcaPequena: {
    color: COR_PADRAO,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  tituloHome: {
    color: "#F0F3F1",
    fontSize: 27,
    fontWeight: "800",
  },
  subtituloHome: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 7,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#244C36",
    borderWidth: 1,
    borderColor: COR_PADRAO,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  imagemAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarTexto: {
    color: COR_PADRAO,
    fontSize: 22,
    fontWeight: "800",
  },
  banner: {
    backgroundColor: "#1B3024",
    borderWidth: 1,
    borderColor: "#2C593E",
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
  },
  bannerEmoji: {
    fontSize: 34,
    marginRight: 14,
  },
  bannerTextoContainer: {
    flex: 1,
  },
  bannerTitulo: {
    color: "#F0F3F1",
    fontSize: 16,
    fontWeight: "800",
  },
  bannerDescricao: {
    color: "#B4C5B9",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 16,
  },
  listaCartoes: {
    gap: 12,
  },
  cartaoHome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 16,
    padding: 16,
  },
  iconeCartao: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  emojiCartao: {
    fontSize: 23,
  },
  textoCartao: {
    flex: 1,
  },
  tituloCartao: {
    color: "#F0F3F1",
    fontSize: 15,
    fontWeight: "700",
  },
  descricaoCartao: {
    color: "#A4ADA7",
    fontSize: 12,
    marginTop: 5,
    lineHeight: 17,
  },
  setaCartao: {
    color: COR_PADRAO,
    fontSize: 28,
    marginLeft: 8,
  },
  botaoSair: {
    borderWidth: 1,
    borderColor: "#454D48",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  textoBotaoSair: {
    color: "#D6DDD8",
    fontWeight: "600",
    fontSize: 14,
  },
  rodapeHome: {
    color: "#6F7972",
    fontSize: 12,
    textAlign: "center",
    marginTop: 22,
  },
});
