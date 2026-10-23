import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../supabase";

type Familia = { id: string; name: string; invite_code: string };
type MembroResumo = {
  family_id: string;
  family_name: string;
  invite_code: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  workouts_this_week: number;
  cardios_this_week: number;
  minutes_this_week: number;
  calories_this_week: number;
};
type Plano = { id: string; name: string };
type ExercicioCompartilhado = {
  nome: string;
  series: number;
  repeticoes: string;
  cargas: string[];
};
type Publicacao = {
  id: string;
  family_id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string | null;
  post_type: "texto" | "foto" | "treino";
  image_path: string | null;
  workout_plan_name: string | null;
  workout_snapshot: ExercicioCompartilhado[] | null;
  created_at: string;
  image_url?: string | null;
};
type TipoPublicacao = "texto" | "foto" | "treino";
type Props = { corTema?: string };

function avisar(titulo: string, mensagem: string) {
  if (Platform.OS === "web" && typeof window !== "undefined")
    window.alert(`${titulo}\n\n${mensagem}`);
  else Alert.alert(titulo, mensagem);
}
function dataRelativa(data: string) {
  return new Date(data).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function numero(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export default function ComunidadeFamilia({ corTema = "#35D07F" }: Props) {
  const [usuarioId, setUsuarioId] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("Atleta");
  const [avatarUsuario, setAvatarUsuario] = useState<string | null>(null);
  const [familia, setFamilia] = useState<Familia | null>(null);
  const [nomeFamilia, setNomeFamilia] = useState("Minha família");
  const [codigoConvite, setCodigoConvite] = useState("");
  const [criandoFamilia, setCriandoFamilia] = useState(false);
  const [entrandoFamilia, setEntrandoFamilia] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [membros, setMembros] = useState<MembroResumo[]>([]);
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [tipoPublicacao, setTipoPublicacao] = useState<TipoPublicacao>("texto");
  const [textoPublicacao, setTextoPublicacao] = useState("");
  const [fotoSelecionada, setFotoSelecionada] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [planoSelecionado, setPlanoSelecionado] = useState("");
  const [publicando, setPublicando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const { data: respostaUsuario, error: erroUsuario } =
        await supabase.auth.getUser();
      const usuario = respostaUsuario.user;
      if (erroUsuario || !usuario)
        throw new Error("Sua sessão expirou. Entre novamente na sua conta.");
      setUsuarioId(usuario.id);
      const meta = usuario.user_metadata ?? {};
      setNomeUsuario(
        String(
          meta.nome ||
            meta.full_name ||
            usuario.email?.split("@")[0] ||
            "Atleta",
        ),
      );
      setAvatarUsuario(
        typeof meta.foto_url === "string"
          ? meta.foto_url
          : typeof meta.avatar_url === "string"
            ? meta.avatar_url
            : null,
      );

      const { data: associado, error: erroAssociacao } = await supabase
        .from("family_members")
        .select("family_id")
        .eq("user_id", usuario.id)
        .maybeSingle();
      if (erroAssociacao) throw erroAssociacao;
      if (!associado) {
        setFamilia(null);
        setMembros([]);
        setPublicacoes([]);
        setPlanos([]);
        return;
      }

      const { data: familiaAtual, error: erroFamilia } = await supabase
        .from("families")
        .select("id, name, invite_code")
        .eq("id", associado.family_id)
        .single();
      if (erroFamilia || !familiaAtual)
        throw (
          erroFamilia ?? new Error("Não foi possível carregar sua família.")
        );
      setFamilia(familiaAtual as Familia);

      const [resumo, feed, listaPlanos] = await Promise.all([
        supabase.rpc("resumo_painel_familia"),
        supabase
          .from("community_posts")
          .select(
            "id, family_id, user_id, author_name, author_avatar_url, content, post_type, image_path, workout_plan_name, workout_snapshot, created_at",
          )
          .eq("family_id", familiaAtual.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("workout_plans")
          .select("id, name")
          .eq("user_id", usuario.id)
          .order("created_at", { ascending: true }),
      ]);
      if (resumo.error) throw resumo.error;
      if (feed.error) throw feed.error;
      if (listaPlanos.error) throw listaPlanos.error;
      setMembros((resumo.data ?? []) as MembroResumo[]);
      setPlanos((listaPlanos.data ?? []) as Plano[]);
      const postsComFotos = await Promise.all(
        ((feed.data ?? []) as Publicacao[]).map(async (post) => {
          if (!post.image_path) return { ...post, image_url: null };
          const { data: assinatura } = await supabase.storage
            .from("community-photos")
            .createSignedUrl(post.image_path, 3600);
          return { ...post, image_url: assinatura?.signedUrl ?? null };
        }),
      );
      setPublicacoes(postsComFotos);
    } catch (problema) {
      setErro(
        problema instanceof Error
          ? problema.message
          : "Não foi possível carregar a comunidade.",
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  async function criarFamilia() {
    if (!nomeFamilia.trim()) {
      avisar("Nome da família", "Informe um nome para criar o grupo.");
      return;
    }
    setCriandoFamilia(true);
    try {
      const { data: usuario } = await supabase.auth.getUser();
      if (!usuario.user) throw new Error("Entre novamente na sua conta.");
      const { error } = await supabase
        .from("families")
        .insert({ name: nomeFamilia.trim(), owner_user_id: usuario.user.id });
      if (error) throw error;
      await carregar();
      avisar(
        "Família criada",
        "Compartilhe o código de convite com os familiares que deseja adicionar.",
      );
    } catch (problema) {
      avisar(
        "Não foi possível criar a família",
        problema instanceof Error ? problema.message : "Tente novamente.",
      );
    } finally {
      setCriandoFamilia(false);
    }
  }

  async function entrarNaFamilia() {
    if (!codigoConvite.trim()) {
      avisar("Código de convite", "Digite o código recebido de um familiar.");
      return;
    }
    setEntrandoFamilia(true);
    try {
      const { data, error } = await supabase.rpc(
        "entrar_na_familia_por_codigo",
        { p_codigo: codigoConvite.trim().toUpperCase() },
      );
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0))
        throw new Error(
          "Não foi possível encontrar uma família com esse código.",
        );
      setCodigoConvite("");
      await carregar();
      avisar(
        "Você entrou na família",
        "Agora você pode acompanhar o progresso e compartilhar publicações com o grupo.",
      );
    } catch (problema) {
      avisar(
        "Não foi possível entrar",
        problema instanceof Error
          ? problema.message
          : "Confira o código e tente novamente.",
      );
    } finally {
      setEntrandoFamilia(false);
    }
  }

  async function escolherFoto() {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.82,
      aspect: [4, 5],
    });
    if (!resultado.canceled && resultado.assets[0])
      setFotoSelecionada(resultado.assets[0]);
  }

  async function obterTreinoCompartilhado(): Promise<{
    nome: string;
    exercicios: ExercicioCompartilhado[];
  }> {
    const plano = planos.find((item) => item.id === planoSelecionado);
    if (!plano) throw new Error("Selecione o treino que deseja compartilhar.");
    const { data: exercicios, error: erroExercicios } = await supabase
      .from("exercises")
      .select("id, name, sets_goal, reps_goal, position")
      .eq("user_id", usuarioId)
      .eq("plan_id", plano.id)
      .order("position", { ascending: true });
    if (erroExercicios) throw erroExercicios;
    const lista = exercicios ?? [];
    let cargas: {
      exercise_id: string;
      set_number: number;
      reps: number;
      weight_kg: number;
    }[] = [];
    if (lista.length) {
      const { data, error } = await supabase
        .from("exercise_load_defaults")
        .select("exercise_id, set_number, reps, weight_kg")
        .eq("user_id", usuarioId)
        .in(
          "exercise_id",
          lista.map((item) => item.id),
        );
      if (error) throw error;
      cargas = (data ?? []) as typeof cargas;
    }
    return {
      nome: plano.name,
      exercicios: lista.map((item) => {
        const series = cargas
          .filter((carga) => carga.exercise_id === item.id)
          .sort((a, b) => a.set_number - b.set_number);
        return {
          nome: item.name,
          series: numero(item.sets_goal),
          repeticoes: String(item.reps_goal ?? "—"),
          cargas: series.map(
            (serie) => `${serie.reps} rep. × ${numero(serie.weight_kg)} kg`,
          ),
        };
      }),
    };
  }

  async function publicar() {
    if (!familia || !usuarioId || publicando) return;
    if (tipoPublicacao === "texto" && !textoPublicacao.trim()) {
      avisar("Publicação vazia", "Escreva uma mensagem antes de publicar.");
      return;
    }
    if (
      tipoPublicacao === "foto" &&
      !fotoSelecionada &&
      !textoPublicacao.trim()
    ) {
      avisar("Publicação vazia", "Adicione uma foto ou escreva uma mensagem.");
      return;
    }
    if (tipoPublicacao === "treino" && !planoSelecionado) {
      avisar("Selecione um treino", "Escolha qual treino deseja compartilhar.");
      return;
    }
    setPublicando(true);
    let caminhoFoto: string | null = null;
    try {
      let snapshot: ExercicioCompartilhado[] | null = null;
      let nomePlano: string | null = null;
      if (tipoPublicacao === "treino") {
        const treino = await obterTreinoCompartilhado();
        nomePlano = treino.nome;
        snapshot = treino.exercicios;
      }
      if (tipoPublicacao === "foto" && fotoSelecionada) {
        const blob = await (await fetch(fotoSelecionada.uri)).blob();
        const mime = fotoSelecionada.mimeType || "image/jpeg";
        const extensao = (mime.split("/")[1] || "jpeg").replace("jpeg", "jpg");
        caminhoFoto = `${familia.id}/${usuarioId}/${Date.now()}.${extensao}`;
        const { error } = await supabase.storage
          .from("community-photos")
          .upload(caminhoFoto, blob, { contentType: mime, upsert: false });
        if (error) throw error;
      }
      const { error } = await supabase.from("community_posts").insert({
        family_id: familia.id,
        user_id: usuarioId,
        author_name: nomeUsuario,
        author_avatar_url: avatarUsuario,
        content: textoPublicacao.trim() || null,
        post_type: tipoPublicacao,
        image_path: caminhoFoto,
        workout_plan_name: nomePlano,
        workout_snapshot: snapshot,
      });
      if (error) throw error;
      setTextoPublicacao("");
      setFotoSelecionada(null);
      setPlanoSelecionado("");
      setTipoPublicacao("texto");
      await carregar();
    } catch (problema) {
      if (caminhoFoto)
        await supabase.storage.from("community-photos").remove([caminhoFoto]);
      avisar(
        "Não foi possível publicar",
        problema instanceof Error ? problema.message : "Tente novamente.",
      );
    } finally {
      setPublicando(false);
    }
  }

  async function excluirPublicacao(post: Publicacao) {
    let confirmado = false;
    if (Platform.OS === "web" && typeof window !== "undefined")
      confirmado = window.confirm(
        "Excluir esta publicação? Esta ação não pode ser desfeita.",
      );
    else
      confirmado = await new Promise<boolean>((resolve) =>
        Alert.alert("Excluir publicação", "Deseja remover esta publicação?", [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Excluir",
            style: "destructive",
            onPress: () => resolve(true),
          },
        ]),
      );
    if (!confirmado) return;
    const { error } = await supabase
      .from("community_posts")
      .delete()
      .eq("id", post.id)
      .eq("user_id", usuarioId);
    if (error) avisar("Não foi possível excluir", error.message);
    else {
      if (post.image_path)
        await supabase.storage
          .from("community-photos")
          .remove([post.image_path]);
      setPublicacoes((lista) => lista.filter((item) => item.id !== post.id));
    }
  }

  if (carregando)
    return (
      <View style={estilos.centro}>
        <ActivityIndicator size="large" color={corTema} />
        <Text style={estilos.secundario}>Carregando comunidade...</Text>
      </View>
    );

  if (!familia)
    return (
      <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Sua família, evoluindo junta</Text>
        <Text style={estilos.secundario}>
          Crie um grupo ou entre com o código de convite. O painel e as
          publicações ficam visíveis somente para integrantes desse grupo.
        </Text>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
        <View style={estilos.cartao}>
          <Text style={estilos.tituloCartao}>Criar uma família</Text>
          <TextInput
            value={nomeFamilia}
            onChangeText={setNomeFamilia}
            placeholder="Ex.: Família Silva"
            placeholderTextColor="#758178"
            style={estilos.input}
            maxLength={70}
          />
          <TouchableOpacity
            onPress={criarFamilia}
            disabled={criandoFamilia}
            style={[estilos.botao, { backgroundColor: corTema }]}
          >
            {criandoFamilia ? (
              <ActivityIndicator color="#0C120E" />
            ) : (
              <Text style={estilos.textoBotaoEscuro}>Criar grupo familiar</Text>
            )}
          </TouchableOpacity>
        </View>
        <View style={estilos.cartao}>
          <Text style={estilos.tituloCartao}>Entrar em uma família</Text>
          <TextInput
            value={codigoConvite}
            onChangeText={setCodigoConvite}
            placeholder="Código de convite"
            placeholderTextColor="#758178"
            style={estilos.input}
            autoCapitalize="characters"
            maxLength={16}
          />
          <TouchableOpacity
            onPress={entrarNaFamilia}
            disabled={entrandoFamilia}
            style={[estilos.botaoSecundario, { borderColor: corTema }]}
          >
            {entrandoFamilia ? (
              <ActivityIndicator color={corTema} />
            ) : (
              <Text style={{ color: corTema, fontWeight: "800" }}>
                Entrar com código
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={estilos.rodape}>
          A comunidade é privada para integrantes do grupo familiar.
        </Text>
      </ScrollView>
    );

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <View style={estilos.topo}>
        <View style={{ flex: 1 }}>
          <Text style={[estilos.marca, { color: corTema }]}>
            TREINO FAMÍLIA
          </Text>
          <Text style={estilos.titulo}>Família em movimento</Text>
          <Text style={estilos.secundario}>
            {familia.name} · resumo da semana
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setAtualizando(true);
            void carregar();
          }}
          style={[estilos.atualizar, { borderColor: corTema }]}
        >
          <Text style={{ color: corTema, fontSize: 22 }}>↻</Text>
        </TouchableOpacity>
      </View>
      <View style={estilos.cartaoCodigo}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={estilos.rotulo}>CÓDIGO DE CONVITE</Text>
          <Text selectable style={[estilos.codigo, { color: corTema }]}>
            {familia.invite_code}
          </Text>
          <Text style={estilos.secundario}>
            Toque e segure o código para copiá-lo e enviar aos familiares.
          </Text>
        </View>
      </View>
      <Text style={estilos.tituloSecao}>Progresso da família</Text>
      {membros.map((membro) => (
        <View key={membro.user_id} style={estilos.cartaoMembro}>
          <View
            style={[
              estilos.avatar,
              { borderColor: corTema, backgroundColor: `${corTema}20` },
            ]}
          >
            {membro.avatar_url ? (
              <Image
                source={{ uri: membro.avatar_url }}
                style={estilos.avatarImagem}
              />
            ) : (
              <Text style={{ color: corTema, fontSize: 19, fontWeight: "900" }}>
                {membro.display_name?.charAt(0)?.toUpperCase() || "?"}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={estilos.nomeMembro}>
              {membro.display_name}
              {membro.user_id === usuarioId ? " (você)" : ""}
            </Text>
            <View style={estilos.gradeMembro}>
              <Text style={estilos.indicadorMembro}>
                🏋️ {numero(membro.workouts_this_week)} treinos
              </Text>
              <Text style={estilos.indicadorMembro}>
                🏃 {numero(membro.cardios_this_week)} cardios
              </Text>
              <Text style={estilos.indicadorMembro}>
                ⏱️ {Math.round(numero(membro.minutes_this_week))} min
              </Text>
              <Text style={estilos.indicadorMembro}>
                🔥 {Math.round(numero(membro.calories_this_week))} kcal
              </Text>
            </View>
          </View>
        </View>
      ))}
      {membros.length === 0 ? (
        <Text style={estilos.secundario}>
          Ainda não há dados de progresso nesta semana.
        </Text>
      ) : null}
      <Text style={estilos.tituloSecao}>Comunidade da família</Text>
      <View style={estilos.cartaoPublicar}>
        <Text style={estilos.tituloCartao}>Compartilhe sua evolução</Text>
        <View style={estilos.opcoesPublicacao}>
          {(
            [
              ["texto", "✍️ Texto"],
              ["foto", "📷 Foto"],
              ["treino", "🏋️ Treino"],
            ] as [TipoPublicacao, string][]
          ).map(([valor, rotulo]) => (
            <TouchableOpacity
              key={valor}
              onPress={() => {
                setTipoPublicacao(valor);
                if (valor !== "foto") setFotoSelecionada(null);
              }}
              style={[
                estilos.opcao,
                tipoPublicacao === valor && {
                  borderColor: corTema,
                  backgroundColor: `${corTema}18`,
                },
              ]}
            >
              <Text
                style={[
                  estilos.opcaoTexto,
                  tipoPublicacao === valor && { color: corTema },
                ]}
              >
                {rotulo}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={textoPublicacao}
          onChangeText={setTextoPublicacao}
          placeholder={
            tipoPublicacao === "treino"
              ? "Conte como foi esse treino (opcional)..."
              : "Compartilhe uma conquista, dica ou mensagem..."
          }
          placeholderTextColor="#758178"
          style={[estilos.input, estilos.inputTexto]}
          multiline
          maxLength={1600}
        />
        {tipoPublicacao === "foto" ? (
          <View style={estilos.fotoArea}>
            <TouchableOpacity
              style={[estilos.botaoSecundario, { borderColor: corTema }]}
              onPress={escolherFoto}
            >
              <Text style={{ color: corTema, fontWeight: "800" }}>
                {fotoSelecionada ? "Trocar foto" : "Escolher foto"}
              </Text>
            </TouchableOpacity>
            {fotoSelecionada ? (
              <Image
                source={{ uri: fotoSelecionada.uri }}
                style={estilos.previewFoto}
              />
            ) : null}
          </View>
        ) : null}
        {tipoPublicacao === "treino" ? (
          <View style={{ gap: 8 }}>
            <Text style={estilos.rotulo}>SELECIONE UM DOS SEUS TREINOS</Text>
            {planos.length ? (
              planos.map((plano) => (
                <TouchableOpacity
                  key={plano.id}
                  onPress={() => setPlanoSelecionado(plano.id)}
                  style={[
                    estilos.plano,
                    planoSelecionado === plano.id && {
                      borderColor: corTema,
                      backgroundColor: `${corTema}18`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      estilos.opcaoTexto,
                      planoSelecionado === plano.id && { color: corTema },
                    ]}
                  >
                    {planoSelecionado === plano.id ? "✓ " : ""}
                    {plano.name}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={estilos.secundario}>
                Você ainda não cadastrou treinos para compartilhar.
              </Text>
            )}
          </View>
        ) : null}
        <TouchableOpacity
          onPress={publicar}
          disabled={publicando}
          style={[estilos.botao, { backgroundColor: corTema, marginTop: 12 }]}
        >
          {publicando ? (
            <ActivityIndicator color="#0C120E" />
          ) : (
            <Text style={estilos.textoBotaoEscuro}>Publicar na família</Text>
          )}
        </TouchableOpacity>
      </View>
      {publicacoes.map((post) => (
        <View key={post.id} style={estilos.cartaoPost}>
          <View style={estilos.cabecalhoPost}>
            <View
              style={[
                estilos.avatarPequeno,
                { borderColor: corTema, backgroundColor: `${corTema}20` },
              ]}
            >
              {post.author_avatar_url ? (
                <Image
                  source={{ uri: post.author_avatar_url }}
                  style={estilos.avatarImagem}
                />
              ) : (
                <Text style={{ color: corTema, fontWeight: "900" }}>
                  {post.author_name?.charAt(0)?.toUpperCase() || "?"}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={estilos.nomeMembro}>{post.author_name}</Text>
              <Text style={estilos.secundario}>
                {dataRelativa(post.created_at)} ·{" "}
                {post.post_type === "treino"
                  ? "Treino compartilhado"
                  : post.post_type === "foto"
                    ? "Foto"
                    : "Publicação"}
              </Text>
            </View>
            {post.user_id === usuarioId ? (
              <TouchableOpacity onPress={() => void excluirPublicacao(post)}>
                <Text style={estilos.excluir}>Excluir</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {post.content ? (
            <Text style={estilos.textoPost}>{post.content}</Text>
          ) : null}
          {post.image_url ? (
            <Image
              source={{ uri: post.image_url }}
              style={estilos.imagemPost}
              resizeMode="cover"
            />
          ) : null}
          {post.workout_plan_name ? (
            <View
              style={[
                estilos.treinoCompartilhado,
                { borderColor: `${corTema}70` },
              ]}
            >
              <Text style={[estilos.tituloCartao, { color: corTema }]}>
                🏋️ {post.workout_plan_name}
              </Text>
              {(post.workout_snapshot ?? []).map((item, indice) => (
                <View
                  key={`${post.id}-${indice}`}
                  style={estilos.exercicioCompartilhado}
                >
                  <Text style={estilos.nomeExercicio}>{item.nome}</Text>
                  <Text style={estilos.secundario}>
                    {item.series} séries · {item.repeticoes} repetições
                  </Text>
                  {item.cargas?.length ? (
                    <Text style={estilos.secundario}>
                      {item.cargas.join(" · ")}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {publicacoes.length === 0 ? (
        <Text style={estilos.secundario}>
          Ainda não há publicações. Seja a primeira pessoa a compartilhar uma
          conquista!
        </Text>
      ) : null}
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      {atualizando ? <ActivityIndicator color={corTema} /> : null}
      <Text style={estilos.rodape}>
        Publicações e estatísticas ficam visíveis apenas para integrantes deste
        grupo familiar.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#101312" },
  conteudo: { padding: 18, paddingTop: 24, paddingBottom: 28, gap: 14 },
  centro: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#101312",
    gap: 12,
    padding: 24,
  },
  topo: { flexDirection: "row", alignItems: "center", gap: 12 },
  marca: { fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: 5 },
  titulo: {
    color: "#F3F7F4",
    fontSize: 27,
    fontWeight: "900",
    marginBottom: 4,
  },
  secundario: { color: "#98A39B", fontSize: 12, lineHeight: 18 },
  erro: { color: "#FF9B9B", fontSize: 13, lineHeight: 19 },
  cartao: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 16,
    padding: 15,
    gap: 11,
  },
  tituloCartao: { color: "#F3F7F4", fontSize: 16, fontWeight: "800" },
  input: {
    borderWidth: 1,
    borderColor: "#354139",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#F3F7F4",
    backgroundColor: "#111713",
    fontSize: 14,
  },
  inputTexto: { minHeight: 90, textAlignVertical: "top" },
  botao: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  textoBotaoEscuro: { color: "#0C120E", fontWeight: "900", fontSize: 14 },
  botaoSecundario: {
    minHeight: 43,
    borderWidth: 1,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  rodape: {
    color: "#748077",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 2,
  },
  cartaoCodigo: {
    flexDirection: "row",
    backgroundColor: "#171F19",
    borderWidth: 1,
    borderColor: "#2F4735",
    borderRadius: 15,
    padding: 15,
    gap: 10,
  },
  rotulo: {
    color: "#93A097",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  codigo: { fontSize: 26, fontWeight: "900", letterSpacing: 3 },
  atualizar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tituloSecao: {
    color: "#F3F7F4",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 5,
  },
  cartaoMembro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
  },
  avatar: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarPequeno: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImagem: { width: "100%", height: "100%" },
  nomeMembro: { color: "#F0F4F1", fontSize: 14, fontWeight: "800" },
  gradeMembro: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  indicadorMembro: {
    color: "#CDD6D0",
    fontSize: 11,
    backgroundColor: "#222A24",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: "hidden",
  },
  cartaoPublicar: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 16,
    padding: 15,
    gap: 12,
  },
  opcoesPublicacao: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  opcao: {
    borderWidth: 1,
    borderColor: "#354139",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  opcaoTexto: { color: "#C8D1CB", fontSize: 12, fontWeight: "800" },
  fotoArea: { gap: 10 },
  previewFoto: {
    width: "100%",
    height: 210,
    borderRadius: 12,
    backgroundColor: "#222A24",
  },
  plano: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#354139",
    borderRadius: 10,
  },
  cartaoPost: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cabecalhoPost: { flexDirection: "row", alignItems: "center", gap: 10 },
  excluir: { color: "#FF9292", fontSize: 12, fontWeight: "800", padding: 6 },
  textoPost: { color: "#E2E9E4", fontSize: 14, lineHeight: 21 },
  imagemPost: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#222A24",
  },
  treinoCompartilhado: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    gap: 10,
    backgroundColor: "#111713",
  },
  exercicioCompartilhado: {
    gap: 3,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#2B342E",
  },
  nomeExercicio: { color: "#F0F4F1", fontSize: 13, fontWeight: "700" },
});
