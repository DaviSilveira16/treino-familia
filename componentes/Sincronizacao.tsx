import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "../supabase";
import { listarFotosModelo, listarRascunhos, listarExclusoesPendentes } from "../servicos/treinoLocal";
import { listarPendenciasNutricao, sincronizarNutricao } from "../servicos/nutricaoRepositorio";
import { sincronizarRascunho, excluirSessaoTreino } from "../servicos/treinoSincronizacao";
import { sincronizarFotosModelo } from "../servicos/fotosModeloTreino";
import { codigoFalha, registrarDiagnostico } from "../servicos/diagnostico";
import { estadoDaPendencia } from "../servicos/estadoSincronizacao";
import { BotaoAcao, CartaoFerramenta, ui } from "./ControlesAcessiveis";

type Item = { id: string; titulo: string; tipo: "treino" | "nutricao" | "foto"; tentativa?: string; erro?: string | null; conflito: boolean; enviar: () => Promise<unknown> };
export default function Sincronizacao({ usuarioId }: { usuarioId: string }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const lock = useRef(false);
  const carregar = useCallback(async () => {
    const [treinos, nutricao, fotos, exclusoes] = await Promise.all([listarRascunhos(usuarioId), listarPendenciasNutricao(usuarioId), listarFotosModelo(usuarioId), listarExclusoesPendentes(usuarioId)]);
    return [
      ...exclusoes.map((e, indice) => ({ id: `exclusao:${e.sessaoId}`, titulo: `Exclusão de treino ${indice + 1}`, tipo: "treino" as const, tentativa: undefined, erro: null, conflito: false, enviar: () => excluirSessaoTreino(usuarioId, e.sessaoId) })),
      ...treinos.filter(t => !t.exclusaoSolicitada && (t.criacaoPendente || t.finalizacao || t.series.some(s => s.pendente) || t.erroSincronizacao)).map(t => ({ id: t.planId, titulo: `Treino: ${t.planName}`, tipo: "treino" as const, tentativa: t.ultimaTentativaEm, erro: t.erroSincronizacao, conflito: Boolean(t.conflitoSessao || t.conflitoSincronizacao), enviar: () => sincronizarRascunho(usuarioId, t.planId) })),
      ...nutricao.map((n, indice) => ({ id: n.id, titulo: `Nutrição: alteração ${indice + 1} (${n.quantidade})`, tipo: "nutricao" as const, tentativa: n.ultimaTentativaEm, erro: n.erro, conflito: n.conflito, enviar: () => sincronizarNutricao(usuarioId) })),
      ...fotos.map((f, indice) => ({ id: f.id, titulo: `Foto pendente ${indice + 1}`, tipo: "foto" as const, tentativa: f.foto?.ultimaTentativaEm, erro: f.foto?.falha ? `Falha: ${f.foto.falha.motivo}` : f.foto ? null : "Registro local não identificado; conteúdo preservado.", conflito: false, enviar: () => sincronizarFotosModelo(usuarioId, true) })),
    ];
  }, [usuarioId]);
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    const atualizar = () => { void carregar().then(lista => { if (ativo) setItens(lista); }).catch(() => { if (ativo) setAviso("Não foi possível consultar as pendências locais."); }); };
    atualizar();
    const timer = setInterval(atualizar, 5000);
    const unsubscribe = NetInfo.addEventListener(s => { if (s.isConnected) atualizar(); });
    return () => { ativo = false; clearInterval(timer); unsubscribe(); };
  }, [aberto, carregar]);
  async function enviar(item?: Item) {
    if (lock.current) return;
    lock.current = true; setOcupado(true); setAviso("");
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== usuarioId) { setAviso("Entre novamente na mesma conta para enviar."); return; }
      const lista = item ? [item] : await carregar();
      const grupos = new Set<string>();
      for (const i of lista) {
        if (i.conflito) continue;
        const grupo = i.tipo === "treino" ? i.id : i.tipo;
        if (!grupos.has(grupo)) { grupos.add(grupo); await i.enviar(); }
      }
      const restantes = await carregar(); setItens(restantes);
      registrarDiagnostico("sincronizacao", restantes.some(i => i.conflito) ? "CONFLITO" : restantes.some(i => i.erro) ? "FALHA" : "OK");
      setAviso("Tentativa concluída. Confira os estados abaixo.");
    } catch (e) { registrarDiagnostico("sincronizacao", codigoFalha(e)); setAviso("Envio não confirmado. Os dados locais foram preservados."); }
    finally { lock.current = false; setOcupado(false); }
  }
  return <CartaoFerramenta titulo="Sincronização"><BotaoAcao titulo={aberto ? "Ocultar detalhes da sincronização" : "Ver detalhes da sincronização"} onPress={() => setAberto(v => !v)} />{aberto ? <View style={{ gap: 12 }}><BotaoAcao titulo={ocupado ? "Enviando…" : "Tentar enviar tudo"} disabled={ocupado} onPress={() => void enviar()} />{itens.length === 0 ? <Text style={ui.texto}>Nenhuma pendência local encontrada.</Text> : null}{itens.map(i => { const e = estadoDaPendencia(i.conflito, i.erro); return <View key={`${i.tipo}:${i.id}`} style={ui.cartao}><Text style={ui.titulo}>{i.titulo}</Text><Text style={ui.texto}>{e.estado} · {e.acao}</Text><Text style={ui.texto}>Última tentativa: {i.tentativa ? new Date(i.tentativa).toLocaleString("pt-BR") : "não registrada"}</Text><BotaoAcao titulo={i.tipo === "treino" ? "Tentar novamente este treino" : `Tentar novamente ${i.tipo === "foto" ? "as fotos" : "a nutrição"}`} disabled={ocupado || i.conflito} onPress={() => void enviar(i)} /></View>; })}</View> : null}{aviso ? <Text accessibilityLiveRegion="polite" style={ui.texto}>{aviso}</Text> : null}{Platform.OS === "web" && typeof navigator !== "undefined" && !navigator.onLine ? <Text style={ui.texto}>Sem conexão. Seus registros continuam neste aparelho.</Text> : null}</CartaoFerramenta>;
}
