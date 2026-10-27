import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { Alert } from "../servicos/alerta";
import * as ImagePicker from "expo-image-picker";
import { EntradaGaleriaWeb } from "../componentes/SeletorGaleriaWeb";
import ImagemLeve from "./ImagemLeve";
import { File as ArquivoExpo } from "expo-file-system";
import { decodificarFotoBase64 } from "../servicos/fotoExercicio";
import { supabase } from "../supabase";
import { obterFotosAssinadas } from "../servicos/fotosAssinadas";
import { obterRevisaoDeDados } from "../servicos/revisaoDados";
import {
  criarControleConsultas,
  filtroCursorDesc,
  unirPorId,
  type CursorData,
} from "../servicos/paginacaoHistorico";

import MinhasFamilias from "../componentes/MinhasFamilias";
import {
  criarFamiliaComId,
  lerFamiliaPreferida,
  guardarFamiliaPreferida,
  selecionarFamiliaPermitida,
  somenteDaFamilia,
  fotoPertenceAFamilia,
  renomearFamilia as renomearFamiliaNoBanco,
  sairDaFamilia as sairDaFamiliaNoBanco,
  excluirFamilia as excluirFamiliaNoBanco,
  type Familia,
} from "../servicos/familias";
import { novoIdSerie } from "../servicos/treinoLocal";
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

function mensagemErro(problema: unknown, alternativa: string) {
  if (problema instanceof Error && problema.message.trim()) {
    return problema.message;
  }
  if (typeof problema === "string" && problema.trim()) {
    return problema;
  }
  if (problema && typeof problema === "object") {
    const detalhe = problema as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      statusCode?: unknown;
    };
    const partes = [detalhe.message, detalhe.details, detalhe.hint].filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
    if (partes.length) {
      const codigo = typeof detalhe.code === "string" ? detalhe.code : "";
      const status =
        typeof detalhe.statusCode === "string" ? detalhe.statusCode : "";
      const identificador = [status, codigo].filter(Boolean).join(" · ");
      return identificador
        ? `${partes.join("\n")}\n(${identificador})`
        : partes.join("\n");
    }
  }
  return alternativa;
}

async function obterConteudoFoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === "web" && asset.file) {
    // O multipart usa o MIME do Blob, mesmo quando o upload recebe contentType.
    // Alguns provedores Android entregam o arquivo sem o tipo da imagem.
    return asset.mimeType && asset.file.type !== asset.mimeType
      ? asset.file.slice(0, asset.file.size, asset.mimeType)
      : asset.file;
  }

  if (Platform.OS === "web") {
    const resposta = await fetch(asset.uri);
    if (!resposta.ok) {
      throw new Error(
        `Não foi possível ler a foto selecionada (HTTP ${resposta.status}). Selecione a imagem novamente.`,
      );
    }
    const blob = await resposta.blob();
    if (!blob.size) {
      throw new Error("A foto selecionada está vazia. Escolha outra imagem.");
    }
    return blob;
  }

  const arquivo = asset.base64
    ? decodificarFotoBase64(asset.base64)
    : await new ArquivoExpo(asset.uri).arrayBuffer();
  if (!arquivo.byteLength) {
    throw new Error(
      "Não foi possível ler os dados da foto no aparelho. Selecione-a novamente.",
    );
  }
  return arquivo;
}

