import { supabase } from "../supabase";
import { confirmarFotoModelo, guardarFalhaFotoModelo, lerExclusaoTreino, listarFotosModelo, type FotoModeloPendente } from "./treinoLocal";
import { registrarMudancaDeDados } from "./revisaoDados";
import { medir } from "./performance";

const emEnvio = new Map<string, { tarefa: Promise<void>; manual: boolean }>();

export function sincronizarFotosModelo(usuarioId: string, manual = false): Promise<void> {
  const emCurso = emEnvio.get(usuarioId);
  if (emCurso) {
    if (manual && !emCurso.manual)
      return emCurso.tarefa.catch(() => {}).then(() => sincronizarFotosModelo(usuarioId, true));
    return emCurso.tarefa;
  }
  const tarefa = enviarFotos(usuarioId, manual).finally(() => emEnvio.delete(usuarioId));
  emEnvio.set(usuarioId, { tarefa, manual });
  return tarefa;
}

async function enviarFotos(usuarioId: string, manual: boolean) {
  const fotos = await listarFotosModelo(usuarioId);
  if (!fotos.length) return;
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id !== usuarioId) return;

  const planosAlterados = new Set<string>();
  for (const { id, foto } of fotos) {
    if (!foto || (!manual && (foto.falha?.tentarEm ?? 0) > Date.now())) continue;
    foto.ultimaTentativaEm = new Date().toISOString();
    await guardarFalhaFotoModelo(id, foto);
    let etapa: NonNullable<FotoModeloPendente["falha"]>["etapa"] = "conferir";
    try {
      if (await lerExclusaoTreino(usuarioId, foto.sessaoId)) {
        await confirmarFotoModelo(id);
        continue;
      }
      const { data: exercicio, error: erroExercicio } = await supabase
        .from("exercises").select("id, photo_path").eq("id", foto.exercicioId)
        .eq("plan_id", foto.planId).eq("user_id", usuarioId).maybeSingle();
      if (erroExercicio) throw erroExercicio;
      if (!exercicio || exercicio.photo_path) {
        await confirmarFotoModelo(id);
        continue;
      }

      etapa = "copiar";
      const bucket = supabase.storage.from("exercise-photos");
      const { error: erroCopia } = await medir("treino.fotoModelo", () => bucket.copy(foto.origem, foto.destino));
      if (erroCopia && !(await bucket.exists(foto.destino)).data) {
        throw erroCopia;
      }

      if (await lerExclusaoTreino(usuarioId, foto.sessaoId)) {
        await confirmarFotoModelo(id);
        continue;
      }
      etapa = "vincular";
      const { error } = await supabase.from("exercises").update({ photo_path: foto.destino })
        .eq("id", foto.exercicioId).eq("plan_id", foto.planId).eq("user_id", usuarioId).is("photo_path", null);
      if (error) throw error;
      await confirmarFotoModelo(id);
      planosAlterados.add(foto.planId);
    } catch (erro) {
      const detalhe = erro as { status?: number; statusCode?: string; code?: string; name?: string } | null;
      const status = detalhe?.status ?? Number(detalhe?.statusCode);
      const motivo = detalhe?.code === "NoSuchKey" ? "origem"
        : status === 401 || status === 403 || detalhe?.code === "42501" ? "permissao"
        : status >= 500 || detalhe?.name === "AbortError" || detalhe?.name === "TypeError" ? "conexao"
        : "outro";
      const tentativas = (foto.falha?.tentativas ?? 0) + 1;
      const espera = Math.min(15 * 60_000, 12_000 * 2 ** Math.min(tentativas - 1, 7));
      await guardarFalhaFotoModelo(id, {
        ...foto,
        falha: { motivo, etapa, tentativas, tentarEm: Date.now() + espera },
      });
    }
  }
  for (const planId of planosAlterados) registrarMudancaDeDados(planId, "foto");
}
