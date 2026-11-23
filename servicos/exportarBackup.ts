import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { TABELAS_BACKUP } from "./backup";
import { listarFotosModelo, listarRascunhos } from "./treinoLocal";
import { exportarNutricaoLocal } from "./nutricaoRepositorio";

function semReferenciasTemporarias(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semReferenciasTemporarias);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).filter(([k]) => !["access_token", "refresh_token", "photo_url", "image_url", "avatar_url", "foto_url"].includes(k)).map(([k,v]) => [k, k === "photo_path" && typeof v === "string" && /[:?]/.test(v) ? null : semReferenciasTemporarias(v)]));
}
export async function prepararBackup(usuario: User) {
  const tabelas: Record<string, Record<string, unknown>[]> = {};
  for (const tabela of TABELAS_BACKUP) {
    const linhas: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (;;) {
      let consulta = supabase.from(tabela).select("*").eq("user_id",usuario.id).order("id").limit(500);
      if (cursor) consulta = consulta.gt("id",cursor);
      const { data, error } = await consulta;
      if (error) throw error;
      linhas.push(...(data ?? []));
      if (!data || data.length < 500) break;
      cursor = data[data.length-1].id as string;
    }
    tabelas[tabela] = linhas;
  }
  const pendencias = { observacao: "Cópias locais sem confirmação remota; não são restauradas automaticamente.", treinos: await listarRascunhos(usuario.id), nutricao: await exportarNutricaoLocal(usuario.id), fotos: await listarFotosModelo(usuario.id) };
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== usuario.id) throw new Error("A conta foi alterada durante a exportação. Tente novamente.");
  const meta = usuario.user_metadata ?? {};
  return semReferenciasTemporarias({ aplicativo: "Treino Família", formato: "treino-familia-backup", versao: 2, exportado_em: new Date().toISOString(), usuario: { id: usuario.id, email: usuario.email ?? null, perfil: { nome: meta.nome ?? null, tema_cor: meta.tema_cor ?? null, peso_kg: meta.peso_kg ?? null, altura_cm: meta.altura_cm ?? null, idade: meta.idade ?? null, sexo: meta.sexo ?? null } }, tabelas, pendencias_locais: pendencias, observacao: "Inclui somente registros privados desta conta. Imagens são referências de armazenamento, sem seus arquivos. Não inclui permissões, famílias, vínculos, senhas ou tokens. A leitura das tabelas e filas ocorre em momentos próximos, sem snapshot transacional entre elas." });
}
