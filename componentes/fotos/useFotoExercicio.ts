import { useRef, useState } from "react";
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { prepararFotoExercicio } from "../../servicos/fotoExercicio";
import { Alert } from "../../servicos/alerta";
import { registrarMudancaDeDados } from "../../servicos/revisaoDados";
import { supabase } from "../../supabase";

export type ExercicioComFoto = { id: string; plan_id: string; name: string; photo_path?: string | null; photo_url?: string | null };
export type FonteFoto = "biblioteca" | "camera";

export async function selecionarFotoNativa(origem: FonteFoto) {
  if (origem === "camera") {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted)
      throw new Error("Permita o acesso à câmera nas configurações do aparelho.");
  }
  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.75,
    base64: true,
  };
  const resultado = origem === "camera"
    ? await ImagePicker.launchCameraAsync(opcoes)
    : await ImagePicker.launchImageLibraryAsync(opcoes);
  return resultado.assets?.[0];
}

export function useFotoExercicio<T extends ExercicioComFoto>({ usuarioId, avisar, aoSalvar, salvarVinculo, salvarFotoLocal }: {
  usuarioId: string;
  avisar: (titulo: string, mensagem: string) => void;
  aoSalvar: (exercicio: T, caminho: string | null, url: string | null) => void;
  salvarVinculo?: (exercicio: T, caminho: string) => Promise<boolean>;
  salvarFotoLocal?: (exercicio: T, caminho: string | null) => Promise<boolean | undefined>;
}) {
  const [origemFotoAberta, setOrigemFotoAberta] = useState<T | null>(null);
  const [fotoCarregandoId, setFotoCarregandoId] = useState<string | null>(null);
  const fotoEmEnvioRef = useRef(false);

  async function vincularFoto(exercicio: T, caminho: string | null) {
    const salvoLocal = await salvarFotoLocal?.(exercicio, caminho);
    if (salvoLocal !== undefined) return salvoLocal;

    const atualizar = supabase.from("exercises").update({ photo_path: caminho })
      .eq("id", exercicio.id).eq("plan_id", exercicio.plan_id).eq("user_id", usuarioId);
    const { data, error } = await (exercicio.photo_path
      ? atualizar.eq("photo_path", exercicio.photo_path)
      : atualizar.is("photo_path", null)).select("id").maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async function adicionarOuTrocarFoto(exercicio: T, origem: FonteFoto, capturada?: ImagePicker.ImagePickerAsset) {
    const liberar = () => {
      if (Platform.OS === "web" && capturada?.uri.startsWith("blob:")) URL.revokeObjectURL(capturada.uri);
    };
    if (fotoEmEnvioRef.current) { liberar(); return; }
    fotoEmEnvioRef.current = true;
    setFotoCarregandoId(exercicio.id);
    try {
      if (!usuarioId) throw new Error("Entre novamente na sua conta.");
      if (!capturada && Platform.OS === "web") return;
      const imagem = capturada ?? await selecionarFotoNativa(origem);
      if (!imagem) return;

      const { arquivoImagem, contentType, extensao } = await prepararFotoExercicio(imagem);
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== usuarioId) throw new Error("A conta ativa mudou. Abra o exercício novamente.");
      const caminho = `${usuarioId}/${exercicio.id}/${Date.now()}.${extensao}`;
      const bucket = supabase.storage.from("exercise-photos");
      const { error: erroUpload } = await bucket.upload(caminho, arquivoImagem, { contentType, cacheControl: "3600", upsert: false });
      if (erroUpload) throw erroUpload;

      if (salvarVinculo) {
        if (await salvarVinculo(exercicio, caminho)) avisar("Foto salva", "A foto do exercício foi atualizada.");
        return;
      }
      if (!(await vincularFoto(exercicio, caminho))) {
        await bucket.remove([caminho]);
        throw new Error("O exercício ou a foto mudou. Abra o exercício novamente para atualizar a imagem.");
      }
      const { data: assinatura } = await bucket.createSignedUrl(caminho, 604800);
      aoSalvar(exercicio, caminho, assinatura?.signedUrl ?? null);
      registrarMudancaDeDados(exercicio.plan_id);
      if (exercicio.photo_path) await bucket.remove([exercicio.photo_path]);
      avisar("Foto salva", "A foto do exercício foi atualizada.");
    } catch (erro) {
      const mensagem = erro && typeof erro === "object" && "message" in erro ? String(erro.message) : "Não foi possível selecionar ou enviar a foto.";
      avisar("Erro ao adicionar foto", mensagem);
    } finally {
      liberar();
      fotoEmEnvioRef.current = false;
      setFotoCarregandoId(null);
    }
  }

  function escolherFonteFoto(origem: FonteFoto) {
    if (!origemFotoAberta || Platform.OS === "web" || fotoEmEnvioRef.current) return;
    const exercicio = origemFotoAberta;
    setOrigemFotoAberta(null);
    void adicionarOuTrocarFoto(exercicio, origem);
  }

  async function removerFoto(exercicio: T, caminho: string) {
    if (fotoEmEnvioRef.current) return;
    fotoEmEnvioRef.current = true;
    setFotoCarregandoId(exercicio.id);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!usuarioId || auth.session?.user.id !== usuarioId) {
        throw new Error("A conta ativa mudou. Abra o exercício novamente.");
      }
      if (!(await vincularFoto(exercicio, null)))
        throw new Error("A foto mudou. Abra o exercício novamente e confira a imagem atual.");

      aoSalvar(exercicio, null, null);
      setOrigemFotoAberta(null);
      registrarMudancaDeDados(exercicio.plan_id);
      const { error: erroArquivo } = await supabase.storage.from("exercise-photos").remove([caminho]);
      if (erroArquivo) avisar("Foto retirada do exercício", "O armazenamento não confirmou a exclusão do arquivo.");
    } catch (erro) {
      const mensagem = erro && typeof erro === "object" && "message" in erro
        ? String(erro.message) : "Confira a conexão e tente novamente.";
      avisar("Não foi possível excluir a foto", mensagem);
    } finally {
      fotoEmEnvioRef.current = false;
      setFotoCarregandoId(null);
    }
  }

  function confirmarExclusaoFoto() {
    const exercicio = origemFotoAberta;
    const caminho = exercicio?.photo_path;
    if (!exercicio || !caminho || salvarVinculo || fotoEmEnvioRef.current) return;
    Alert.alert("Excluir foto?", `Remover a foto de ${exercicio.name}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir foto", style: "destructive", onPress: () => void removerFoto(exercicio, caminho) },
    ]);
  }

  return { origemFotoAberta, setOrigemFotoAberta, fotoCarregandoId, fotoEmEnvioRef, adicionarOuTrocarFoto, escolherFonteFoto, confirmarExclusaoFoto };
}
