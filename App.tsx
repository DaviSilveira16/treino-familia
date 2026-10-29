import React, { Suspense, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  CommonActions,
  createNavigationContainerRef,
  NavigationContainer,
} from "@react-navigation/native";
import {
  CardStyleInterpolators,
  createStackNavigator,
} from "@react-navigation/stack";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Alert } from "./servicos/alerta";
import { fecharModalAtivo } from "./servicos/voltarModal";
import {
  prepararAuthAndroid,
  abrirGoogleAndroid,
  cancelarAuthAndroid,
  processarRetornoAndroid,
} from "./servicos/authAndroid";
import BarraTreinoAtivo from "./telas/BarraTreinoAtivo";
// Importado apenas quando o usuário abre a respectiva tela.
const Perfil = React.lazy(() => import("./telas/Perfil"));
// Importado apenas quando o usuário abre a respectiva tela.
const Frequencia = React.lazy(() => import("./telas/Frequencia"));
import TreinoDoDia from "./telas/TreinoDoDia";
// Importado apenas quando o usuário abre a respectiva tela.
const MeusTreinos = React.lazy(() => import("./telas/MeusTreinos"));
// Importado apenas quando o usuário abre a respectiva tela.
const MeusCardios = React.lazy(() => import("./telas/MeusCardios"));
// Importado apenas quando o usuário abre a respectiva tela.
const EvolucaoFisica = React.lazy(() => import("./telas/EvolucaoFisica"));
// Importado apenas quando o usuário abre a respectiva tela.
const HistoricoTreinos = React.lazy(() => import("./telas/HistoricoTreinos"));
// Importado apenas quando o usuário abre a respectiva tela.
const TreinoAtivo = React.lazy(() => import("./telas/TreinoAtivo"));
// Importado apenas quando o usuário abre a respectiva tela.
const EvolucaoTreinos = React.lazy(() => import("./telas/EvolucaoTreinos"));
import ResumoSemanal from "./telas/ResumoSemanal";
// Importado apenas quando o usuário abre a respectiva tela.
const ComunidadeFamilia = React.lazy(() => import("./telas/ComunidadeFamilia"));
const Nutricao = React.lazy(() => import("./telas/Nutricao"));
import NavegacaoInferior from "./telas/NavegacaoInferior";
import NavegacaoVoltarGlobal from "./telas/NavegacaoVoltarGlobal";
import LimiteDeErro from "./telas/LimiteDeErro";

type ModoAutenticacao = "login" | "cadastro" | "recuperar";

type Rotas = {
  Inicio: undefined;
  perfil: undefined;
  treinos: undefined;
  cardios: undefined;
  evolucao: undefined;
  historico: undefined;
  frequencia: { cardioId?: string } | undefined;
  evolucaoTreinos: undefined;
  treinoAtivo: { planId: string; planName: string };
  comunidade: undefined;
  nutricao: undefined;
};

const Pilha = createStackNavigator<Rotas>();
// A Comunidade é uma aba principal; apenas as páginas abaixo têm voltar.
const ROTAS_COM_BOTAO_VOLTAR = new Set<keyof Rotas>([
  "perfil",
  "treinos",
  "cardios",
  "evolucao",
  "historico",
  "frequencia",
  "evolucaoTreinos",
  "treinoAtivo",
]);

function modoTelaInicialSafari() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const navegador = window.navigator as Navigator & { standalone?: boolean };
  return (
    navegador.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true
  );
}
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

function TelaCarregando({ cor }: { cor: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#101312",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={cor} size="small" />
    </View>
  );
}

