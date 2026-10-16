import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  PanResponder,
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
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Perfil from "./telas/Perfil";
import TreinoDoDia from "./telas/TreinoDoDia";
import MeusTreinos from "./telas/MeusTreinos";
import EvolucaoFisica from "./telas/EvolucaoFisica";
import HistoricoTreinos from "./telas/HistoricoTreinos";
import ProgramacaoSemanal from "./telas/ProgramacaoSemanal";

type ModoAutenticacao = "login" | "cadastro" | "recuperar";

type Rotas = {
  Inicio: undefined;
  perfil: undefined;
  treinos: undefined;
  evolucao: undefined;
  historico: undefined;
  frequencia: undefined;
  programacao: undefined;
};

const Pilha = createNativeStackNavigator<Rotas>();

const telas = [
  {
    id: "treinos",
    titulo: "Meus treinos",
    descricao: "Acesse seus treinos e exercícios",
    emoji: "🏋️",
  },
  {
    id: "evolucao",
    titulo: "Evolução física",
    descricao: "Acompanhe seu peso e suas medidas",
    emoji: "📈",
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
  {
    id: "programacao",
    titulo: "Programação semanal",
    descricao: "Defina seus treinos e dias de descanso",
    emoji: "🗓️",
  },
] as const;

function TelaComGestoVoltar({
  children,
  navigation,
}: {
  children: React.ReactNode;
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
  };
}) {
  const larguraTela = Dimensions.get("window").width;
  const deslocamento = React.useRef(new Animated.Value(0)).current;

  const responder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,

      onMoveShouldSetPanResponder: (_, gesto) => {
        if (Platform.OS !== "web" || !navigation.canGoBack()) {
          return false;
        }

        return (
          gesto.x0 <= 30 &&
          gesto.dx > 12 &&
          Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.5
        );
      },

      onPanResponderMove: (_, gesto) => {
        deslocamento.setValue(Math.max(0, gesto.dx));
      },

      onPanResponderRelease: (_, gesto) => {
        const concluirVolta =
          gesto.x0 <= 30 &&
          gesto.dx > Math.min(larguraTela * 0.2, 100) &&
          Math.abs(gesto.dx) > Math.abs(gesto.dy) * 1.5 &&
          navigation.canGoBack();

        if (concluirVolta) {
          Animated.timing(deslocamento, {
            toValue: larguraTela,
            duration: 180,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (finished) {
              deslocamento.setValue(0);
              navigation.goBack();
            }
          });
        } else {
          Animated.spring(deslocamento, {
            toValue: 0,
            speed: 24,
            bounciness: 2,
            useNativeDriver: false,
          }).start();
        }
      },

      onPanResponderTerminate: () => {
        Animated.spring(deslocamento, {
          toValue: 0,
          speed: 24,
          bounciness: 2,
          useNativeDriver: false,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[
        estilos.telaComGesto,
        { transform: [{ translateX: deslocamento }] },
      ]}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

export default function App() {
  const versaoAvisada = useRef<string | null>(null);
  const verificacaoEmAndamento = useRef(false);

  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<ModoAutenticacao>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let componenteAtivo = true;

    async function carregarSessao() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          Alert.alert("Erro", "Não foi possível verificar sua sessão.");
        }

        if (componenteAtivo) {
          setSessao(data.session);
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
      setSessao(novaSessao);
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
          data: {
            nome: nome.trim(),
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
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

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
  }

  if (carregando) {
    return (
      <View style={estilos.carregando}>
        <StatusBar barStyle="light-content" backgroundColor="#101312" />
        <ActivityIndicator size="large" color="#35D07F" />
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
        <StatusBar barStyle="light-content" backgroundColor="#101312" />

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
              <TouchableOpacity
                style={estilos.linkContainer}
                onPress={() => setModo("recuperar")}
                disabled={enviando}
              >
                <Text style={estilos.link}>Esqueci minha senha</Text>
              </TouchableOpacity>
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
              style={estilos.botaoSecundario}
              onPress={() => {
                setModo(modo === "cadastro" ? "login" : "cadastro");
                setSenha("");
              }}
              disabled={enviando || modo === "recuperar"}
            >
              <Text style={estilos.textoBotaoSecundario}>
                {modo === "cadastro" ? "Fazer login" : "Criar uma conta"}
              </Text>
            </TouchableOpacity>

            {modo === "recuperar" && (
              <TouchableOpacity
                style={estilos.linkContainer}
                onPress={() => setModo("login")}
              >
                <Text style={estilos.link}>Voltar para o login</Text>
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
    sessao.user.email?.split("@")[0] ||
    "Atleta";

  const nomeUsuario = nomeCompleto.trim().split(/\s+/).slice(0, 2).join(" ");

  const fotoUrl =
    typeof sessao.user.user_metadata?.foto_url === "string"
      ? sessao.user.user_metadata.foto_url
      : null;

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#101312" />

      <Pilha.Navigator
        initialRouteName="Inicio"
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: "#101312" },
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
                    <Text style={estilos.marcaPequena}>TREINO FAMÍLIA</Text>

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
                    style={estilos.avatar}
                    onPress={() => navigation.navigate("perfil")}
                    activeOpacity={0.8}
                  >
                    {fotoUrl ? (
                      <Image
                        source={{ uri: fotoUrl }}
                        style={estilos.imagemAvatar}
                      />
                    ) : (
                      <Text style={estilos.avatarTexto}>
                        {nomeUsuario.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={estilos.banner}>
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
                  onAbrirProgramacao={() => navigation.navigate("programacao")}
                  onAbrirTreino={() => navigation.navigate("treinos")}
                />

                <Text style={estilos.tituloSecao}>Seu espaço de treino</Text>

                <View style={estilos.listaCartoes}>
                  {telas.map((tela) => (
                    <TouchableOpacity
                      key={tela.id}
                      style={estilos.cartaoHome}
                      onPress={() => navigation.navigate(tela.id)}
                      activeOpacity={0.8}
                    >
                      <View style={estilos.iconeCartao}>
                        <Text style={estilos.emojiCartao}>{tela.emoji}</Text>
                      </View>

                      <View style={estilos.textoCartao}>
                        <Text style={estilos.tituloCartao}>{tela.titulo}</Text>

                        <Text style={estilos.descricaoCartao}>
                          {tela.descricao}
                        </Text>
                      </View>

                      <Text style={estilos.setaCartao}>›</Text>
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
            <TelaComGestoVoltar navigation={navigation}>
              <Perfil
                usuario={sessao.user}
                onVoltar={() => navigation.goBack()}
              />
            </TelaComGestoVoltar>
          )}
        </Pilha.Screen>

        <Pilha.Screen name="treinos">
          {({ navigation }) => (
            <TelaComGestoVoltar navigation={navigation}>
              <MeusTreinos onVoltar={() => navigation.goBack()} />
            </TelaComGestoVoltar>
          )}
        </Pilha.Screen>

        <Pilha.Screen name="evolucao">
          {({ navigation }) => (
            <TelaComGestoVoltar navigation={navigation}>
              <EvolucaoFisica onVoltar={() => navigation.goBack()} />
            </TelaComGestoVoltar>
          )}
        </Pilha.Screen>

        <Pilha.Screen name="historico">
          {({ navigation }) => (
            <TelaComGestoVoltar navigation={navigation}>
              <HistoricoTreinos onVoltar={() => navigation.goBack()} />
            </TelaComGestoVoltar>
          )}
        </Pilha.Screen>

        <Pilha.Screen name="programacao">
          {({ navigation }) => (
            <TelaComGestoVoltar navigation={navigation}>
              <ProgramacaoSemanal onVoltar={() => navigation.goBack()} />
            </TelaComGestoVoltar>
          )}
        </Pilha.Screen>

        <Pilha.Screen name="frequencia">
          {({ navigation }) => {
            const tela = telas.find((item) => item.id === "frequencia");

            return (
              <TelaComGestoVoltar navigation={navigation}>
                <View style={estilos.container}>
                  <View style={estilos.topoInterno}>
                    <TouchableOpacity
                      style={estilos.botaoVoltar}
                      onPress={() => navigation.goBack()}
                    >
                      <Text style={estilos.textoVoltar}>‹ Voltar</Text>
                    </TouchableOpacity>

                    <Text style={estilos.tituloInterno}>{tela?.titulo}</Text>
                  </View>

                  <View style={estilos.conteudoPlaceholder}>
                    <Text style={estilos.emojiPlaceholder}>{tela?.emoji}</Text>

                    <Text style={estilos.tituloPlaceholder}>
                      {tela?.titulo}
                    </Text>

                    <Text style={estilos.descricaoPlaceholder}>
                      Esta área será desenvolvida na próxima etapa.
                    </Text>
                  </View>
                </View>
              </TelaComGestoVoltar>
            );
          }}
        </Pilha.Screen>
      </Pilha.Navigator>
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  telaComGesto: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#101312",
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
    backgroundColor: "#35D07F",
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
  linkContainer: {
    alignItems: "center",
    paddingTop: 18,
  },
  link: {
    color: "#35D07F",
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
    borderColor: "#35D07F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 13,
  },
  textoBotaoSecundario: {
    color: "#35D07F",
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
    color: "#35D07F",
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
    borderColor: "#35D07F",
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
    color: "#35D07F",
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
    color: "#35D07F",
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
  topoInterno: {
    paddingTop: 60,
    paddingHorizontal: 22,
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
    fontWeight: "700",
  },
  tituloInterno: {
    color: "#F0F3F1",
    fontSize: 27,
    fontWeight: "800",
  },
  conteudoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emojiPlaceholder: {
    fontSize: 58,
    marginBottom: 20,
  },
  tituloPlaceholder: {
    color: "#F0F3F1",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  descricaoPlaceholder: {
    color: "#A4ADA7",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    marginTop: 12,
  },
});