export default function ComunidadeFamilia({ corTema = "#35D07F" }: Props) {
  const [usuarioId, setUsuarioId] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("Atleta");
  const [avatarUsuario, setAvatarUsuario] = useState<string | null>(null);
  const [familia, setFamilia] = useState<Familia | null>(null);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [familiaAtivaId, setFamiliaAtivaId] = useState<string | null>(null);
  const familiaAtivaIdRef = useRef<string | null>(null);
  const [codigoConvite, setCodigoConvite] = useState("");
  const [criandoFamilia, setCriandoFamilia] = useState(false);
  const [entrandoFamilia, setEntrandoFamilia] = useState(false);
  const [alterandoFamilia, setAlterandoFamilia] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [membros, setMembros] = useState<MembroResumo[]>([]);
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const cursorPostsRef = useRef<CursorData | null>(null);
  const controleConsultas = useRef(criarControleConsultas());
  const carregandoInicialRef = useRef(false);
  const [haMaisPosts, setHaMaisPosts] = useState(false);
  const [carregandoMaisPosts, setCarregandoMaisPosts] = useState(false);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [tipoPublicacao, setTipoPublicacao] = useState<TipoPublicacao>("texto");
  const [textoPublicacao, setTextoPublicacao] = useState("");
  const [fotoSelecionada, setFotoSelecionada] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const familiaSelecaoFotoRef = useRef<string | null>(null);
  useEffect(() => {
    const uri = fotoSelecionada?.uri;
    return () => {
      if (
        Platform.OS === "web" &&
        uri?.startsWith("blob:") &&
        typeof URL.revokeObjectURL === "function"
      )
        URL.revokeObjectURL(uri);
    };
  }, [fotoSelecionada]);
  const [planoSelecionado, setPlanoSelecionado] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const publicandoRef = useRef(false),
    mutandoFamiliaRef = useRef(false),
    excluindoRef = useRef(false);
  const familiasRef = useRef<Familia[]>([]),
    familiaVerificadaRef = useRef<string | null>(null);
  const tentativaCriacaoRef = useRef<{
    usuarioId: string;
    nome: string;
    id: string;
  } | null>(null);
  type Rascunho = { tipo: TipoPublicacao; texto: string; plano: string };
  const rascunhosRef = useRef(new Map<string, Rascunho>());
  const rascunhoAtualRef = useRef<Rascunho>({
    tipo: "texto",
    texto: "",
    plano: "",
  });
  useEffect(() => {
    rascunhoAtualRef.current = {
      tipo: tipoPublicacao,
      texto: textoPublicacao,
      plano: planoSelecionado,
    };
  }, [tipoPublicacao, textoPublicacao, planoSelecionado]);
  const mudarContextoFamilia = useCallback(
    (id: string | null, detalhe?: Familia) => {
      const anterior = familiaAtivaIdRef.current;
      if (anterior !== id) {
        if (anterior)
          rascunhosRef.current.set(anterior, { ...rascunhoAtualRef.current });
        const rascunho = (id && rascunhosRef.current.get(id)) || {
          tipo: "texto" as const,
          texto: "",
          plano: "",
        };
        rascunhoAtualRef.current = rascunho;
        setTextoPublicacao(rascunho.texto);
        setTipoPublicacao(rascunho.tipo);
        setPlanoSelecionado(rascunho.plano);
        setFotoSelecionada(null);
        familiaAtivaIdRef.current = id;
        setFamiliaAtivaId(id);
        familiaVerificadaRef.current = null;
        setPublicacoes([]);
        setMembros([]);
        cursorPostsRef.current = null;
        setHaMaisPosts(false);
      }
      setFamilia(
        detalhe ?? familiasRef.current.find((f) => f.id === id) ?? null,
      );
    },
    [],
  );
  async function confirmarTrocaComFoto(): Promise<boolean> {
    if (!fotoSelecionada) return true;
    const mensagem =
      "A foto selecionada será descartada ao trocar de família. O texto fica separado no rascunho de cada família enquanto esta tela estiver aberta. Deseja continuar?";
    if (Platform.OS === "web" && typeof window !== "undefined")
      return window.confirm(mensagem);
    return new Promise((resolve) =>
      Alert.alert("Trocar de família?", mensagem, [
        { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
        { text: "Trocar", onPress: () => resolve(true) },
      ]),
    );
  }
  async function trocarFamilia(id: string) {
    if (
      id === familiaAtivaIdRef.current ||
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current ||
      !familiasRef.current.some((f) => f.id === id)
    )
      return;
    if (!(await confirmarTrocaComFoto())) return;
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return;
    void carregar(id);
  }

  const ultimaConsultaRef = useRef(0);
  const ultimaRevisaoRef = useRef(-1);
  const dadosCarregadosRef = useRef(false);
  const carregar = useCallback(
    async (idFamiliaSolicitada?: string) => {
      const consulta = controleConsultas.current.iniciar();
      carregandoInicialRef.current = true;
      setCarregandoMaisPosts(false);
      familiaVerificadaRef.current = null;
      if (
        idFamiliaSolicitada &&
        idFamiliaSolicitada !== familiaAtivaIdRef.current
      ) {
        if (!familiasRef.current.some((f) => f.id === idFamiliaSolicitada))
          setCarregando(true);
        mudarContextoFamilia(idFamiliaSolicitada);
        setAtualizando(true);
      }
      if (!dadosCarregadosRef.current) setCarregando(true);
      setErro("");
      try {
        const { data: respostaUsuario, error: erroUsuario } =
          await supabase.auth.getUser();
        const usuario = respostaUsuario.user;
        if (!consulta.atual()) return;
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

        const { data: associacoes, error: erroAssociacao } = await supabase
          .from("family_members")
          .select("family_id")
          .eq("user_id", usuario.id)
          .abortSignal(consulta.signal);
        if (!consulta.atual()) return;
        if (erroAssociacao) throw erroAssociacao;

        const idsFamilias = Array.from(
          new Set(
            (associacoes ?? []).map((item) => item.family_id).filter(Boolean),
          ),
        ) as string[];

        if (idsFamilias.length === 0) {
          mudarContextoFamilia(null);
          familiasRef.current = [];
          void guardarFamiliaPreferida(usuario.id, null).catch(() => {});
          setFamilias([]);
          setMembros([]);
          setPublicacoes([]);
          setHaMaisPosts(false);
          cursorPostsRef.current = null;
          setPlanos([]);
          return;
        }

        const { data: listaFamilias, error: erroListaFamilias } = await supabase
          .from("families")
          .select("id, name, invite_code, owner_user_id")
          .in("id", idsFamilias)
          .order("name", { ascending: true })
          .abortSignal(consulta.signal);
        if (!consulta.atual()) return;
        if (erroListaFamilias) throw erroListaFamilias;
        const familiasDisponiveis = (listaFamilias ?? []) as Familia[];
        if (familiasDisponiveis.length === 0) {
          mudarContextoFamilia(null);
          familiasRef.current = [];
          void guardarFamiliaPreferida(usuario.id, null).catch(() => {});
          setFamilias([]);
          setMembros([]);
          setPublicacoes([]);
          setHaMaisPosts(false);
          cursorPostsRef.current = null;
          setPlanos([]);
          return;
        }

        const idPreferido =
          idFamiliaSolicitada ??
          familiaAtivaIdRef.current ??
          (await lerFamiliaPreferida(usuario.id));
        if (!consulta.atual()) return;
        const familiaAtual = selecionarFamiliaPermitida(
          familiasDisponiveis,
          idPreferido,
        )!;
        familiasRef.current = familiasDisponiveis;
        setFamilias(familiasDisponiveis);
        mudarContextoFamilia(familiaAtual.id, familiaAtual);
        void guardarFamiliaPreferida(usuario.id, familiaAtual.id).catch(
          () => {},
        );

        const [resumo, feed, listaPlanos] = await Promise.all([
          supabase
            .rpc("resumo_painel_familia_por_id", {
              p_family_id: familiaAtual.id,
            })
            .abortSignal(consulta.signal),
          supabase
            .from("community_posts")
            .select(
              "id, family_id, user_id, author_name, author_avatar_url, content, post_type, image_path, workout_plan_name, workout_snapshot, created_at",
            )
            .eq("family_id", familiaAtual.id)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(11)
            .abortSignal(consulta.signal),
          supabase
            .from("workout_plans")
            .select("id, name")
            .eq("user_id", usuario.id)
            .order("created_at", { ascending: true })
            .abortSignal(consulta.signal),
        ]);
        if (!consulta.atual()) return;
        if (resumo.error) throw resumo.error;
        if (feed.error) throw feed.error;
        if (listaPlanos.error) throw listaPlanos.error;
        const listaPosts = somenteDaFamilia(
          (feed.data ?? []) as Publicacao[],
          familiaAtual.id,
        );
        const pagina = listaPosts.slice(0, 10);
        const urlsFotos = await obterFotosAssinadas(
          "community-photos",
          pagina.map((post) =>
            fotoPertenceAFamilia(post.image_path, familiaAtual.id)
              ? post.image_path
              : null,
          ),
          3600,
          usuario.id,
        );
        if (!consulta.atual()) return;
        const postsComFotos = pagina.map((post) => ({
          ...post,
          image_url: post.image_path
            ? (urlsFotos.get(post.image_path) ?? null)
            : null,
        }));
        setMembros(
          somenteDaFamilia(
            (resumo.data ?? []) as MembroResumo[],
            familiaAtual.id,
          ),
        );
        familiaVerificadaRef.current = familiaAtual.id;
        setPlanos((listaPlanos.data ?? []) as Plano[]);
        setHaMaisPosts(listaPosts.length > 10);
        const ultimo = pagina[pagina.length - 1];
        cursorPostsRef.current = ultimo
          ? { id: ultimo.id, data: ultimo.created_at }
          : null;
        setPublicacoes(postsComFotos);
        ultimaConsultaRef.current = Date.now();
        ultimaRevisaoRef.current = obterRevisaoDeDados();
        dadosCarregadosRef.current = true;
        return familiaAtual;
      } catch (problema) {
        if (!consulta.atual()) return;
        setErro(
          problema instanceof Error
            ? problema.message
            : "Não foi possível carregar a comunidade.",
        );
      } finally {
        if (consulta.atual()) {
          carregandoInicialRef.current = false;
          setCarregando(false);
          setAtualizando(false);
        }
      }
    },
    [mudarContextoFamilia],
  );

  // Somente o feed é paginado: não recarrega membros, famílias e planos.
  async function carregarMaisPublicacoes() {
    const idFamilia = familiaAtivaIdRef.current;
    const cursor = cursorPostsRef.current;
    if (
      !idFamilia ||
      !usuarioId ||
      !cursor ||
      carregandoInicialRef.current ||
      !haMaisPosts
    )
      return;
    const consulta = controleConsultas.current.iniciarPagina();
    if (!consulta) return;
    setCarregandoMaisPosts(true);
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .select(
          "id, family_id, user_id, author_name, author_avatar_url, content, post_type, image_path, workout_plan_name, workout_snapshot, created_at",
        )
        .eq("family_id", idFamilia)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .or(filtroCursorDesc("created_at", cursor))
        .limit(11)
        .abortSignal(consulta.signal);
      if (!consulta.atual()) return;
      if (error) throw error;
      if (familiaAtivaIdRef.current !== idFamilia) return;
      const listaPosts = somenteDaFamilia(
        (data ?? []) as Publicacao[],
        idFamilia,
      );
      const pagina = listaPosts.slice(0, 10);
      const urlsFotos = await obterFotosAssinadas(
        "community-photos",
        pagina.map((post) =>
          fotoPertenceAFamilia(post.image_path, idFamilia)
            ? post.image_path
            : null,
        ),
        3600,
        usuarioId,
      );
      if (!consulta.atual() || familiaAtivaIdRef.current !== idFamilia) return;
      setPublicacoes((anteriores) =>
        unirPorId(
          anteriores,
          pagina.map((post) => ({
            ...post,
            image_url: post.image_path
              ? (urlsFotos.get(post.image_path) ?? null)
              : null,
          })),
        ),
      );
      const ultimo = pagina[pagina.length - 1];
      if (ultimo)
        cursorPostsRef.current = { id: ultimo.id, data: ultimo.created_at };
      setHaMaisPosts(listaPosts.length > 10);
    } catch (erro) {
      if (!consulta.atual()) return;
      avisar(
        "Não foi possível carregar mais publicações",
        erro instanceof Error ? erro.message : "Tente novamente.",
      );
    } finally {
      if (consulta.atual()) setCarregandoMaisPosts(false);
      consulta.concluir();
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (
        !carregandoInicialRef.current &&
        familiaVerificadaRef.current === familiaAtivaIdRef.current &&
        Date.now() - ultimaConsultaRef.current < 12000 &&
        ultimaRevisaoRef.current === obterRevisaoDeDados()
      )
        return;
      const espera = setTimeout(() => {
        void carregar();
      }, 80);
      return () => {
        clearTimeout(espera);
        controleConsultas.current.cancelar();
      };
    }, [carregar]),
  );

  async function criarFamilia(nome: string): Promise<boolean> {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return false;
    if (!nome.trim() || nome.trim().length > 70) {
      avisar("Nome da família", "Informe um nome com até 70 caracteres.");
      return false;
    }
    mutandoFamiliaRef.current = true;
    setCriandoFamilia(true);
    try {
      if (!(await confirmarTrocaComFoto())) return false;
      const { data: usuario, error } = await supabase.auth.getUser();
      if (error || !usuario.user)
        throw new Error("Entre novamente na sua conta.");
      let tentativa = tentativaCriacaoRef.current;
      if (
        !tentativa ||
        tentativa.usuarioId !== usuario.user.id ||
        tentativa.nome !== nome.trim()
      ) {
        tentativa = {
          id: novoIdSerie(),
          usuarioId: usuario.user.id,
          nome: nome.trim(),
        };
        tentativaCriacaoRef.current = tentativa;
      }
      const criada = await criarFamiliaComId(
        tentativa.usuarioId,
        tentativa.nome,
        tentativa.id,
      );
      tentativaCriacaoRef.current = null;
      familiasRef.current = [
        ...familiasRef.current.filter((f) => f.id !== criada.id),
        criada,
      ];
      setFamilias(familiasRef.current);
      await carregar(criada.id);
      avisar(
        "Família criada",
        "A nova família tem seu próprio código e publicações. Compartilhe o convite com quem deseja adicionar.",
      );
      return true;
    } catch (problema) {
      avisar(
        "Não foi possível criar a família",
        mensagemErro(problema, "Tente novamente."),
      );
      return false;
    } finally {
      mutandoFamiliaRef.current = false;
      setCriandoFamilia(false);
    }
  }

  async function renomearFamilia(id: string, nome: string): Promise<boolean> {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return false;
    if (!nome.trim() || nome.trim().length > 70) {
      avisar("Nome da família", "Informe um nome com até 70 caracteres.");
      return false;
    }
    mutandoFamiliaRef.current = true;
    setAlterandoFamilia(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Entre novamente na sua conta.");
      const familiaAlvo = familiasRef.current.find((item) => item.id === id);
      if (!familiaAlvo || familiaAlvo.owner_user_id !== data.user.id) {
        throw new Error("Somente quem criou a família pode mudar o nome.");
      }
      await renomearFamiliaNoBanco(id, nome.trim());
      await carregar(familiaAtivaIdRef.current ?? undefined);
      avisar("Nome atualizado", "O nome da família foi alterado.");
      return true;
    } catch (problema) {
      avisar(
        "Não foi possível renomear a família",
        mensagemErro(problema, "Tente novamente."),
      );
      return false;
    } finally {
      mutandoFamiliaRef.current = false;
      setAlterandoFamilia(false);
    }
  }

  async function sairDaFamilia(id: string): Promise<boolean> {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return false;
    mutandoFamiliaRef.current = true;
    setAlterandoFamilia(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Entre novamente na sua conta.");
      const familiaAlvo = familiasRef.current.find((item) => item.id === id);
      if (!familiaAlvo)
        throw new Error("Esta família não está mais disponível.");
      if (familiaAlvo.owner_user_id === data.user.id) {
        throw new Error(
          "Quem criou a família não pode simplesmente sair. Use ‘Excluir família’ ou peça ao grupo para organizar a propriedade antes.",
        );
      }
      await sairDaFamiliaNoBanco(id);
      if (familiaAtivaIdRef.current === id)
        await guardarFamiliaPreferida(data.user.id, null);
      await carregar();
      avisar(
        "Você saiu da família",
        "Sua conta não faz mais parte desse grupo.",
      );
      return true;
    } catch (problema) {
      avisar(
        "Não foi possível sair da família",
        mensagemErro(problema, "Tente novamente."),
      );
      return false;
    } finally {
      mutandoFamiliaRef.current = false;
      setAlterandoFamilia(false);
    }
  }

  async function excluirFamilia(id: string): Promise<boolean> {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return false;
    excluindoRef.current = true;
    setExcluindo(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Entre novamente na sua conta.");
      const familiaAlvo = familiasRef.current.find((item) => item.id === id);
      if (!familiaAlvo || familiaAlvo.owner_user_id !== data.user.id) {
        throw new Error("Somente quem criou a família pode excluí-la.");
      }
      if (familiaAtivaIdRef.current === id && !(await confirmarTrocaComFoto()))
        return false;
      await excluirFamiliaNoBanco(id);
      rascunhosRef.current.delete(id);
      if (familiaAtivaIdRef.current === id)
        await guardarFamiliaPreferida(data.user.id, null);
      await carregar();
      avisar(
        "Família excluída",
        "A família e as publicações vinculadas a ela foram removidas.",
      );
      return true;
    } catch (problema) {
      avisar(
        "Não foi possível excluir a família",
        mensagemErro(problema, "Tente novamente."),
      );
      return false;
    } finally {
      excluindoRef.current = false;
      setExcluindo(false);
    }
  }

  async function entrarNaFamilia() {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current
    )
      return;
    if (!codigoConvite.trim()) {
      avisar("Código de convite", "Digite o código recebido de um familiar.");
      return;
    }
    mutandoFamiliaRef.current = true;
    setEntrandoFamilia(true);
    try {
      if (!(await confirmarTrocaComFoto())) return;
      const { data, error } = await supabase.rpc(
        "entrar_na_familia_por_codigo",
        { p_codigo: codigoConvite.trim().toUpperCase() },
      );
      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0))
        throw new Error(
          "Não foi possível encontrar uma família com esse código.",
        );
      let idFamiliaEntrou =
        typeof data === "string"
          ? data
          : Array.isArray(data)
            ? (data[0]?.family_id ?? data[0]?.id)
            : data && typeof data === "object"
              ? ((data as { family_id?: string; id?: string }).family_id ??
                (data as { id?: string }).id)
              : undefined;
      if (typeof idFamiliaEntrou !== "string") {
        const { data: destino, error: erroDestino } = await supabase
          .from("families")
          .select("id")
          .eq("invite_code", codigoConvite.trim().toUpperCase())
          .maybeSingle();
        if (erroDestino) throw erroDestino;
        idFamiliaEntrou = destino?.id;
      }
      setCodigoConvite("");
      await carregar(
        typeof idFamiliaEntrou === "string" ? idFamiliaEntrou : undefined,
      );
      avisar(
        "Você entrou na família",
        "Agora você pode alternar entre suas famílias e compartilhar publicações com o grupo selecionado.",
      );
    } catch (problema) {
      avisar(
        "Não foi possível entrar",
        problema instanceof Error
          ? problema.message
          : "Confira o código e tente novamente.",
      );
    } finally {
      mutandoFamiliaRef.current = false;
      setEntrandoFamilia(false);
    }
  }

  function escolherFoto() {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      carregandoInicialRef.current
    )
      return;
    const destino = familiaAtivaIdRef.current;

    void ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
    })
      .then((resultado) => {
        if (
          destino === familiaAtivaIdRef.current &&
          !resultado.canceled &&
          resultado.assets[0]
        ) {
          setFotoSelecionada(resultado.assets[0]);
        }
      })
      .catch((problema: unknown) => {
        avisar(
          "Não foi possível abrir a galeria",
          problema instanceof Error ? problema.message : "Tente novamente.",
        );
      });
  }

  function selecionarFotoWeb(imagem: ImagePicker.ImagePickerAsset) {
    if (familiaSelecaoFotoRef.current !== familiaAtivaIdRef.current) {
      URL.revokeObjectURL(imagem.uri);
      avisar(
        "Família alterada",
        "Selecione novamente a foto para a família atual.",
      );
      return;
    }
    setFotoSelecionada(imagem);
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
    if (
      !familia ||
      !usuarioId ||
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current ||
      carregandoInicialRef.current ||
      familia.id !== familiaAtivaIdRef.current ||
      familiaVerificadaRef.current !== familia.id
    )
      return;
    const familiaDestino = familia.id;
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
    publicandoRef.current = true;
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
        const mime = (
          fotoSelecionada.mimeType ||
          fotoSelecionada.file?.type ||
          "image/jpeg"
        ).toLowerCase();
        const extensoes: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/heic": "heic",
          "image/heif": "heif",
          "image/avif": "avif",
          "image/gif": "gif",
        };
        if (!extensoes[mime]) {
          throw new Error(
            "Formato de imagem não suportado. Use JPG, PNG, WEBP, HEIC, HEIF, AVIF ou GIF.",
          );
        }
        const tamanhoInformado =
          fotoSelecionada.fileSize ?? fotoSelecionada.file?.size;
        if (
          typeof tamanhoInformado === "number" &&
          tamanhoInformado > 10 * 1024 * 1024
        ) {
          throw new Error(
            "A foto ultrapassa o limite de 10 MB. Escolha uma imagem menor.",
          );
        }
        const conteudo = await obterConteudoFoto(fotoSelecionada);
        const tamanhoReal =
          conteudo instanceof ArrayBuffer
            ? conteudo.byteLength
            : (conteudo as Blob).size;
        if (tamanhoReal > 10 * 1024 * 1024) {
          throw new Error(
            "A foto ultrapassa o limite de 10 MB. Escolha uma imagem menor.",
          );
        }
        caminhoFoto = `${familiaDestino}/${usuarioId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${extensoes[mime]}`;
        const { error } = await supabase.storage
          .from("community-photos")
          .upload(caminhoFoto, conteudo, {
            contentType: mime,
            cacheControl: "3600",
            upsert: false,
          });
        if (error) throw error;
      }
      const { error } = await supabase.from("community_posts").insert({
        family_id: familiaDestino,
        user_id: usuarioId,
        author_name: nomeUsuario,
        author_avatar_url: avatarUsuario,
        content: textoPublicacao.trim() || null,
        post_type: tipoPublicacao,
        image_path: caminhoFoto,
        workout_plan_name: nomePlano,
        workout_snapshot: snapshot ?? [],
      });
      if (error) throw error;
      setTextoPublicacao("");
      setFotoSelecionada(null);
      setPlanoSelecionado("");
      setTipoPublicacao("texto");
      rascunhosRef.current.delete(familiaDestino);
      rascunhoAtualRef.current = { tipo: "texto", texto: "", plano: "" };
      await carregar(familiaDestino);
    } catch (problema) {
      if (caminhoFoto) {
        try {
          await supabase.storage.from("community-photos").remove([caminhoFoto]);
        } catch {}
      }
      avisar(
        "Não foi possível publicar",
        mensagemErro(
          problema,
          "O Supabase recusou a publicação. Confira se o bucket community-photos e as políticas de armazenamento foram configurados no SQL Editor.",
        ),
      );
    } finally {
      publicandoRef.current = false;
      setPublicando(false);
    }
  }

  async function excluirPublicacao(post: Publicacao) {
    if (
      publicandoRef.current ||
      mutandoFamiliaRef.current ||
      excluindoRef.current ||
      post.family_id !== familiaAtivaIdRef.current ||
      post.user_id !== usuarioId
    )
      return;
    excluindoRef.current = true;
    setExcluindo(true);
    try {
      const confirmado =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.confirm("Excluir esta publicação da família selecionada?")
          : await new Promise<boolean>((resolve) =>
              Alert.alert(
                "Excluir publicação",
                "Deseja remover esta publicação?",
                [
                  {
                    text: "Cancelar",
                    style: "cancel",
                    onPress: () => resolve(false),
                  },
                  {
                    text: "Excluir",
                    style: "destructive",
                    onPress: () => resolve(true),
                  },
                ],
              ),
            );
      if (!confirmado || post.family_id !== familiaAtivaIdRef.current) return;
      const { data, error } = await supabase
        .from("community_posts")
        .delete()
        .eq("id", post.id)
        .eq("user_id", usuarioId)
        .eq("family_id", post.family_id)
        .select("id");
      if (error) throw error;
      if (data?.length && fotoPertenceAFamilia(post.image_path, post.family_id))
        await supabase.storage
          .from("community-photos")
          .remove([post.image_path!]);
      setPublicacoes((lista) => lista.filter((item) => item.id !== post.id));
    } catch (problema) {
      avisar(
        "Não foi possível excluir",
        mensagemErro(problema, "Tente novamente."),
      );
    } finally {
      excluindoRef.current = false;
      setExcluindo(false);
    }
  }
  const gerenciadorFamilias = (
    <MinhasFamilias
      familias={familias}
      ativaId={familiaAtivaId}
      usuarioId={usuarioId}
      cor={corTema}
      bloqueado={
        publicando ||
        criandoFamilia ||
        entrandoFamilia ||
        alterandoFamilia ||
        excluindo
      }
      criando={criandoFamilia}
      onSelecionar={(id) => void trocarFamilia(id)}
      onCriar={criarFamilia}
      onRenomear={renomearFamilia}
      onSair={sairDaFamilia}
      onExcluir={excluirFamilia}
    />
  );

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
        {gerenciadorFamilias}
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
            accessibilityRole="button"
            onPress={entrarNaFamilia}
            disabled={
              entrandoFamilia || criandoFamilia || publicando || excluindo
            }
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
    <>
      <FlatList
        style={estilos.tela}
        contentContainerStyle={estilos.conteudo}
        data={publicacoes}
        keyExtractor={(post) => post.id}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
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
            {gerenciadorFamilias}
            <View style={estilos.cartaoCodigo}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={estilos.rotulo}>CONVITE · {familia.name}</Text>
                <Text selectable style={[estilos.codigo, { color: corTema }]}>
                  {familia.invite_code}
                </Text>
                <Text style={estilos.secundario}>
                  Toque e segure o código para copiá-lo e enviar aos familiares.
                </Text>
              </View>
            </View>
            <View style={estilos.cartaoEntrarFamilia}>
              <Text style={estilos.tituloCartao}>Entrar em outra família</Text>
              <Text style={estilos.secundario}>
                Use o código de convite de outro grupo. Você poderá alternar
                entre as famílias das quais participa.
              </Text>
              <TextInput
                value={codigoConvite}
                onChangeText={setCodigoConvite}
                placeholder="Código de convite"
                placeholderTextColor="#758178"
                style={estilos.input}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
              />
              <TouchableOpacity
                onPress={entrarNaFamilia}
                disabled={
                  entrandoFamilia || criandoFamilia || publicando || excluindo
                }
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
            <Text style={estilos.tituloSecao}>
              Progresso semanal da família
            </Text>
            <Text style={estilos.secundario}>
              Contagem da semana atual, de segunda a domingo. Os números são
              reiniciados a cada nova semana.
            </Text>
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
                    <Text
                      style={{
                        color: corTema,
                        fontSize: 19,
                        fontWeight: "900",
                      }}
                    >
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
            <Text style={estilos.tituloSecao}>
              Publicações de {familia.name}
            </Text>
            <View style={estilos.cartaoPublicar}>
              <Text style={estilos.tituloCartao}>
                Publicar em {familia.name}
              </Text>
              <Text style={estilos.secundario}>
                Esta publicação será compartilhada somente com os integrantes de{" "}
                {familia.name}.
              </Text>
              <View style={estilos.opcoesPublicacao}>
                {(
                  [
                    ["texto", "✍️", "Texto"],
                    ["foto", "📷", "Foto"],
                    ["treino", "🏋️", "Treino"],
                  ] as [TipoPublicacao, string, string][]
                ).map(([valor, icone, rotulo]) => (
                  <TouchableOpacity
                    key={valor}
                    disabled={
                      publicando ||
                      atualizando ||
                      criandoFamilia ||
                      entrandoFamilia
                    }
                    accessibilityRole="button"
                    accessibilityLabel={
                      rotulo === "Treino" ? "Compartilhar treino" : rotulo
                    }
                    onPress={() => {
                      setTipoPublicacao(valor);
                      if (valor !== "foto") {
                        setFotoSelecionada(null);
                      }
                    }}
                    style={[
                      estilos.opcao,
                      tipoPublicacao === valor && {
                        borderColor: corTema,
                        backgroundColor: `${corTema}18`,
                      },
                    ]}
                  >
                    <View style={estilos.conteudoOpcao}>
                      <Text style={estilos.iconeOpcao}>{icone}</Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          estilos.opcaoTexto,
                          tipoPublicacao === valor && { color: corTema },
                        ]}
                      >
                        {rotulo}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                accessibilityLabel="Texto para a família selecionada"
                editable={
                  !publicando &&
                  !atualizando &&
                  !criandoFamilia &&
                  !entrandoFamilia
                }
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
                  {Platform.OS === "web" ? (
                    <View style={estilos.acoesFoto}>
                      <EntradaGaleriaWeb
                        rotulo="Escolher foto da comunidade"
                        texto={fotoSelecionada ? "Trocar foto" : "Galeria"}
                        corTema={corTema}
                        disabled={
                          publicando ||
                          atualizando ||
                          criandoFamilia ||
                          entrandoFamilia
                        }
                        onAbrir={() => {
                          familiaSelecaoFotoRef.current =
                            familiaAtivaIdRef.current;
                        }}
                        onSelecionar={selecionarFotoWeb}
                        onErro={(erro) =>
                          avisar("Não foi possível escolher a foto", erro.message)
                        }
                      />
                      <EntradaGaleriaWeb
                        rotulo="Tirar foto para a comunidade"
                        texto="Câmera"
                        corTema={corTema}
                        capture="environment"
                        disabled={
                          publicando ||
                          atualizando ||
                          criandoFamilia ||
                          entrandoFamilia
                        }
                        onAbrir={() => {
                          familiaSelecaoFotoRef.current =
                            familiaAtivaIdRef.current;
                        }}
                        onSelecionar={selecionarFotoWeb}
                        onErro={(erro) =>
                          avisar("Não foi possível escolher a foto", erro.message)
                        }
                      />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[estilos.botaoSecundario, { borderColor: corTema }]}
                      accessibilityRole="button"
                      accessibilityLabel="Escolher foto da comunidade"
                      disabled={
                        publicando ||
                        atualizando ||
                        criandoFamilia ||
                        entrandoFamilia
                      }
                      onPress={escolherFoto}
                    >
                      <Text style={{ color: corTema, fontWeight: "800" }}>
                        {fotoSelecionada ? "Trocar foto" : "Adicionar foto"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {fotoSelecionada ? (
                    <>
                      <Image
                        accessibilityLabel="Prévia da foto da comunidade"
                        source={{ uri: fotoSelecionada.uri }}
                        style={estilos.previewFoto}
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => setFotoSelecionada(null)}
                        disabled={publicando}
                        style={estilos.botaoSecundario}
                      >
                        <Text style={{ color: corTema, fontWeight: "800" }}>
                          Remover foto
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              ) : null}
              {tipoPublicacao === "treino" ? (
                <View style={{ gap: 8 }}>
                  <Text style={estilos.rotulo}>
                    SELECIONE UM DOS SEUS TREINOS
                  </Text>
                  {planos.length ? (
                    planos.map((plano) => (
                      <TouchableOpacity
                        key={plano.id}
                        disabled={
                          publicando ||
                          atualizando ||
                          criandoFamilia ||
                          entrandoFamilia
                        }
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
                accessibilityRole="button"
                accessibilityLabel={`Publicar em ${familia.name}`}
                onPress={publicar}
                disabled={
                  publicando ||
                  atualizando ||
                  criandoFamilia ||
                  entrandoFamilia ||
                  excluindo ||
                  Boolean(erro)
                }
                style={[
                  estilos.botao,
                  { backgroundColor: corTema, marginTop: 12 },
                ]}
              >
                {publicando ? (
                  <ActivityIndicator color="#0C120E" />
                ) : (
                  <Text style={estilos.textoBotaoEscuro}>
                    Publicar em {familia.name}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item: post }) => (
          <View key={post.id} style={estilos.cartaoPost}>
            <View style={estilos.cabecalhoPost}>
              <View
                style={[
                  estilos.avatarPequeno,
                  { borderColor: corTema, backgroundColor: `${corTema}20` },
                ]}
              >
                {post.author_avatar_url ? (
                  <ImagemLeve
                    uri={post.author_avatar_url}
                    larguraPreview={96}
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
                <TouchableOpacity
                  disabled={
                    publicando || criandoFamilia || entrandoFamilia || excluindo
                  }
                  onPress={() => void excluirPublicacao(post)}
                >
                  <Text style={estilos.excluir}>Excluir</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {post.content ? (
              <Text style={estilos.textoPost}>{post.content}</Text>
            ) : null}
            {post.image_url ? (
              <ImagemLeve
                uri={post.image_url}
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
        )}
        ListEmptyComponent={
          <Text style={estilos.secundario}>
            Ainda não há publicações. Seja a primeira pessoa a compartilhar uma
            conquista!
          </Text>
        }
        ListFooterComponent={
          <View style={{ gap: 14 }}>
            {haMaisPosts ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={{ alignItems: "center", padding: 16 }}
                onPress={() => void carregarMaisPublicacoes()}
                disabled={carregandoMaisPosts || atualizando}
              >
                <Text style={{ color: corTema, fontWeight: "700" }}>
                  {carregandoMaisPosts
                    ? "Carregando publicações..."
                    : "Ver mais publicações"}
                </Text>
              </TouchableOpacity>
            ) : null}
            {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
            {atualizando ? <ActivityIndicator color={corTema} /> : null}
            <Text style={estilos.rodape}>
              Publicações e estatísticas ficam visíveis apenas para integrantes
              deste grupo familiar.
            </Text>
          </View>
        }
      />
    </>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#101312" },
  conteudo: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === "web" ? 8 : 24,
    paddingBottom: 14,
    gap: 14,
  },
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
  cartaoFamilias: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 15,
    padding: 14,
    gap: 10,
  },
  gradeFamilias: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opcaoFamilia: {
    maxWidth: "100%",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#354139",
    backgroundColor: "#111713",
  },
  nomeFamilia: { color: "#D6DED8", fontSize: 12, fontWeight: "800" },
  cartaoEntrarFamilia: {
    backgroundColor: "#171D19",
    borderWidth: 1,
    borderColor: "#2C3730",
    borderRadius: 15,
    padding: 14,
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
  conteudoOpcao: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconeOpcao: { fontSize: 13 },
  opcaoTexto: { color: "#C8D1CB", fontSize: 12, fontWeight: "800" },
  fotoArea: { gap: 10 },
  acoesFoto: { flexDirection: "row", alignItems: "stretch", gap: 8 },
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
