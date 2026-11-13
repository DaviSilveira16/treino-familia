import { supabase } from "../supabase";
import { confirmarFotoModelo, lerExclusaoTreino, listarFotosModelo } from "./treinoLocal";
import { registrarMudancaDeDados } from "./revisaoDados";
import { medir } from "./performance";

const emEnvio = new Map<string, Promise<void>>();

export function sincronizarFotosModelo(usuarioId: string) {
  const emCurso = emEnvio.get(usuarioId);
  if (emCurso) return emCurso;
  const tarefa = enviarFotos(usuarioId).finally(() => emEnvio.delete(usuarioId));
  emEnvio.set(usuarioId, tarefa);
  return tarefa;
}

async function enviarFotos(usuarioId: string) {
  const fotos = await listarFotosModelo(usuarioId);
  if (!fotos.length) return;
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id !== usuarioId) return;

  const planosAlterados = new Set<string>();
  for (const { id, foto } of fotos) {
    if (!foto) continue;
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

      const bucket = supabase.storage.from("exercise-photos");
      const { error: erroCopia } = await medir("treino.fotoModelo", () => bucket.copy(foto.origem, foto.destino));
      if (erroCopia && !(await bucket.exists(foto.destino)).data) {
        if ("code" in erroCopia && erroCopia.code === "NoSuchKey" && !(await bucket.exists(foto.origem)).data) {
          await confirmarFotoModelo(id);
          continue;
        }
        throw erroCopia;
      }

      if (await lerExclusaoTreino(usuarioId, foto.sessaoId)) {
        await confirmarFotoModelo(id);
        continue;
      }
      const { error } = await supabase.from("exercises").update({ photo_path: foto.destino })
        .eq("id", foto.exercicioId).eq("plan_id", foto.planId).eq("user_id", usuarioId).is("photo_path", null);
      if (error) throw error;
      await confirmarFotoModelo(id);
      planosAlterados.add(foto.planId);
    } catch {
      // Preserva cada envio independentemente e tenta de novo ao recuperar a conexão.
    }
  }
  for (const planId of planosAlterados) registrarMudancaDeDados(planId, "foto");
}
