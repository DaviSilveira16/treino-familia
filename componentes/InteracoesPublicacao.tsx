import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../supabase";
import { novoIdSerie } from "../servicos/treinoLocal";
import { BotaoAcao, ui } from "./ControlesAcessiveis";

type Comentario = { id: string; content: string; created_at: string; author: string; own: boolean };
type Estado = { likes: number; liked: boolean; comment_count: number; can_moderate: boolean; comments?: Comentario[] };
export default function InteracoesPublicacao({ familiaId, postId, propria = false, revisaoAtualizacao = 0, onRemovido }: { familiaId: string; postId: string; propria?: boolean; revisaoAtualizacao?: number; onRemovido: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [mais, setMais] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const comentarioId = useRef<string | null>(null);
  const ativo = useRef(false);
  const lock = useRef(false);
  const versaoConsulta = useRef(0);
  const pedido = useCallback(async (acao: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc("tf_community_interaction", { p_action: acao, p_family_id: familiaId, p_post_id: postId, ...params });
    if (error) throw error;
    return data as Estado;
  }, [familiaId, postId]);
  useEffect(() => {
    ativo.current = true;
    // A resposta da operação em andamento já traz os contadores atualizados.
    // Não invalide essa resposta ao atualizar o feed no mesmo instante.
    if (lock.current) return () => { ativo.current = false; };
    const versao = ++versaoConsulta.current;
    void pedido(aberto ? "comments" : "state").then(e => {
      if (!ativo.current || versao !== versaoConsulta.current) return;
      setEstado(e);
      if (e.comments) {
        setComentarios(e.comments.slice(0, 20));
        setMais(e.comments.length > 20);
      }
      setErro("");
    }).catch(() => { if (ativo.current && versao === versaoConsulta.current) setErro("Interações indisponíveis. Tente novamente."); });
    return () => { ativo.current = false; };
  }, [pedido, revisaoAtualizacao, aberto]);
  async function executar(acao: string, params: Record<string, unknown> = {}, acrescentar = false) {
    if (lock.current) return;
    lock.current = true; setOcupado(true); setErro("");
    const versao = ++versaoConsulta.current;
    try {
      const e = await pedido(acao, params);
      if (!ativo.current || versao !== versaoConsulta.current) return;
      if (acao === "delete_post") { onRemovido(); return; }
      setEstado(e);
      if (e.comments) { const pagina = e.comments.slice(0,20); setMais(e.comments.length > 20); setComentarios(lista => acrescentar ? [...lista, ...pagina.filter(c => !lista.some(x => x.id === c.id))] : pagina); }
      if (acao === "comment") { setTexto(""); comentarioId.current = null; }
    } catch { if (ativo.current) setErro("A operação não foi confirmada. Você pode tentar novamente."); }
    finally { lock.current = false; if (ativo.current) setOcupado(false); }
  }
  const ultimo = comentarios[comentarios.length-1];
  const curtidas = estado?.likes ?? 0;
  const quantidadeComentarios = estado?.comment_count ?? 0;
  return <View style={{ gap: 10, marginTop: 12 }}>
    <View style={estilos.acoes}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${estado?.liked ? "Descurtir" : "Curtir"} publicação, ${curtidas} ${curtidas === 1 ? "curtida" : "curtidas"}`}
        accessibilityState={{ disabled: ocupado || !estado, selected: Boolean(estado?.liked) }}
        aria-selected={Boolean(estado?.liked)}
        disabled={ocupado || !estado}
        onPress={() => void executar("like", { p_like: !estado?.liked })}
        style={[estilos.acao, (ocupado || !estado) && estilos.desabilitado]}
      >
        <Image accessible={false} aria-hidden source={estado?.liked ? require("../assets/icones-comunidade/coracao-preenchido.png") : require("../assets/icones-comunidade/coracao.png")} style={[estilos.icone, estado?.liked && estilos.curtido]} />
        <Text style={estilos.contador}>{curtidas}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${aberto ? "Ocultar" : "Mostrar"} comentários, ${quantidadeComentarios} ${quantidadeComentarios === 1 ? "comentário" : "comentários"}`}
        accessibilityState={{ disabled: ocupado, expanded: aberto }}
        aria-expanded={aberto}
        disabled={ocupado}
        onPress={() => { setAberto(!aberto); if (!aberto) void executar("comments"); }}
        style={[estilos.acao, ocupado && estilos.desabilitado]}
      >
        <Image accessible={false} aria-hidden source={require("../assets/icones-comunidade/comentario.png")} style={estilos.icone} />
        <Text style={estilos.contador}>{quantidadeComentarios}</Text>
      </TouchableOpacity>
    </View>
    {aberto ? <View style={{ gap: 10 }}>{comentarios.map(c => <View key={c.id} style={ui.cartao}><Text style={ui.titulo}>{c.author}</Text><Text style={ui.texto}>{c.content}</Text><Text style={ui.texto}>{new Date(c.created_at).toLocaleString("pt-BR")}</Text>{c.own || estado?.can_moderate ? <BotaoAcao titulo={c.own ? "Excluir meu comentário" : "Moderar: excluir comentário"} disabled={ocupado} onPress={() => void executar("delete_comment", { p_comment_id: c.id })} /> : null}</View>)}{mais && ultimo ? <BotaoAcao titulo="Carregar mais comentários" disabled={ocupado} onPress={() => void executar("comments", { p_before: ultimo.created_at, p_before_id: ultimo.id }, true)} /> : null}
      <TextInput accessibilityLabel="Escrever comentário" placeholder="Escreva um comentário…" placeholderTextColor="#B2BDB6" multiline maxLength={1000} editable={!ocupado} style={ui.input} value={texto} onChangeText={t => { setTexto(t); comentarioId.current = null; }} />
      <Text style={ui.texto}>{texto.length}/1000 caracteres</Text><BotaoAcao titulo={ocupado ? "Aguarde…" : "Enviar comentário"} disabled={ocupado || !texto.trim()} onPress={() => { comentarioId.current ??= novoIdSerie(); void executar("comment", { p_comment_id: comentarioId.current, p_content: texto.trim() }); }} />
    </View> : null}
    {estado?.can_moderate && !propria ? <><BotaoAcao titulo="Moderar publicação" disabled={ocupado} onPress={() => setConfirmarRemocao(v => !v)} />{confirmarRemocao ? <View style={ui.cartao}><Text style={ui.texto}>Excluir esta publicação e suas interações da família?</Text><BotaoAcao titulo="Confirmar exclusão da publicação" disabled={ocupado} onPress={() => void executar("delete_post")} /><BotaoAcao titulo="Cancelar exclusão" onPress={() => setConfirmarRemocao(false)} /></View> : null}</> : null}
    {erro ? <><Text accessibilityLiveRegion="polite" style={ui.texto}>{erro}</Text>{!estado ? <BotaoAcao titulo="Tentar carregar interações" disabled={ocupado} onPress={() => void executar("state")} /> : null}</> : null}
  </View>;
}

const estilos = StyleSheet.create({
  acoes: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  acao: { minWidth: 44, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 4, paddingVertical: 8 },
  icone: { width: 26, height: 26, tintColor: "#F0F4F1" },
  curtido: { tintColor: "#FF4B5C" },
  contador: { color: "#D2DAD5", fontSize: 14, fontWeight: "600" },
  desabilitado: { opacity: 0.5 },
});
