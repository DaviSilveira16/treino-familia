import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../supabase";
import { Alert } from "../servicos/alerta";
import { novoIdSerie } from "../servicos/treinoLocal";
import { useVoltarDoModal } from "../servicos/voltarModal";
import { chamarAcompanhamento, copiarModeloProprio, normalizarCodigoConvite, publicarFicha, salvarFicha,
  type ConviteTreinador, type DocumentoFicha, type Entrega, type Ficha, type HistoricoAcompanhado, type InicioAcompanhamento, type PlanosAcompanhados, type Vinculo } from "../servicos/acompanhamento";

const mensagem = (erro: unknown) => erro instanceof Error ? erro.message : "Não foi possível confirmar. Confira a conexão e tente novamente.";
const data = (valor: string) => new Date(valor).toLocaleDateString("pt-BR");
function confirmar(titulo: string, texto: string): Promise<boolean> {
  return new Promise(resolve => Alert.alert(titulo, texto, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Confirmar", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
function Botao({ titulo, onPress, disabled = false, cor = "#35D07F" }: { titulo: string; onPress: () => void; disabled?: boolean; cor?: string }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[e.botao, { borderColor: cor, opacity: disabled ? 0.45 : 1 }]}><Text style={[e.botaoTexto, { color: cor }]}>{titulo}</Text></TouchableOpacity>;
}
function Campo({ titulo, value, onChangeText, maxLength = 100, numero = false, multiline = false, disabled = false }: {
  titulo: string; value: string; onChangeText: (s: string) => void; maxLength?: number; numero?: boolean; multiline?: boolean; disabled?: boolean;
}) {
  return <View style={e.campo}><Text style={e.texto}>{titulo}</Text><TextInput accessibilityLabel={titulo} value={value}
    onChangeText={onChangeText} style={e.input} placeholderTextColor="#929D96" maxLength={maxLength}
    editable={!disabled} keyboardType={numero ? "decimal-pad" : "default"} multiline={multiline} /></View>;
}

function Acao({ titulo, acao, executar, cor, disabled }: {
  titulo: string; acao: () => Promise<void>; executar: (acao: () => Promise<void>) => Promise<void>; cor: string; disabled: boolean;
}) {
  return <Botao titulo={titulo} cor={cor} disabled={disabled} onPress={() => void executar(acao)} />;
}

export default function Acompanhamento({ usuarioId, corTema = "#35D07F", onFechar }: { usuarioId: string; corTema?: string; onFechar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const fecharAtual = useRef<(() => boolean) | null>(null);
  function fechar() { setAberto(false); onFechar?.(); }
  return <>
    <Botao titulo="Meu treinador e pessoas que acompanho" cor={corTema} onPress={() => setAberto(true)} />
    <Modal visible={aberto} animationType="slide" onRequestClose={() => { if (!fecharAtual.current?.()) fechar(); }}>
      {aberto && <Painel key={usuarioId} usuarioId={usuarioId} cor={corTema} onFechar={fechar} voltarRef={fecharAtual} />}
    </Modal>
  </>;
}

function Painel({ usuarioId, cor, onFechar, voltarRef }: { usuarioId: string; cor: string; onFechar: () => void; voltarRef: React.MutableRefObject<(() => boolean) | null> }) {
  const [inicio, setInicio] = useState<InicioAcompanhamento>({ links: [], invites: [] });
  const [selecionado, setSelecionado] = useState<Vinculo | null>(null);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [editor, setEditor] = useState<Ficha | null>(null);
  const [historico, setHistorico] = useState<HistoricoAcompanhado | null>(null);
  const [meuHistorico, setMeuHistorico] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [codigo, setCodigo] = useState("");
  const [previa, setPrevia] = useState<{ code: string; coach_name: string } | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [observacao, setObservacao] = useState<{ id: string; texto: string } | null>(null);
  const [sessoesAbertas, setSessoesAbertas] = useState<string[]>([]);
  const [modelos, setModelos] = useState<{ id: string; name: string }[] | null>(null);
  const [planosAluno, setPlanosAluno] = useState<PlanosAcompanhados | null>(null);
  const [paginaPlanos, setPaginaPlanos] = useState(0);
  const [planoAberto, setPlanoAberto] = useState<string | null>(null);
  const [maisModelos, setMaisModelos] = useState(false);
  const [editarSujo, setEditarSujo] = useState(false);
  const emVoo = useRef(false), montado = useRef(true), conviteId = useRef(novoIdSerie());
  const selecionadoRef = useRef(selecionado);
  useEffect(() => { selecionadoRef.current = selecionado; }, [selecionado]);
  const chamar = useCallback(<T,>(action: string, payload: Record<string, unknown> = {}) => chamarAcompanhamento<T>(usuarioId, action, payload), [usuarioId]);
  const carregarInicio = useCallback(async () => {
    const novo = await chamar<InicioAcompanhamento>("home");
    if (!montado.current) return;
    setInicio(novo);
    const atual = selecionadoRef.current;
    if (atual && !novo.links.some(l => l.id === atual.id && !l.ended_at && l.coach_id)) {
      setSelecionado(null); setEditor(null); setHistorico(null); setFichas([]); setModelos(null); setEditarSujo(false); setPlanosAluno(null);
      setAviso("Vínculo encerrado. Os treinos e registros do aluno foram mantidos.");
    }
  }, [chamar]);
  async function executar(acao: () => Promise<void>) {
    if (emVoo.current) return;
    emVoo.current = true; setOcupado(true); setErro(""); setAviso("");
    try { await acao(); } catch (ex) {
      if (montado.current) { setErro(mensagem(ex)); setHistorico(null); setPlanosAluno(null); }
    }
    finally { emVoo.current = false; if (montado.current) setOcupado(false); }
  }
  useEffect(() => {
    montado.current = true;
    let atualizando = false;
    const atualizar = async () => {
      if (emVoo.current || atualizando) return;
      atualizando = true;
      try { await carregarInicio(); } catch (ex) {
        if (montado.current) { setErro(mensagem(ex)); setHistorico(null); setPlanosAluno(null); }
      } finally { atualizando = false; }
    };
    void atualizar();
    const timer = setInterval(() => void atualizar(), 30000);
    const sub = AppState.addEventListener("change", estado => { if (estado === "active") void atualizar(); });
    return () => { montado.current = false; clearInterval(timer); sub.remove(); };
  }, [carregarInicio]);
  const voltar = () => {
    if (emVoo.current) return true;
    if (editor) {
      void (async () => {
        if (editarSujo && !await confirmar("Sair da edição?", "As alterações ainda não salvas serão descartadas. A última ficha salva continua disponível.")) return;
        setEditor(null); setEditarSujo(false); setModelos(null);
      })();
    } else if (selecionado || meuHistorico) {
      setSelecionado(null); setMeuHistorico(false); setHistorico(null); setFichas([]); setObservacao(null); setPagina(0); setPlanosAluno(null);
    } else onFechar();
    return true;
  };
  useEffect(() => { voltarRef.current = voltar; return () => { voltarRef.current = null; }; });
  useVoltarDoModal(true, voltar);
  async function abrirVinculo(l: Vinculo) {
    await executar(async () => {
      const dados = l.coach_id === usuarioId ? await chamar<Ficha[]>("drafts", { link_id: l.id }) : [];
      const h = await chamar<HistoricoAcompanhado>("history", { link_id: l.id, offset: 0 });
      if (!montado.current) return;
      setSelecionado(l); setFichas(dados); setHistorico(h); setPagina(0); setMeuHistorico(false); setSessoesAbertas([]); setObservacao(null); setPlanosAluno(null);
    });
  }
  async function carregarPagina(proxima: number) {
    const h = await chamar<HistoricoAcompanhado>(meuHistorico ? "my_history" : "history", { link_id: selecionado?.id, offset: proxima * 20 });
    if (montado.current) { setHistorico(h); setPagina(proxima); setSessoesAbertas([]); }
  }
  async function listarModelos() {
    const inicioPagina = modelos?.length ?? 0;
    const { data: lista, error } = await supabase.from("workout_plans").select("id, name").eq("user_id", usuarioId)
      .order("name").order("id").range(inicioPagina, inicioPagina + 19);
    if (error) throw new Error(error.message);
    if (montado.current) { setModelos([...(modelos ?? []), ...(lista ?? [])]); setMaisModelos(lista?.length === 20); }
  }
  async function carregarPlanosAluno(proxima: number) {
    const planos = await chamar<PlanosAcompanhados>("plans", { link_id: selecionado?.id, offset: proxima * 20 });
    if (montado.current) { setPlanosAluno(planos); setPaginaPlanos(proxima); setPlanoAberto(null); }
  }
  const souTreinador = selecionado?.coach_id === usuarioId;
  return <KeyboardAvoidingView style={e.tela} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={e.conteudo}>
      <Botao titulo="‹ Voltar" cor={cor} disabled={ocupado} onPress={voltar} />
      <Text style={e.titulo}>{editor ? "Montar ficha" : selecionado ? (souTreinador ? selecionado.student_name : selecionado.coach_name) : meuHistorico ? "Minhas observações" : "Treinar com acompanhamento"}</Text>
      {ocupado && <ActivityIndicator color={cor} accessibilityLabel="Aguarde" />}
      {!!erro && <Text accessibilityRole="alert" style={e.erro}>{erro}</Text>}
      {!!aviso && <Text accessibilityRole="alert" style={e.texto}>{aviso}</Text>}
      {editor ? <>
        <EditorFicha key={editor.id} ficha={editor} usuarioId={usuarioId} cor={cor} ocupado={ocupado}
          executar={executar} onSujo={setEditarSujo} onSalvo={f => { setEditor(f); setFichas(atuais => [f, ...atuais.filter(a => a.id !== f.id)]); }}
          onPublicado={() => setAviso("Ficha disponibilizada em Meus treinos do aluno. As versões anteriores permanecem disponíveis.")} />
      </> : selecionado || meuHistorico ? <>
        {selecionado && <View style={e.card}>
          <Text style={e.texto}>{souTreinador ? "Você acompanha esta pessoa." : "Este treinador pode preparar fichas e consultar seu histórico de treinos."}</Text>
          {<Acao titulo={"Encerrar vínculo"} acao={async () => {
            if (!await confirmar("Encerrar acompanhamento?", "O treinador perderá o acesso. Todos os treinos entregues, exercícios, cargas, sessões e observações continuarão com o aluno. Nada disso será apagado.")) return;
            await chamar("end", { link_id: selecionado.id });
            setSelecionado(null); setEditor(null); setHistorico(null); setFichas([]);
            await carregarInicio(); setAviso("Vínculo encerrado. Todos os treinos e registros do aluno foram preservados.");
          }} disabled={ocupado} executar={executar} cor={cor} />}
        </View>}
        {souTreinador && selecionado && <View style={e.card}>
          <Text style={e.subtitulo}>Treinos atuais do aluno</Text>
          <Acao titulo="Consultar treinos do aluno" acao={() => carregarPlanosAluno(0)} executar={executar} cor={cor} disabled={ocupado} />
          {planosAluno && <>
            {!planosAluno.plans.length && <Text style={e.texto}>O aluno ainda não tem treinos cadastrados.</Text>}
            {planosAluno.plans.map(p => <View key={p.id} style={e.card}>
              <Text style={e.subtitulo}>{p.name}</Text>
              <Botao titulo={`Ver exercícios de ${p.name}`} cor={cor} onPress={() => setPlanoAberto(planoAberto === p.id ? null : p.id)} />
              {planoAberto === p.id && p.exercises.map((ex, i) => <View key={i}>
                <Text style={e.texto}>{ex.name} · {ex.sets} séries · {ex.reps} repetições</Text>
                {ex.loads.map(c => <Text style={e.texto} key={c.set_number}>Série {c.set_number}: {c.reps} reps × {Number(c.weight_kg).toLocaleString("pt-BR")} kg</Text>)}
              </View>)}
              <Botao titulo={`Usar ${p.name} como base`} cor={cor} disabled={ocupado || !p.exercises.length || p.exercises.length > 50}
                onPress={() => setEditor({ id: novoIdSerie(), link_id: selecionado.id, revision: 0, published_revision: 0,
                  document: { name: p.name.slice(0, 80), instructions: "", exercises: p.exercises } })} />
            </View>)}
            <Text style={e.texto}>Uma cópia usa a primeira carga de referência de cada exercício. Revise as orientações e o descanso antes de entregar.</Text>
            <View style={e.linha}>
              <Acao titulo="Treinos anteriores" acao={() => carregarPlanosAluno(paginaPlanos - 1)} executar={executar} cor={cor} disabled={ocupado || paginaPlanos === 0} />
              <Acao titulo="Mais treinos do aluno" acao={() => carregarPlanosAluno(paginaPlanos + 1)} executar={executar} cor={cor} disabled={ocupado || (paginaPlanos + 1) * 20 >= planosAluno.total} />
            </View>
          </>}
          <Text style={e.subtitulo}>Fichas do aluno</Text>
          <Text style={e.texto}>Salve um rascunho e disponibilize quando estiver pronto. Cada atualização entregue cria uma nova versão em Meus treinos; o aluno escolhe quando começar a usá-la.</Text>
          <Botao titulo="Criar ficha" cor={cor} disabled={ocupado} onPress={() => setEditor({ id: novoIdSerie(), link_id: selecionado.id, revision: 0, published_revision: 0,
            document: { name: "", instructions: "", exercises: [{ name: "", sets: 3, reps: "8-12", weight: 0, rest: 60, instructions: "" }] } })} />
          {<Acao titulo={"Copiar um dos meus treinos"} acao={async () => { setModelos(null); const { data: lista, error } = await supabase.from("workout_plans").select("id, name").eq("user_id", usuarioId).order("name").order("id").range(0, 19); if (error) throw error; setModelos(lista ?? []); setMaisModelos(lista?.length === 20); }} disabled={ocupado} executar={executar} cor={cor} />}
          {modelos && <View style={e.card}>
            <Text style={e.texto}>Escolha o modelo. A cópia usa a primeira carga de referência de cada exercício; revise os valores antes de entregar.</Text>
            {!modelos.length && <Text style={e.texto}>Você ainda não tem modelos cadastrados.</Text>}
            {modelos.map(m => <View key={m.id}>{<Acao titulo={m.name} acao={async () => {
              const document = await copiarModeloProprio(usuarioId, m.id);
              setEditor({ id: novoIdSerie(), link_id: selecionado.id, revision: 0, published_revision: 0, document }); setModelos(null);
            }} disabled={ocupado} executar={executar} cor={cor} />}</View>)}
            {maisModelos && <Acao titulo={"Mais modelos"} acao={listarModelos} disabled={ocupado} executar={executar} cor={cor} />}
            <Botao titulo="Fechar modelos" cor={cor} disabled={ocupado} onPress={() => setModelos(null)} />
          </View>}
          {!fichas.length && <Text style={e.texto}>Nenhuma ficha preparada ainda.</Text>}
          {fichas.map(f => <View key={f.id} style={e.card}>
            <Text style={e.subtitulo}>{f.document.name}</Text><Text style={e.texto}>{f.document.exercises.length} exercícios · revisão {f.revision} · {f.published_revision === f.revision ? "Disponibilizada" : "Rascunho com alterações não entregues"}</Text>
            <Botao titulo={`Editar ficha ${f.document.name}`} cor={cor} disabled={ocupado} onPress={() => setEditor(f)} />
          </View>)}
        </View>}
        <View style={e.card}>
          <Text style={e.subtitulo}>Treinos realizados</Text>
          {<Acao titulo={"Atualizar acompanhamento"} acao={() => carregarPagina(pagina)} disabled={ocupado} executar={executar} cor={cor} />}
          {historico && <Text style={e.texto}>{historico.last30} treinos nos últimos 30 dias · {historico.total} concluídos no histórico</Text>}
          {historico?.sessions.length === 0 && <Text style={e.texto}>Ainda não há treinos concluídos.</Text>}
          {historico?.sessions.map(s => <View key={s.id} style={e.card}>
            <Text style={e.subtitulo}>{s.plan_name}</Text><Text style={e.texto}>{data(s.started_at)} · {s.duration_minutes ?? "—"} min · {s.sets.length} séries</Text>
            {!!s.comment && <Text style={e.texto}>Observação: {s.comment}</Text>}
            <Botao titulo={`${sessoesAbertas.includes(s.id) ? "Ocultar" : "Ver"} séries de ${s.plan_name}`} cor={cor}
              onPress={() => setSessoesAbertas(atuais => atuais.includes(s.id) ? atuais.filter(id => id !== s.id) : [...atuais, s.id])} />
            {sessoesAbertas.includes(s.id) && s.sets.map((serie, i) => <Text key={i} style={e.texto}>{serie.exercise_name} · série {serie.set_number}: {serie.reps} reps × {Number(serie.weight_kg).toLocaleString("pt-BR")} kg</Text>)}
            {!souTreinador && <Botao titulo={`Anotar sobre ${s.plan_name}`} cor={cor} disabled={ocupado} onPress={() => setObservacao({ id: s.id, texto: s.comment })} />}
            {observacao?.id === s.id && <>
              <Campo titulo="Como foi este treino?" value={observacao.texto} onChangeText={texto => setObservacao({ id: s.id, texto })} multiline maxLength={2000} disabled={ocupado} />
              {<Acao titulo={"Salvar observação"} acao={async () => {
                await chamar("feedback", { session_id: s.id, comment: observacao.texto });
                setObservacao(null); await carregarPagina(pagina); setAviso("Observação salva no seu histórico.");
              }} disabled={ocupado} executar={executar} cor={cor} />}
            </>}
          </View>)}
          <View style={e.linha}>{<Acao titulo={"Página anterior"} acao={() => carregarPagina(pagina - 1)} disabled={ocupado || (pagina === 0)} executar={executar} cor={cor} />}
            {<Acao titulo={"Próxima página"} acao={() => carregarPagina(pagina + 1)} disabled={ocupado || (!historico || (pagina + 1) * 20 >= historico.total)} executar={executar} cor={cor} />}</View>
        </View>
      </> : <>
        <Text style={e.texto}>Você pode ter um treinador e também acompanhar outras pessoas. O vínculo só começa após o aceite de quem vai treinar.</Text>
        <View style={e.card}>
          <Text style={e.subtitulo}>Meu treinador</Text>
          <Campo titulo="Código recebido do treinador" value={codigo} onChangeText={valor => { setCodigo(valor); setPrevia(null); }} maxLength={50} disabled={ocupado} />
          {<Acao titulo={"Conferir convite"} acao={async () => { const code = normalizarCodigoConvite(codigo); const info = await chamar<{ coach_name: string }>("invite_preview", { code }); setPrevia({ code, coach_name: info.coach_name }); }} disabled={ocupado} executar={executar} cor={cor} />}
          {previa && <View style={e.card}>
            <Text style={e.subtitulo}>Convite de {previa.coach_name}</Text>
            <Text style={e.texto}>Ao aceitar, você permite que esta pessoa prepare fichas e veja seus treinos cadastrados, histórico, frequência, séries, cargas e observações. Nutrição, medidas e fotos pessoais não são compartilhadas. Você pode encerrar quando quiser e manter todos os treinos recebidos e registros.</Text>
            {<Acao titulo={"Aceitar e compartilhar meus treinos"} acao={async () => {
              await chamar("invite_accept", { code: previa.code, consent: true }); setPrevia(null); setCodigo(""); await carregarInicio(); setAviso("Vínculo aceito. As fichas entregues aparecerão em Meus treinos.");
            }} disabled={ocupado} executar={executar} cor={cor} />}
          </View>}
          {inicio.links.filter(l => l.student_id === usuarioId && !l.ended_at && l.coach_id).map(l => <View key={l.id}>
            <Text style={e.texto}>{l.coach_name}</Text><Botao titulo={`Ver acompanhamento com ${l.coach_name}`} cor={cor} disabled={ocupado} onPress={() => void abrirVinculo(l)} />
          </View>)}
        </View>
        <View style={e.card}>
          <Text style={e.subtitulo}>Pessoas que acompanho</Text>
          <Text style={e.texto}>Cada código vale por 7 dias e pode ser aceito por uma pessoa. Envie apenas para quem deseja acompanhar.</Text>
          {<Acao titulo={"Gerar convite para aluno"} acao={async () => { await chamar<ConviteTreinador>("invite_create", { id: conviteId.current }); conviteId.current = novoIdSerie(); await carregarInicio(); }} disabled={ocupado} executar={executar} cor={cor} />}
          {inicio.invites.map(i => <View key={i.id} style={e.card}>
            <Text style={e.texto}>Válido até {data(i.expires_at)}</Text><Text selectable style={e.codigo}>{i.code}</Text>
            {<Acao titulo={"Compartilhar código"} acao={async () => { await Share.share({ message: `Quero acompanhar seus treinos no Treino Família. Abra Meu treinador e pessoas que acompanho e cole este código: ${i.code}` }); }} disabled={ocupado} executar={executar} cor={cor} />}
            {<Acao titulo={"Cancelar convite"} acao={async () => { await chamar("invite_revoke", { id: i.id }); await carregarInicio(); }} disabled={ocupado} executar={executar} cor={cor} />}
          </View>)}
          {inicio.links.filter(l => l.coach_id === usuarioId && !l.ended_at).map(l => <View key={l.id} style={e.card}>
            <Text style={e.subtitulo}>{l.student_name}</Text><Botao titulo={`Acompanhar ${l.student_name}`} cor={cor} disabled={ocupado} onPress={() => void abrirVinculo(l)} />
          </View>)}
        </View>
        {<Acao titulo={"Minhas observações de treino"} acao={async () => { const h = await chamar<HistoricoAcompanhado>("my_history", { offset: 0 }); setHistorico(h); setMeuHistorico(true); setPagina(0); setSessoesAbertas([]); }} disabled={ocupado} executar={executar} cor={cor} />}
        {inicio.links.some(l => l.ended_at || !l.coach_id) && <View style={e.card}>
          <Text style={e.subtitulo}>Vínculos encerrados</Text><Text style={e.texto}>As fichas entregues e todas as atividades permanecem na conta de quem treinou. O antigo treinador não tem mais acesso.</Text>
          {inicio.links.filter(l => l.ended_at || !l.coach_id).map(l => <Text key={l.id} style={e.texto}>{l.student_id === usuarioId ? l.coach_name : l.student_name} · {l.ended_at ? data(l.ended_at) : "Encerrado"}</Text>)}
        </View>}
        {<Acao titulo={"Atualizar vínculos"} acao={carregarInicio} disabled={ocupado} executar={executar} cor={cor} />}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function EditorFicha({ ficha, usuarioId, cor, ocupado, executar, onSalvo, onPublicado, onSujo }: {
  ficha: Ficha; usuarioId: string; cor: string; ocupado: boolean; executar: (acao: () => Promise<void>) => Promise<void>;
  onSalvo: (f: Ficha) => void; onPublicado: () => void; onSujo: (valor: boolean) => void;
}) {
  const [nome, setNome] = useState(ficha.document.name);
  const [orientacoes, setOrientacoes] = useState(ficha.document.instructions);
  const [exercicios, setExercicios] = useState(() => ficha.document.exercises.map(ex => ({ ...ex, key: novoIdSerie(), sets: String(ex.sets), weight: String(ex.weight), rest: String(ex.rest) })));
  const [sujo, setSujo] = useState(ficha.revision === 0);
  useEffect(() => { onSujo(sujo); }, [sujo, onSujo]);
  function mudou() { setSujo(true); }
  function atualizar(indice: number, campo: string, valor: string) { mudou(); setExercicios(atuais => atuais.map((ex, i) => i === indice ? { ...ex, [campo]: valor } : ex)); }
  function documento(): DocumentoFicha {
    return { name: nome, instructions: orientacoes, exercises: exercicios.map(ex => ({ name: ex.name, reps: ex.reps,
      sets: ex.sets.trim() ? Number(ex.sets) : NaN, weight: ex.weight.trim() ? Number(ex.weight.replace(",", ".")) : NaN,
      rest: ex.rest.trim() ? Number(ex.rest) : NaN, instructions: ex.instructions })) };
  }
  return <>
    <Text style={e.texto}>As alterações ficam em rascunho até você disponibilizar. Uma nova versão conserva todos os treinos e sessões anteriores do aluno.</Text>
    <Campo titulo="Nome da ficha" value={nome} onChangeText={s => { setNome(s); mudou(); }} maxLength={80} disabled={ocupado} />
    <Campo titulo="Orientações gerais" value={orientacoes} onChangeText={s => { setOrientacoes(s); mudou(); }} multiline maxLength={2000} disabled={ocupado} />
    {exercicios.map((ex, i) => <View style={e.card} key={ex.key}>
      <Text style={e.subtitulo}>Exercício {i + 1}</Text>
      <Campo titulo={`Nome do exercício ${i + 1}`} value={ex.name} onChangeText={s => atualizar(i, "name", s)} disabled={ocupado} />
      <View style={e.linha}>
        <Campo titulo={`Séries ${i + 1}`} value={ex.sets} onChangeText={s => atualizar(i, "sets", s)} numero disabled={ocupado} />
        <Campo titulo={`Repetições ${i + 1}`} value={ex.reps} onChangeText={s => atualizar(i, "reps", s)} maxLength={30} disabled={ocupado} />
      </View>
      <View style={e.linha}>
        <Campo titulo={`Carga (kg) ${i + 1}`} value={ex.weight} onChangeText={s => atualizar(i, "weight", s)} numero disabled={ocupado} />
        <Campo titulo={`Descanso (s) ${i + 1}`} value={ex.rest} onChangeText={s => atualizar(i, "rest", s)} numero disabled={ocupado} />
      </View>
      <Campo titulo={`Orientações do exercício ${i + 1}`} value={ex.instructions} onChangeText={s => atualizar(i, "instructions", s)} multiline maxLength={1000} disabled={ocupado} />
      <View style={e.linha}>
        <Botao titulo={`Subir exercício ${i + 1}`} cor={cor} disabled={ocupado || i === 0} onPress={() => { mudou(); setExercicios(atuais => { const lista = [...atuais]; [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; return lista; }); }} />
        <Botao titulo={`Retirar exercício ${i + 1}`} cor={cor} disabled={ocupado} onPress={() => { mudou(); setExercicios(atuais => atuais.filter((_, indice) => indice !== i)); }} />
      </View>
    </View>)}
    <Botao titulo="Adicionar exercício à ficha" cor={cor} disabled={ocupado || exercicios.length >= 50} onPress={() => {
      mudou(); setExercicios(atuais => [...atuais, { key: novoIdSerie(), name: "", sets: "3", reps: "8-12", weight: "0", rest: "60", instructions: "" }]);
    }} />
    <Botao titulo="Salvar rascunho" cor={cor} disabled={ocupado || !sujo} onPress={() => void executar(async () => {
      const salvo = await salvarFicha(usuarioId, { ...ficha, document: documento() }); onSalvo(salvo); setSujo(false);
    })} />
    <Text style={e.texto}>{sujo ? "Salve as alterações antes de disponibilizar." : ficha.published_revision === ficha.revision ? "Esta revisão já foi disponibilizada ao aluno." : "Rascunho salvo. Confira os exercícios antes de disponibilizar."}</Text>
    <Botao titulo="Disponibilizar treino ao aluno" cor={cor} disabled={ocupado || sujo || ficha.revision === 0 || ficha.published_revision === ficha.revision}
      onPress={() => void executar(async () => {
        if (!await confirmar("Disponibilizar esta ficha?", "Uma cópia será adicionada aos treinos do aluno. Ele manterá a ficha mesmo que o acompanhamento termine. Versões anteriores permanecem disponíveis.")) return;
        const entrega: Entrega = await publicarFicha(usuarioId, ficha);
        if (!entrega.plan_id) throw new Error("Esta versão foi entregue, mas o aluno removeu o treino. Edite e salve uma nova revisão se quiser entregar novamente.");
        onSalvo({ ...ficha, published_revision: ficha.revision }); onPublicado();
      })} />
  </>;
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: "#101312" },
  conteudo: { padding: 20, paddingTop: 48, paddingBottom: 50, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" },
  titulo: { fontSize: 25, fontWeight: "800", color: "#F1F5F2" },
  subtitulo: { fontSize: 18, fontWeight: "700", color: "#F1F5F2" },
  texto: { fontSize: 14, lineHeight: 21, color: "#BCC7C0" },
  erro: { fontSize: 14, lineHeight: 21, color: "#FFB4AB" },
  card: { padding: 15, backgroundColor: "#191E1B", borderRadius: 14, borderWidth: 1, borderColor: "#354039", gap: 12 },
  botao: { padding: 12, minHeight: 46, justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  botaoTexto: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  campo: { flexGrow: 1, minWidth: 120, gap: 6 },
  input: { color: "#F1F5F2", backgroundColor: "#101312", borderColor: "#526057", borderWidth: 1, padding: 12, minHeight: 46, borderRadius: 10 },
  linha: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  codigo: { color: "#F1F5F2", fontSize: 15, lineHeight: 24 },
});