function AppConteudo() {
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
  const [semInternet, setSemInternet] = useState(false);
  const [redefinirSenha, setRedefinirSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const ultimaVoltaWeb = useRef(0);

  function atualizarRotaAtual() {
    const rota = referenciaNavegacao.getCurrentRoute();
    if (rota) setRotaAtual(rota.name as keyof Rotas);
  }

  // Volta pela pilha do app, sem acionar o histórico do Safari.
  // Uma proteção breve impede apenas dois eventos do MESMO gesto.
  function voltarComSeguranca() {
    if (fecharModalAtivo()) return;
    const rota = referenciaNavegacao.getCurrentRoute()?.name;
    if (
      !referenciaNavegacao.isReady() ||
      !referenciaNavegacao.canGoBack() ||
      !rota ||
      !ROTAS_COM_BOTAO_VOLTAR.has(rota)
    ) {
      return;
    }
    if (Platform.OS === "web") {
      const agora = Date.now();
      if (agora - ultimaVoltaWeb.current < 180) return;
      ultimaVoltaWeb.current = agora;
    }
    referenciaNavegacao.goBack();
  }

  function atualizarSessao(novaSessao: Session | null) {
    setSessao(novaSessao);
    setCorTema(obterCorTema(novaSessao?.user.user_metadata?.tema_cor));
  }

  useEffect(() => {
    const usuarioId = sessao?.user.id;
    if (!usuarioId || semInternet) return;
    let ativo = true;
    const sincronizar = () => {
      void import("./servicos/nutricaoRepositorio")
        .then((modulo) => ativo ? modulo.sincronizarNutricao(usuarioId) : undefined)
        .catch(() => { /* As pendências ficam no disco e aparecem em Nutrição. */ });
    };
    sincronizar();
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") sincronizar();
    });
    return () => { ativo = false; assinatura.remove(); };
  }, [sessao?.user.id, semInternet]);

  // The existing APK emits this cancelable event before its compatibility fallback.
  const tratarVoltaAndroid = useRef<() => boolean>(() => false);
  useEffect(() => {
    tratarVoltaAndroid.current = () => {
      if (fecharModalAtivo()) return true;
      if (!sessao && modo !== "login") {
        setModo("login");
        return true;
      }
      if (!referenciaNavegacao.isReady()) return true;
      if (referenciaNavegacao.canGoBack()) {
        referenciaNavegacao.goBack();
        return true;
      }
      const rota = referenciaNavegacao.getCurrentRoute()?.name;
      if (rota && rota !== "Inicio") {
        referenciaNavegacao.navigate("Inicio");
        return true;
      }
      return true; // Na raiz, permanece no app.
    };
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const voltar = (evento: Event) => {
      if (tratarVoltaAndroid.current()) evento.preventDefault();
    };
    window.addEventListener("treino-familia:android-back-v1", voltar);
    return () =>
      window.removeEventListener("treino-familia:android-back-v1", voltar);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !/Android/i.test(navigator.userAgent))
      return;
    const guardarNaNavegacao = () =>
      window.history.pushState(
        { treinoFamiliaAndroid: true },
        "",
        window.location.href,
      );
    const aoVoltar = () => {
      tratarVoltaAndroid.current();
      guardarNaNavegacao();
    };
    guardarNaNavegacao();
    guardarNaNavegacao();
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  // IMPORTANTE: não usar pushState/popstate para simular o botão Voltar
  // no iPhone. Ao arrastar, o Safari pode mostrar uma transição da página do
  // histórico (a tela preta de vários segundos no vídeo) antes de devolver
  // o controle ao React. As telas internas usam somente a pilha do app.

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const assinatura = BackHandler.addEventListener("hardwareBackPress", () => {
      if (fecharModalAtivo()) return true;
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

      // O botão do sistema nunca fecha o aplicativo. Na raiz, não há página anterior.
      return true;
    });

    return () => assinatura.remove();
  }, [sessao]);

  useEffect(() => {
    if (typeof document === "undefined" || !modoTelaInicialSafari()) return;

    const podeVoltar = () => {
      if (!referenciaNavegacao.isReady() || !referenciaNavegacao.canGoBack()) {
        return false;
      }
      const nome = referenciaNavegacao.getCurrentRoute()?.name;
      return Boolean(nome && ROTAS_COM_BOTAO_VOLTAR.has(nome));
    };

    function iniciarToque(evento: TouchEvent) {
      toqueInicialWeb.current = null;
      if (evento.touches.length !== 1 || !podeVoltar()) return;
      const toque = evento.touches[0];
      // Zona curta para não confundir o gesto com o deslize de exercícios.
      if (toque.clientX > 65) return;

      const alvo = evento.target;
      const elemento = alvo instanceof Element ? alvo : null;
      const controle = elemento?.closest(
        'button, a, input, textarea, select, [role="button"], [role="link"]',
      );
      // Tocar em «Voltar» ou outro botão deve continuar funcionando.
      if (controle) return;

      toqueInicialWeb.current = { x: toque.clientX, y: toque.clientY };
      // Bloqueia o gesto NATIVO de histórico somente na borda do iPhone.
      // Começar fora dessa faixa continua permitindo rolagem vertical.
      if (toque.clientX <= 30 && evento.cancelable) evento.preventDefault();
    }

    function moverToque(evento: TouchEvent) {
      const inicio = toqueInicialWeb.current;
      if (!inicio || evento.touches.length !== 1) return;
      const toque = evento.touches[0];
      const dx = toque.clientX - inicio.x;
      const dy = toque.clientY - inicio.y;
      if (dx > 12 && dx > Math.abs(dy) * 1.2 && evento.cancelable) {
        evento.preventDefault();
      }
    }

    function finalizarToque(evento: TouchEvent) {
      const inicio = toqueInicialWeb.current;
      toqueInicialWeb.current = null;
      if (!inicio || evento.changedTouches.length !== 1 || !podeVoltar())
        return;
      const toque = evento.changedTouches[0];
      const dx = toque.clientX - inicio.x;
      const dy = toque.clientY - inicio.y;
      if (dx >= 65 && dx > Math.abs(dy) * 1.3) {
        // Sincrônico: troca de tela diretamente no React Navigation, sem
        // histórico, transição do Safari nem espera programada.
        voltarComSeguranca();
      }
    }

    const cancelarToque = () => {
      toqueInicialWeb.current = null;
    };

    document.addEventListener("touchstart", iniciarToque, { passive: false });
    document.addEventListener("touchmove", moverToque, { passive: false });
    document.addEventListener("touchend", finalizarToque, { passive: true });
    document.addEventListener("touchcancel", cancelarToque, { passive: true });

    return () => {
      document.removeEventListener("touchstart", iniciarToque);
      document.removeEventListener("touchmove", moverToque);
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
    } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      atualizarSessao(novaSessao);
      if (evento === "PASSWORD_RECOVERY") setRedefinirSenha(true);
      setCarregando(false);
    });

    return () => {
      componenteAtivo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      typeof location === "undefined" ||
      location.pathname !== "/auth/android/callback"
    )
      return;
    let ativo = true;
    void processarRetornoAndroid()
      .then((retorno) => {
        if (ativo && retorno.recovery) setRedefinirSenha(true);
      })
      .catch((erro) => {
        if (ativo)
          Alert.alert(
            "Retorno ao aplicativo",
            erro instanceof Error
              ? erro.message
              : "Inicie um novo pedido no app.",
          );
      })
      .finally(() => {
        if (ativo) history.replaceState(null, "", "/");
      });
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    let componenteAtivo = true;
    let conectadoAoWifi = false;

    async function consultarAtualizacao() {
      // O site no Safari já recebe a nova versão no próximo carregamento;
      // verificar links de instalação nativa em cada retorno não ajuda na web.
      if (
        Platform.OS === "web" ||
        !componenteAtivo ||
        verificacaoEmAndamento.current
      ) {
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
      if (componenteAtivo) {
        setSemInternet(
          estado.isConnected === false || estado.isInternetReachable === false,
        );
      }
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
        if (componenteAtivo) {
          setSemInternet(
            estado.isConnected === false ||
              estado.isInternetReachable === false,
          );
        }
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
      const pedido = await prepararAuthAndroid("google");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: pedido?.redirectTo ?? URL_APLICATIVO,
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
          emailRedirectTo: pedido?.redirectTo ?? URL_APLICATIVO,
          data: {
            nome: nome.trim(),
            tema_cor: COR_PADRAO,
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
          redirectTo: pedido?.redirectTo ?? URL_APLICATIVO,
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

  async function salvarNovaSenha() {
    if (novaSenha.length < 8 || novaSenha !== confirmarSenha) {
      Alert.alert(
        "Confira a senha",
        "Use ao menos 8 caracteres e repita a mesma senha.",
      );
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setNovaSenha("");
      setConfirmarSenha("");
      setRedefinirSenha(false);
      Alert.alert("Senha atualizada", "Sua nova senha foi salva.");
    } catch {
      Alert.alert(
        "Não foi possível alterar",
        "Tente novamente ou solicite outro link de recuperação.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <View style={estilos.carregando}>
        <StatusBar hidden={true} barStyle="light-content" />
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.textoCarregando}>
          Carregando Treino Família...
        </Text>
      </View>
    );
  }

  if (redefinirSenha && sessao) {
    return (
      <KeyboardAvoidingView
        style={estilos.carregando}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[estilos.cartaoAutenticacao, { width: "90%", maxWidth: 460 }]}
        >
          <Text style={estilos.tituloFormulario}>Defina sua nova senha</Text>
          <TextInput
            accessibilityLabel="Nova senha"
            style={estilos.input}
            placeholder="Ao menos 8 caracteres"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            value={novaSenha}
            onChangeText={setNovaSenha}
          />
          <TextInput
            accessibilityLabel="Confirme a nova senha"
            style={[estilos.input, { marginTop: 12 }]}
            placeholder="Repita a nova senha"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            value={confirmarSenha}
            onChangeText={setConfirmarSenha}
          />
          <TouchableOpacity
            accessibilityRole="button"
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema, marginTop: 16 },
            ]}
            disabled={enviando}
            onPress={() => void salvarNovaSenha()}
          >
            <Text style={estilos.textoBotaoPrincipal}>
              {enviando ? "Salvando..." : "Salvar nova senha"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={estilos.linkContainer}
            onPress={() => {
              setRedefinirSenha(false);
              void sair();
            }}
          >
            <Text style={[estilos.link, { color: corTema }]}>
              Cancelar e sair da conta
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (!sessao) {
    return (
      <KeyboardAvoidingView
        style={estilos.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <StatusBar hidden={true} barStyle="light-content" />

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
      <View style={{ flex: 1, backgroundColor: "#111613" }}>
        <StatusBar hidden={true} barStyle="light-content" />

        <Pilha.Navigator
          initialRouteName="Inicio"
          detachInactiveScreens={true}
          screenOptions={{
            headerShown: false,
            gestureEnabled: Platform.OS === "ios",
            gestureDirection: "horizontal",
            gestureResponseDistance: 40,
            gestureVelocityImpact: 0.3,
            // No Safari, animações de cartões custam toques perdidos durante a transição.
            // Mantemos a animação nativa fora da web e destacamos páginas ocultas.
            animation: Platform.OS === "web" ? "none" : "default",
            cardOverlayEnabled: Platform.OS !== "web",
            cardShadowEnabled: Platform.OS !== "web",
            detachPreviousScreen: true,
            cardStyleInterpolator:
              Platform.OS === "web"
                ? CardStyleInterpolators.forNoAnimation
                : CardStyleInterpolators.forHorizontalIOS,
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
              backgroundColor: "#101312",
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
                    onAbrirTreino={(plano) =>
                      plano
                        ? navigation.navigate("treinoAtivo", plano)
                        : navigation.navigate("treinos")
                    }
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
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <Perfil
                    usuario={sessao.user}
                    onVoltar={voltarComSeguranca}
                    onTemaAlterado={setCorTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="treinos">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <MeusTreinos
                    onVoltar={voltarComSeguranca}
                    onIniciarTreino={(treino) =>
                      navigation.navigate("treinoAtivo", {
                        planId: treino.id,
                        planName: treino.name,
                      })
                    }
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="cardios">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <MeusCardios
                    onRegistrar={(cardioId) =>
                      navigation.navigate("frequencia", { cardioId })
                    }
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="evolucao">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <EvolucaoFisica
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="historico">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <HistoricoTreinos
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="frequencia">
            {({ navigation, route }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <Frequencia
                    cardioInicialId={route.params?.cardioId}
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="comunidade">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <ComunidadeFamilia corTema={corTema} />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="nutricao">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  {sessao ? <Nutricao key={sessao.user.id} usuarioId={sessao.user.id}
                    metadados={sessao.user.user_metadata} corTema={corTema}
                    onAbrirPerfil={() => navigation.navigate("perfil")} /> : null}
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="evolucaoTreinos">
            {({ navigation }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <EvolucaoTreinos
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>

          <Pilha.Screen name="treinoAtivo">
            {({ navigation, route }) => (
              <NavegacaoVoltarGlobal
                onVoltar={voltarComSeguranca}
                ativo={navigation.canGoBack()}
              >
                <Suspense fallback={<TelaCarregando cor={corTema} />}>
                  <TreinoAtivo
                    route={route}
                    onVoltar={voltarComSeguranca}
                    corTema={corTema}
                  />
                </Suspense>
              </NavegacaoVoltarGlobal>
            )}
          </Pilha.Screen>
        </Pilha.Navigator>
        {sessao ? (
          <BarraTreinoAtivo
            key={sessao.user.id}
            usuarioId={sessao.user.id}
            corTema={corTema}
            visivel={rotaAtual !== "treinoAtivo"}
            onRetomar={(plano) => {
              if (referenciaNavegacao.isReady())
                referenciaNavegacao.navigate("treinoAtivo", plano);
            }}
          />
        ) : null}
        {semInternet ? (
          <View style={estilos.avisoSemInternet} accessibilityRole="alert">
            <Text style={estilos.textoSemInternet}>
              Sem internet · alterações pendentes ficam neste aparelho até
              sincronizar.
            </Text>
          </View>
        ) : null}
        {sessao ? (
          <NavegacaoInferior
            corTema={corTema}
            rotaAtual={rotaAtual}
            onNavegar={(rota) => {
              if (!referenciaNavegacao.isReady()) return;
              // Os destinos principais reutilizam a pilha e preservam os modais
              // e gestos das telas internas.
              const routes =
                rota === "Inicio"
                  ? [{ name: "Inicio" as const }]
                  : [
                      { name: "Inicio" as const },
                      { name: rota },
                    ];
              referenciaNavegacao.dispatch(
                CommonActions.reset({ index: routes.length - 1, routes }),
              );
            }}
          />
        ) : null}
      </View>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <LimiteDeErro>
      <AppConteudo />
    </LimiteDeErro>
  );
}

const estilos = StyleSheet.create({
  avisoSemInternet: {
    backgroundColor: "#49391D",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textoSemInternet: {
    color: "#FFE3A8",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
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
