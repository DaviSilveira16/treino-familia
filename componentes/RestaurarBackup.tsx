import React, { useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { supabase } from "../supabase";
import { validarBackup, LIMITE_BACKUP, type Backup } from "../servicos/backup";
import { registrarMudancaDeDados } from "../servicos/revisaoDados";
import { codigoFalha, registrarDiagnostico } from "../servicos/diagnostico";
import { BotaoAcao, CartaoFerramenta, ui } from "./ControlesAcessiveis";

type Relatorio = { tabelas: { tabela: string; novos: number; preservados: number; recusados: number }[]; concluido: boolean; reutilizado?: boolean };
const nomes: Record<string, string> = { workout_plans: "Treinos", exercises: "Exercícios", exercise_load_defaults: "Cargas de referência", workout_sessions: "Sessões", workout_sets: "Séries", cardio_activities: "Cardios", cardio_sessions: "Sessões de cardio", physical_measurements: "Medições", weekly_workout_schedule: "Agenda semanal", nutrition_foods: "Alimentos próprios", nutrition_goals: "Metas de nutrição", nutrition_templates: "Modelos de dieta", nutrition_days: "Diários alimentares", nutrition_preferences: "Preferências de nutrição" };
export default function RestaurarBackup({ usuarioId }: { usuarioId: string }) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [previa, setPrevia] = useState<Relatorio | null>(null);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const lock = useRef(false);
  const sequencia = useRef(0);
  async function processar(b: Backup, confirmar: boolean) {
    if (lock.current) return;
    lock.current = true; setOcupado(true); setAviso("");
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== usuarioId) throw new Error("Entre novamente na mesma conta.");
      const { data, error } = await supabase.rpc("tf_restore_backup", { p_backup: b, p_expected_user: usuarioId, p_confirmar: confirmar });
      if (error) throw error;
      setPrevia(data as Relatorio);
      if (confirmar) { registrarMudancaDeDados(); registrarDiagnostico("backup", "OK"); setAviso("Restauração confirmada. Os registros existentes foram preservados."); }
    } catch (e) { registrarDiagnostico("backup", codigoFalha(e)); setAviso("Restauração não confirmada. Nenhuma alteração parcial é mantida pelo servidor. Confira sua conexão e a instalação da migração de backup; depois tente novamente com o mesmo arquivo."); }
    finally { lock.current = false; setOcupado(false); }
  }
  function escolher(arquivo?: File) {
    const atual = ++sequencia.current;
    setBackup(null); setPrevia(null); setAviso("");
    if (!arquivo) return;
    if (arquivo.size > LIMITE_BACKUP) { setAviso("Escolha um backup de até 10 MB."); return; }
    void arquivo.text().then(texto => { if (sequencia.current !== atual) return; const b = validarBackup(texto); setBackup(b); void processar(b, false); }).catch(e => { if (sequencia.current === atual) setAviso(e instanceof Error ? e.message : "Arquivo inválido."); });
  }
  if (Platform.OS !== "web") return <CartaoFerramenta titulo="Restaurar backup"><Text style={ui.texto}>Abra o Perfil na versão web para selecionar e restaurar seu arquivo JSON.</Text></CartaoFerramenta>;
  return <CartaoFerramenta titulo="Restaurar backup"><Text style={ui.texto}>Confira a prévia antes de confirmar. Registros existentes não serão substituídos. Fotos e alterações locais pendentes não são restauradas automaticamente.</Text>
    <label style={{ color: '#D2DAD5', display: 'block' }}>Selecionar backup JSON<input aria-label="Selecionar backup JSON" type="file" accept=".json,application/json" disabled={ocupado} style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 8, boxSizing: 'border-box', color: '#D2DAD5' }} onChange={e => escolher(e.currentTarget.files?.[0])} /></label>
    {previa ? <View style={{ gap: 8 }}>{previa.reutilizado ? <Text style={ui.texto}>Este arquivo já foi restaurado nesta conta. O resultado abaixo pertence à operação anterior; nenhum registro foi duplicado.</Text> : null}<Text style={ui.titulo}>{previa.concluido ? "Resultado" : "Prévia da restauração"}</Text>{previa.tabelas.map(t => <Text key={t.tabela} style={ui.texto}>{nomes[t.tabela] ?? t.tabela}: {t.novos} {previa.concluido ? "inseridos" : "novos"}, {t.preservados} existentes preservados. {t.recusados > 0 ? `${t.recusados} registros em andamento foram ignorados.` : ""}</Text>)}{!previa.concluido && backup ? <BotaoAcao titulo={ocupado ? "Restaurando…" : "Confirmar restauração nesta conta"} disabled={ocupado} onPress={() => void processar(backup, true)} /> : null}</View> : backup ? <BotaoAcao titulo="Tentar consultar a prévia" disabled={ocupado} onPress={() => void processar(backup, false)} /> : null}
    {aviso ? <Text accessibilityLiveRegion="polite" style={ui.texto}>{aviso}</Text> : null}
  </CartaoFerramenta>;
}
