import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Alert } from "../servicos/alerta";
import { lerPerfilTreino } from "../servicos/caloriasTreino";
import { assinarMudancasDeDados } from "../servicos/revisaoDados";
import { assinarRascunhos } from "../servicos/treinoLocal";
import { useVoltarDoModal } from "../servicos/voltarModal";
import { analisarDia, aplicarModelo, configuracaoNaData, copiarDia, criarDia, dataLocal, deslocarDia, modeloNaData, novasRefeicoes, novoIdNutricao, planejarRefeicaoDoModelo, resumirSemana, semanaDaData, somarNutrientes, type ResumoDia } from "../servicos/nutricaoCalculos";
import { carregarAtividadesNutricao } from "../servicos/nutricaoAtividades";
import { carregarEstadoNutricao, lerEstadoNutricaoLocal, listarCopiasConflitosNutricao, resolverConflitoNutricao, salvarConfiguracaoNutricao, salvarDiaNutricao, salvarModeloDieta, salvarPreferenciasNutricao, sincronizarNutricao } from "../servicos/nutricaoRepositorio";
import type { AtividadeNutricional, ConfiguracaoNutricional, DiaNutricao, EstadoNutricao, ModeloDieta, PreferenciasNutricao, RefeicaoNutricao } from "../servicos/nutricaoTipos";
import EditorRefeicoesNutricao from "../componentes/nutricao/EditorRefeicoesNutricao";
import MetasNutricao from "../componentes/nutricao/MetasNutricao";
import { BotaoNutricao as Botao, CampoNutricao as Campo, ModalNutricao, estilosNutricao as e, numeroKcal as kcal } from "../componentes/nutricao/NutricaoBase";

type AreaNutricao = "inicio" | "hoje" | "dieta" | "analise" | "historico" | "metas";
const areasNutricao = [
  { id: "dieta", titulo: "Minha dieta", descricao: "Monte suas refeições e deixe seu planejamento pronto para repetir.", icone: "🍽️" },
  { id: "hoje", titulo: "Alimentação de hoje", descricao: "Registre o que comeu e acompanhe suas calorias e macros.", icone: "🥗" },
  { id: "analise", titulo: "Análise", descricao: "Veja alimentação, exercícios e seu saldo do dia e da semana.", icone: "📊" },
  { id: "historico", titulo: "Histórico alimentar", descricao: "Consulte outros dias e corrija o que registrou.", icone: "📅" },
  { id: "metas", titulo: "Minhas metas", descricao: "Ajuste calorias, macronutrientes e seu gasto estimado.", icone: "🎯" },
] as const;

type Props = { usuarioId: string; metadados: Record<string, unknown>; corTema?: string; onAbrirPerfil: () => void };
const estadoVazio: EstadoNutricao = { dias: [], modelos: [], configuracoes: [], preferencias: { modeloPadraoId: null, repetirDiariamente: false, repetirDesde: "", favoritos: [], recentes: [] }, alimentosLocais: [], pendencias: 0, erro: null };
const msgErro = (falha: unknown) => falha && typeof falha === "object" && "message" in falha ? String(falha.message) : "Não foi possível guardar esta alteração.";
function confirmar(titulo: string, mensagem: string): Promise<boolean> {
  if (Platform.OS === "web" && typeof window !== "undefined") return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  return new Promise((resolve) => Alert.alert(titulo, mensagem, [{ text: "Cancelar", style: "cancel", onPress: () => resolve(false) }, { text: "Confirmar", onPress: () => resolve(true) }]));
}
const dataBonita = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const clonarRefeicoes = (refeicoes: RefeicaoNutricao[]) => refeicoes.map((refeicao) => ({ ...refeicao, id: novoIdNutricao(), itens: refeicao.itens.map((item) => ({ ...item, id: novoIdNutricao(), nutrientesBase: { ...item.nutrientesBase }, consumido: false })) }));
const conteudoRefeicoes = (refeicoes: RefeicaoNutricao[]) => JSON.stringify(refeicoes.map((refeicao) => ({ ...refeicao, id: "", itens: refeicao.itens.map((item) => ({ ...item, id: "", consumido: false })) })));
function Barra({ valor, meta, cor }: { valor: number; meta: number | null; cor: string }) {
  return <View style={estilos.trilho}><View style={{ height: 7, borderRadius: 5, backgroundColor: cor, width: `${Math.max(0, Math.min(100, meta && meta > 0 ? valor / meta * 100 : 0))}%` }} /></View>;
}
function CartaoSaldo({ resumo, atividadesConferidas = true }: { resumo: ResumoDia; atividadesConferidas?: boolean }) {
  const saldo = resumo.situacao === "futuro" ? null : resumo.saldo ?? (resumo.gastoTotal !== null && resumo.itensConsumidos > 0 ? resumo.consumido.kcal - resumo.gastoTotal : null);
  const texto = !atividadesConferidas ? "Atividades aguardando conferência" : resumo.situacao === "futuro" ? "Planejamento futuro" : resumo.situacao === "insuficiente" ? "Dados insuficientes para fechar o saldo" : resumo.situacao === "parcial" ? "Balanço provisório · registros parciais" : resumo.situacao === "manutencao" ? "Próximo da manutenção" : resumo.situacao === "deficit" ? "Déficit estimado" : "Superávit estimado";
  return <View style={e.card}><Text style={e.titulo}>{texto}</Text><Text style={estilos.numero}>{saldo === null ? "—" : `${saldo > 0 ? "+" : saldo < 0 ? "−" : ""}${kcal(Math.abs(saldo))} kcal`}</Text><Text style={e.texto}>Consumo confirmado: {kcal(resumo.consumido.kcal)} kcal</Text><Text style={e.texto}>Proteínas {kcal(resumo.consumido.proteinas)} g · Carboidratos {kcal(resumo.consumido.carboidratos)} g · Gorduras {kcal(resumo.consumido.gorduras)} g</Text><Text style={e.pequeno}>Total previsto nas refeições: {kcal(resumo.planejado.kcal)} kcal. Itens ainda planejados ficam fora do consumo confirmado.</Text><Text style={e.texto}>Base sem treinos: {resumo.gastoBase === null ? "não informada" : `${kcal(resumo.gastoBase)} kcal`}</Text><Text style={e.texto}>Exercícios ativos conhecidos: {kcal(resumo.gastoExercicio)} kcal</Text><Text style={e.texto}>Gasto total estimado: {resumo.gastoTotal === null ? "indisponível" : `${kcal(resumo.gastoTotal)} kcal`}</Text>{!resumo.completo || !atividadesConferidas ? <Text style={e.pequeno}>O saldo usa apenas o consumo lançado e o gasto previsto para o dia inteiro. Refeições e atividades ainda não registradas podem mudar o resultado.</Text> : null}{resumo.desconhecidas > 0 ? <Text style={estilos.aviso}>{resumo.desconhecidas} atividade(s) sem estimativa de calorias. O gasto conhecido é parcial.</Text> : null}{resumo.pendentes > 0 ? <Text style={e.pequeno}>{resumo.pendentes} atividade(s) aguardando confirmação do servidor.</Text> : null}{resumo.diferencaMeta !== null ? <Text style={e.texto}>{kcal(Math.abs(resumo.diferencaMeta))} kcal {resumo.diferencaMeta > 0 ? "acima" : "abaixo"} da meta alimentar. Essa diferença é separada do saldo energético.</Text> : null}</View>;
}

function ResumoDocumento({ documento }: { documento: unknown }) {
  if (!documento || typeof documento !== "object") return <Text style={e.texto}>Registro ausente ou removido nesta versão.</Text>;
  const valor = documento as Record<string, unknown>;
  if (Array.isArray(valor.refeicoes)) return <View style={{ gap: 8 }}>
    {typeof valor.nome === "string" ? <Text style={e.titulo}>{valor.nome}</Text> : null}
    {typeof valor.data === "string" ? <Text style={e.texto}>Dia {dataBonita(valor.data)} · {valor.concluido ? "concluído" : "aberto"}</Text> : null}
    {(valor.refeicoes as RefeicaoNutricao[]).map((refeicao) => <View key={refeicao.id} style={{ gap: 4 }}><Text style={e.titulo}>{refeicao.nome}</Text>{refeicao.itens.map((item) => <Text key={item.id} style={e.texto}>{item.nome} · {item.gramas.toLocaleString("pt-BR")} g · {item.consumido ? "consumido" : "planejado"}</Text>)}</View>)}
  </View>;
  if ("metaKcal" in valor) return <View style={{ gap: 8 }}><Text style={e.texto}>Metas desde {typeof valor.vigenteDesde === "string" ? dataBonita(valor.vigenteDesde) : "data não informada"}</Text><Text style={e.texto}>Meta alimentar: {typeof valor.metaKcal === "number" ? `${kcal(valor.metaKcal)} kcal` : "não informada"}</Text><Text style={e.texto}>Base sem treinos: {typeof valor.baseDiariaKcal === "number" ? `${kcal(valor.baseDiariaKcal)} kcal` : "não informada"}</Text></View>;
  if (typeof valor.nome === "string") return <Text style={e.texto}>{valor.nome}{typeof valor.baseGramas === "number" ? ` · referência ${valor.baseGramas} g` : ""}</Text>;
  return <Text style={e.texto}>Preferências: repetição diária {valor.repetirDiariamente ? "ativada" : "desativada"}. {Array.isArray(valor.favoritos) ? valor.favoritos.length : 0} favorito(s).</Text>;
}

export default function Nutricao({ usuarioId, metadados, corTema = "#35D07F", onAbrirPerfil }: Props) {
  const foco = useIsFocused();
  const hoje = dataLocal();
  const [data, setData] = useState(hoje);
  const [dataTexto, setDataTexto] = useState(hoje);
  const [aba, setAba] = useState<AreaNutricao>("inicio");
  const [origemDiario, setOrigemDiario] = useState<"inicio" | "historico">("inicio");
  const [estado, setEstado] = useState<EstadoNutricao>(estadoVazio);
  const [atividades, setAtividades] = useState<AtividadeNutricional[]>([]);
  const [erroAtividades, setErroAtividades] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [periodoPronto, setPeriodoPronto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [mostrarCalculo, setMostrarCalculo] = useState(false);
  const [modeloEditando, setModeloEditando] = useState<ModeloDieta | null>(null);
  const [modeloOrigemEditando, setModeloOrigemEditando] = useState<ModeloDieta | null>(null);
  const [nomeModelo, setNomeModelo] = useState("");
  const [dataModelo, setDataModelo] = useState(hoje);
  const [tornarPadrao, setTornarPadrao] = useState(true);
  const [repetirModelo, setRepetirModelo] = useState(true);
  const [copiarDe, setCopiarDe] = useState<string | null>(null);
  const [repetirDesde, setRepetirDesde] = useState(hoje);
  const [semanaMostrada, setSemanaMostrada] = useState(false);
  const [mostrarCopias, setMostrarCopias] = useState(false);
  const [copias, setCopias] = useState<Awaited<ReturnType<typeof listarCopiasConflitosNutricao>>>([]);
  const [comparacao, setComparacao] = useState<{ titulo: string; local: unknown; remoto: unknown } | null>(null);
  const consultaRef = useRef(0);
  const mutacaoRef = useRef(false);
  const voltarArea = () => {
    if (mutacaoRef.current) return;
    if (aba === "hoje" && origemDiario === "historico") { setOrigemDiario("inicio"); setAba("historico"); }
    else setAba("inicio");
  };
  useVoltarDoModal(aba !== "inicio", voltarArea);
  const semana = useMemo(() => semanaDaData(data), [data]);
  const inicio = semana[0], fim = semana[6];
  const contexto = `${usuarioId}:${inicio}:${fim}`;
  const bloqueioDia = ocupado || periodoPronto !== contexto;
  const perfil = useMemo(() => lerPerfilTreino(metadados), [metadados]);
  const carregar = useCallback(async () => {
    const consulta = ++consultaRef.current;
    try {
      const [novoEstado, resultado] = await Promise.all([carregarEstadoNutricao(usuarioId, inicio, fim), carregarAtividadesNutricao(usuarioId, inicio, fim)]);
      if (consulta !== consultaRef.current) return;
      setEstado(novoEstado); setAtividades(resultado.atividades); setErroAtividades(resultado.erro);
      setPeriodoPronto(`${usuarioId}:${inicio}:${fim}`);
      setRepetirDesde(novoEstado.preferencias.repetirDesde || dataLocal());
    } catch (falha) { if (consulta === consultaRef.current) setAviso(msgErro(falha)); }
    finally { if (consulta === consultaRef.current) setCarregando(false); }
  }, [usuarioId, inicio, fim]);
  useEffect(() => {
    if (!foco) return;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => void carregar(), 0);
    const agendar = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void carregar(), 250); };
    const remover = assinarMudancasDeDados(agendar), removerRascunhos = assinarRascunhos(agendar);
    const app = AppState.addEventListener("change", (estadoApp) => { if (estadoApp === "active") agendar(); });
    if (typeof window !== "undefined") window.addEventListener("online", agendar);
    return () => { consultaRef.current += 1; if (timer) clearTimeout(timer); remover(); removerRascunhos(); app.remove(); if (typeof window !== "undefined") window.removeEventListener("online", agendar); };
  }, [foco, carregar]);
  const config = configuracaoNaData(estado.configuracoes, data);
  const armazenado = estado.dias.find((dia) => dia.data === data);
  const padrao = modeloNaData(estado.modelos, estado.preferencias, data);
  const configPreview = JSON.stringify(config);
  const modeloPreview = JSON.stringify(data >= hoje ? padrao : null);
  const previsto = useMemo(() => criarDia(usuarioId, data, JSON.parse(configPreview) as ConfiguracaoNutricional | null, JSON.parse(modeloPreview) as ModeloDieta | null), [usuarioId, data, configPreview, modeloPreview]);
  const dia = armazenado ?? previsto;
  const resumo = analisarDia(armazenado ?? (dia.refeicoes.some((r) => r.itens.length) ? dia : null), atividades, data, hoje);
  const resumosSemana = semana.map((diaSemana) => {
    const resumoDia = analisarDia(estado.dias.find((d) => d.data === diaSemana) ?? null, atividades, diaSemana, hoje);
    return erroAtividades && resumoDia.situacao !== "futuro" ? { ...resumoDia, completo: false, saldo: null, situacao: "insuficiente" as const } : resumoDia;
  });
  const resumoSemana = resumirSemana(resumosSemana);
  const macrosSemana = resumosSemana.filter((r) => r.completo).reduce((total, r) => ({ proteinas: total.proteinas + r.consumido.proteinas, carboidratos: total.carboidratos + r.consumido.carboidratos, gorduras: total.gorduras + r.consumido.gorduras }), { proteinas: 0, carboidratos: 0, gorduras: 0 });
  const atividadesSemCalorias = resumosSemana.filter((r) => r.situacao !== "futuro").reduce((total, r) => total + r.desconhecidas, 0);
  const atividadesPendentes = resumosSemana.filter((r) => r.situacao !== "futuro").reduce((total, r) => total + r.pendentes, 0);
  const atividadesDoDia = atividades.filter((a) => a.data === data);
  const atividadesDaSemana = atividades.filter((a) => a.data >= inicio && a.data <= fim && a.data <= hoje);
  const totaisAtividade = (lista: AtividadeNutricional[], tipo: AtividadeNutricional["tipo"]) => {
    const filtradas = lista.filter((a) => a.tipo === tipo);
    return { sessoes: filtradas.length, minutos: filtradas.reduce((total, a) => total + a.minutos, 0), kcal: filtradas.reduce((total, a) => total + (a.caloriasAtivas ?? 0), 0), desconhecidas: filtradas.filter((a) => a.caloriasAtivas === null).length };
  };
  async function mutar(acao: () => Promise<void>) {
    if (mutacaoRef.current) throw new Error("Aguarde a alteração em andamento.");
    mutacaoRef.current = true; setOcupado(true); setAviso("");
    try { await acao(); }
    finally { mutacaoRef.current = false; setOcupado(false); }
  }
  async function executar(acao: () => Promise<void>) {
    try { await mutar(acao); } catch (falha) { setAviso(msgErro(falha)); }
  }
  async function atualizarEstadoLocal(consulta = consultaRef.current) {
    const local = await lerEstadoNutricaoLocal(usuarioId, inicio, fim);
    if (consulta === consultaRef.current) setEstado(local);
  }
  async function guardarDia(novoDia: DiaNutricao) {
    const consulta = ++consultaRef.current;
    await salvarDiaNutricao(novoDia);
    await atualizarEstadoLocal(consulta);
  }
  async function guardarPreferencias(preferencias: PreferenciasNutricao) {
    const consulta = ++consultaRef.current;
    await salvarPreferenciasNutricao(usuarioId, preferencias);
    await atualizarEstadoLocal(consulta);
  }
  const alterarRefeicoes = async (refeicoes: RefeicaoNutricao[]) => {
    if (periodoPronto !== contexto) throw new Error("Aguarde o carregamento dos registros desta semana.");
    if (dia.concluido) throw new Error("Reabra os registros do dia para editar.");
    if (data > hoje && refeicoes.some((r) => r.itens.some((i) => i.consumido))) throw new Error("Datas futuras permitem somente planejamento.");
    await mutar(async () => guardarDia({ ...dia, refeicoes, concluido: false, alteradoEm: new Date().toISOString() }));
  };
  function selecionarData(novaData: string) {
    if (semanaDaData(novaData)[0] !== inicio) consultaRef.current += 1;
    setData(novaData);
    setDataTexto(novaData);
  }
  function abrirModelo(modelo?: ModeloDieta, doDia = false) {
    const novo: ModeloDieta = modelo ?? { id: novoIdNutricao(), usuarioId, grupoId: novoIdNutricao(), nome: "Minha dieta", versao: 0, vigenteDesde: hoje, criadoEm: new Date().toISOString(), refeicoes: doDia ? dia.refeicoes : novasRefeicoes() };
    const versao = Math.max(novo.versao, ...estado.modelos.filter((m) => m.grupoId === novo.grupoId).map((m) => m.versao)) + 1;
    setAviso("");
    setModeloOrigemEditando(modelo ?? null);
    setModeloEditando({ ...novo, id: novoIdNutricao(), versao, criadoEm: new Date().toISOString(), refeicoes: clonarRefeicoes(novo.refeicoes) }); setNomeModelo(novo.nome); setDataModelo(hoje); setTornarPadrao(true); setRepetirModelo(estado.preferencias.repetirDiariamente || !estado.preferencias.modeloPadraoId);
  }
  async function definirPadrao(modelo: ModeloDieta, repetir = estado.preferencias.repetirDiariamente) {
    const atual = estado.modelos.find((m) => m.id === estado.preferencias.modeloPadraoId);
    if (repetir && atual && atual.grupoId !== modelo.grupoId && modelo.vigenteDesde > hoje)
      throw new Error("Esta dieta começa numa data futura. Seu padrão atual foi mantido; defina a nova dieta como padrão a partir da vigência dela.");
    await guardarPreferencias({ ...estado.preferencias, modeloPadraoId: modelo.id, repetirDiariamente: repetir, repetirDesde: estado.preferencias.repetirDiariamente && estado.preferencias.repetirDesde ? estado.preferencias.repetirDesde : modelo.vigenteDesde });
  }
  async function salvarModelo() {
    if (!modeloEditando || !nomeModelo.trim()) throw new Error("Informe o nome da dieta.");
    if (deslocarDia(dataModelo, 0) !== dataModelo || dataModelo < hoje) throw new Error("A nova versão deve começar hoje ou numa data futura (AAAA-MM-DD).");
    if (!modeloEditando.refeicoes.some((r) => r.itens.length)) throw new Error("Adicione ao menos um alimento à dieta.");
    const modelo: ModeloDieta = { ...modeloEditando, nome: nomeModelo.trim(), vigenteDesde: dataModelo };
    const consulta = ++consultaRef.current;
    await salvarModeloDieta(modelo);
    await atualizarEstadoLocal(consulta);
    const padraoAtual = estado.modelos.find((m) => m.id === estado.preferencias.modeloPadraoId);
    if (tornarPadrao && repetirModelo && padraoAtual && padraoAtual.grupoId !== modelo.grupoId && modelo.vigenteDesde > hoje) {
      setModeloEditando(null);
      setAviso(`Dieta salva para ${dataBonita(modelo.vigenteDesde)}. O padrão atual continua ativo; defina a nova dieta como padrão a partir da vigência dela.`);
      return;
    }
    if (tornarPadrao) await definirPadrao(modelo, repetirModelo);
    setModeloEditando(null); setAviso("Dieta guardada. Os dias já registrados mantêm suas próprias refeições.");
  }
  async function aplicarDieta(modelo: ModeloDieta) {
    if (dia.concluido) throw new Error("Reabra o dia antes de alterar seu planejamento.");
    if (dia.modeloOrigemId === modelo.id) { setOrigemDiario("inicio"); setAba("hoje"); setAviso("Esta dieta já foi aplicada. Seus ajustes foram preservados."); return; }
    if (dia.refeicoes.some((r) => r.itens.some((i) => i.consumido))) throw new Error("Este dia já tem consumo confirmado. Ajuste suas refeições diretamente para preservar os registros.");
    if (dia.refeicoes.some((r) => r.itens.length) && !await confirmar("Trocar planejamento?", "As refeições previstas neste dia serão substituídas. A dieta padrão e os outros dias serão preservados.")) return;
    await guardarDia(aplicarModelo({ ...dia, refeicoes: [] }, modelo)); setOrigemDiario("inicio"); setAba("hoje");
  }
  async function registrarRefeicaoModelo(refeicaoId: string) {
    if (periodoPronto !== contexto) throw new Error("Aguarde o carregamento dos registros desta semana.");
    if (!modeloOrigemEditando || !modeloEditando) throw new Error("Salve esta dieta antes de registrar uma refeição.");
    if (conteudoRefeicoes(modeloEditando.refeicoes) !== conteudoRefeicoes(modeloOrigemEditando.refeicoes)) throw new Error("Salve as alterações da dieta antes de registrar uma refeição. O diário usa somente a versão salva.");
    const indice = modeloEditando.refeicoes.findIndex((refeicao) => refeicao.id === refeicaoId);
    const origem = modeloOrigemEditando.refeicoes[indice];
    if (!origem) throw new Error("Salve esta refeição na dieta antes de registrá-la.");
    await guardarDia(planejarRefeicaoDoModelo(dia, modeloOrigemEditando, origem.id));
    setModeloEditando(null); setOrigemDiario("inicio"); setAba("hoje"); setAviso("Refeição adicionada ao planejamento do dia selecionado. Ajuste as quantidades e confirme o que consumiu.");
  }
  async function confirmarTudo() {
    if (data > hoje) throw new Error("Confirme o consumo apenas em datas atuais ou anteriores.");
    const total = somarNutrientes(dia.refeicoes, false);
    if (!dia.refeicoes.some((r) => r.itens.length)) throw new Error("Adicione os alimentos antes de confirmar.");
    if (!await confirmar("Confirmar as refeições deste dia?", `${dia.refeicoes.reduce((n, r) => n + r.itens.length, 0)} alimento(s), total previsto de ${kcal(total.kcal)} kcal. Confira as quantidades; confirme somente o que realmente consumiu.`)) return;
    await guardarDia({ ...dia, concluido: false, refeicoes: dia.refeicoes.map((r) => ({ ...r, itens: r.itens.map((i) => ({ ...i, consumido: true })) })), alteradoEm: new Date().toISOString() });
  }
  async function concluirDia() {
    if (data > hoje) throw new Error("Um dia futuro permite somente planejamento.");
    if (!dia.refeicoes.some((r) => r.itens.some((i) => i.consumido))) throw new Error("Confirme ao menos um alimento realmente consumido antes de concluir.");
    if (!await confirmar("Concluir os registros do dia?", "Você revisou a alimentação e as atividades desta data? Alimentos ainda planejados ficam fora do consumo. Dados ausentes continuarão identificados na análise.")) return;
    await guardarDia({ ...dia, concluido: true, alteradoEm: new Date().toISOString() });
  }
  async function copiarOutroDia() {
    if (!copiarDe || deslocarDia(copiarDe, 0) !== copiarDe) throw new Error("Informe a data de origem como AAAA-MM-DD.");
    const origemEstado = await carregarEstadoNutricao(usuarioId, copiarDe, copiarDe);
    const origem = origemEstado.dias.find((d) => d.data === copiarDe);
    if (!origem) throw new Error("Nenhum diário salvo foi encontrado nessa data.");
    if (dia.concluido || dia.refeicoes.some((r) => r.itens.some((i) => i.consumido))) throw new Error("O dia de destino já tem consumo confirmado. Ajuste os itens individualmente.");
    if (dia.refeicoes.some((r) => r.itens.length) && !await confirmar("Substituir o planejamento deste dia?", "A cópia terá alimentos planejados; você poderá ajustar e confirmar o consumo.")) return;
    await guardarDia(copiarDia(origem, { ...dia, refeicoes: [] })); setCopiarDe(null);
  }
  const editorProps = { usuarioId, corTema, preferencias: estado.preferencias, onPreferencias: async (preferencias: PreferenciasNutricao) => mutar(async () => guardarPreferencias(preferencias)), alimentosLocais: estado.alimentosLocais, onAlimentoSalvo: () => { void atualizarEstadoLocal().catch((falha) => setAviso(msgErro(falha))); } };
  if (carregando) return <View style={estilos.centro}><ActivityIndicator color={corTema} /><Text style={e.texto}>Preparando Nutrição…</Text></View>;
  const tituloArea = aba === "inicio" ? "Nutrição" : areasNutricao.find((area) => area.id === aba)?.titulo ?? "Nutrição";
  function abrirArea(area: Exclude<AreaNutricao, "inicio">) {
    if (mutacaoRef.current) return;
    setAviso(""); setOrigemDiario("inicio");
    if (area === "hoje") selecionarData(hoje);
    setAba(area);
  }
  async function salvarMetas(nova: ConfiguracaoNutricional) {
    await mutar(async () => {
      const consulta = ++consultaRef.current;
      await salvarConfiguracaoNutricao(nova); await atualizarEstadoLocal(consulta);
      if (consulta === consultaRef.current && nova.vigenteDesde <= data && !dia.concluido && armazenado && await confirmar("Aplicar também ao dia aberto?", `Atualizar os parâmetros de ${dataBonita(data)}? Os outros dias permanecem com seus snapshots.`))
        await guardarDia({ ...dia, configuracao: nova, alteradoEm: new Date().toISOString() });
      setAba("inicio"); setAviso("Metas guardadas. Seus registros anteriores foram preservados.");
    });
  }
  return <View style={estilos.container}><ScrollView key={aba} keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
    {aba !== "inicio" ? <View style={{ alignItems: "flex-start" }}><Botao titulo={aba === "hoje" && origemDiario === "historico" ? "‹ Histórico alimentar" : "‹ Nutrição"} disabled={ocupado} cor={corTema} onPress={voltarArea} /></View> : null}
    <View><Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text><Text style={estilos.titulo}>{tituloArea}</Text></View>
    {aba === "inicio" ? <Text style={e.texto}>Seu espaço de alimentação. Escolha o que quer fazer agora.</Text> : null}
    {periodoPronto !== contexto && aba !== "inicio" ? <Text style={e.pequeno}>Atualizando os registros desta semana…</Text> : null}
    {aba === "hoje" || aba === "analise" ? <View style={e.card}><View style={e.linha}><Botao titulo="‹ Dia anterior" disabled={ocupado} cor={corTema} onPress={() => { const nova = deslocarDia(data, -1); selecionarData(nova); }} /><Text style={[e.titulo, { flex: 1, textAlign: "center" }]}>{dataBonita(data)}</Text><Botao titulo="Próximo dia ›" disabled={ocupado} cor={corTema} onPress={() => { const nova = deslocarDia(data, 1); selecionarData(nova); }} /></View><View style={e.linha}><Campo titulo="Consultar data (AAAA-MM-DD)" valor={dataTexto} onChange={setDataTexto} /><Botao titulo="Ir para data" disabled={ocupado} cor={corTema} onPress={() => { try { selecionarData(deslocarDia(dataTexto, 0)); setAviso(""); } catch { setAviso("Confira a data no formato AAAA-MM-DD."); } }} /><Botao titulo="Hoje" disabled={ocupado} cor={corTema} onPress={() => { selecionarData(hoje); }} /></View></View> : null}
    {aviso ? <Text accessibilityRole="alert" style={estilos.aviso}>{aviso}</Text> : null}
    {estado.erro ? <View style={e.card}><Text style={estilos.aviso}>{estado.erro}</Text><Text style={e.pequeno}>As alterações pendentes continuam guardadas neste aparelho.</Text></View> : null}
    {estado.conflitos?.map((conflito) => <View key={conflito.recursoId} style={e.card}><Text style={e.titulo}>Alterações em outro aparelho</Text><Text style={e.texto}>{conflito.mensagem}</Text><Text style={e.pequeno}>Escolha qual versão usar. A versão descartada permanece na recuperação local.</Text><Botao titulo="Comparar versões" cor={corTema} onPress={() => setComparacao({ titulo: "Comparar alterações", local: conflito.local, remoto: conflito.remoto })} /><Botao titulo="Manter minha versão local" disabled={ocupado} cor={corTema} onPress={() => void executar(async () => { await resolverConflitoNutricao(usuarioId, conflito.recursoId, "local"); await carregar(); })} /><Botao titulo="Usar versão do servidor" disabled={ocupado} cor={corTema} onPress={() => void executar(async () => { if (await confirmar("Usar os dados do servidor?", "A versão deste aparelho será preservada na recuperação local.")) { await resolverConflitoNutricao(usuarioId, conflito.recursoId, "remoto"); await carregar(); } })} /></View>)}
    {aba === "inicio" ? <View style={estilos.listaAreas}>
      {areasNutricao.map((area) => <TouchableOpacity key={area.id} accessibilityRole="button" accessibilityLabel={`Abrir ${area.titulo}`} disabled={ocupado} activeOpacity={0.8} onPress={() => abrirArea(area.id)} style={estilos.cartaoArea}>
        <View style={[estilos.iconeArea, { backgroundColor: `${corTema}20` }]}><Text style={estilos.emojiArea}>{area.icone}</Text></View>
        <View style={estilos.textoArea}><Text style={estilos.tituloArea}>{area.titulo}</Text><Text style={estilos.descricaoArea}>{area.descricao}</Text></View>
        <Text style={[estilos.setaArea, { color: corTema }]}>›</Text>
      </TouchableOpacity>)}
    </View> : aba === "historico" ? <>
      <Text style={e.texto}>Escolha uma data para ver e corrigir sua alimentação. Os dias sem consumo confirmado continuam identificados.</Text>
      <View style={e.card}><View style={e.linha}><Botao titulo="‹ Semana anterior" disabled={ocupado} cor={corTema} onPress={() => selecionarData(deslocarDia(data, -7))} /><Text style={[e.texto, { flex: 1 }]}>{dataBonita(inicio)} a {dataBonita(fim)}</Text><Botao titulo="Próxima semana ›" disabled={ocupado} cor={corTema} onPress={() => selecionarData(deslocarDia(data, 7))} /></View>
        <Campo titulo="Consultar data (AAAA-MM-DD)" valor={dataTexto} onChange={setDataTexto} /><Botao titulo="Consultar semana da data" disabled={ocupado} cor={corTema} onPress={() => { try { selecionarData(deslocarDia(dataTexto, 0)); setAviso(""); } catch { setAviso("Confira a data no formato AAAA-MM-DD."); } }} />
      </View>
      {[...resumosSemana].reverse().filter((registro) => registro.data <= hoje).map((registro) => <TouchableOpacity key={registro.data} accessibilityRole="button" accessibilityLabel={`Abrir diário de ${dataBonita(registro.data)}`} disabled={bloqueioDia} activeOpacity={0.8} style={estilos.cartaoArea} onPress={() => { selecionarData(registro.data); setOrigemDiario("historico"); setAba("hoje"); }}>
        <View style={[estilos.iconeArea, { backgroundColor: `${corTema}20` }]}><Text style={estilos.emojiArea}>📅</Text></View>
        <View style={estilos.textoArea}><Text style={estilos.tituloArea}>{dataBonita(registro.data)}</Text><Text style={estilos.descricaoArea}>{registro.itensConsumidos ? `${kcal(registro.consumido.kcal)} kcal confirmadas · ${estado.dias.find((d) => d.data === registro.data)?.concluido ? "registros concluídos" : "registros abertos"}` : registro.planejado.kcal > 0 ? "Somente planejamento · consumo a confirmar" : "Sem alimentação registrada"}</Text></View><Text style={[estilos.setaArea, { color: corTema }]}>›</Text>
      </TouchableOpacity>)}
      {inicio > hoje ? <Text style={e.texto}>Esta semana ainda não tem dias passados. O planejamento futuro fica em Alimentação de hoje.</Text> : null}
    </> : aba === "metas" ? <MetasNutricao usuarioId={usuarioId} hoje={hoje} perfil={perfil} atual={configuracaoNaData(estado.configuracoes, hoje)} cor={corTema} onAbrirPerfil={() => { if (!mutacaoRef.current) onAbrirPerfil(); }} onSalvar={salvarMetas} /> : aba === "hoje" ? <>
      <View style={e.card}><Text style={e.titulo}>{dia.concluido ? "Registros do dia concluídos" : data > hoje ? "Somente planejamento" : "Diário de alimentação"}</Text><Text style={estilos.numero}>{kcal(resumo.consumido.kcal)} <Text style={e.texto}>kcal consumidas</Text></Text><Text style={e.texto}>Meta: {dia.configuracao?.metaKcal == null ? "não configurada" : `${kcal(dia.configuracao.metaKcal)} kcal`}</Text><Barra valor={resumo.consumido.kcal} meta={dia.configuracao?.metaKcal ?? null} cor={corTema} />{resumo.diferencaMeta !== null ? <Text style={e.texto}>{resumo.diferencaMeta > 0 ? `${kcal(resumo.diferencaMeta)} kcal acima da meta` : `Faltam ${kcal(-resumo.diferencaMeta)} kcal para a meta`}</Text> : null}<Text style={e.pequeno}>Planejamento total: {kcal(resumo.planejado.kcal)} kcal · Diferença para o confirmado: {kcal(resumo.planejado.kcal - resumo.consumido.kcal)} kcal</Text>{([ ["proteinas", "Proteínas", dia.configuracao?.metaProteinas], ["carboidratos", "Carboidratos", dia.configuracao?.metaCarboidratos], ["gorduras", "Gorduras", dia.configuracao?.metaGorduras] ] as const).map(([campo, nome, meta]) => <View key={campo}><Text style={e.texto}>{nome}: {resumo.consumido[campo].toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g{meta != null ? ` / ${meta} g` : ""}</Text><Barra valor={resumo.consumido[campo]} meta={meta ?? null} cor={corTema} /></View>)}{dia.modeloOrigemId ? <Text style={e.pequeno}>Baseado em uma cópia independente da dieta · versão {dia.modeloVersao}. Seus ajustes valem apenas para {dataBonita(data)}.</Text> : null}<Text style={e.pequeno}>{!armazenado && data < hoje ? "Nenhum consumo foi registrado nesta data. Você pode preencher o histórico ou aplicar uma dieta explicitamente." : "Itens planejados só entram no consumo após sua confirmação."}</Text></View>
      <View style={e.linha}><Botao titulo="Usar minha dieta padrão" disabled={bloqueioDia || dia.concluido || !estado.preferencias.modeloPadraoId} cor={corTema} onPress={() => void executar(async () => { const modelo = modeloNaData(estado.modelos, { ...estado.preferencias, repetirDiariamente: true, repetirDesde: "0000-01-01" }, data); if (!modelo) throw new Error("Nenhuma versão dessa dieta estava disponível na data selecionada."); await aplicarDieta(modelo); })} /><Botao titulo="Repetir outro dia" disabled={bloqueioDia || dia.concluido} cor={corTema} onPress={() => { setAviso(""); setCopiarDe(deslocarDia(data, -1)); }} /><Botao titulo="Salvar este dia como dieta" disabled={bloqueioDia} cor={corTema} onPress={() => abrirModelo(undefined, true)} /></View>
      {dia.concluido ? <Botao titulo="Reabrir registros para corrigir" disabled={bloqueioDia} cor={corTema} onPress={() => void executar(async () => guardarDia({ ...dia, concluido: false, alteradoEm: new Date().toISOString() }))} /> : <>
        {data <= hoje ? <Botao titulo="Comi todas as refeições como estão" disabled={bloqueioDia} cor={corTema} onPress={() => void executar(confirmarTudo)} /> : null}
      </>}
      <EditorRefeicoesNutricao {...editorProps} refeicoes={dia.refeicoes} onAlterar={alterarRefeicoes} modo={data > hoje ? "planejamento" : "dia"} bloqueado={dia.concluido || bloqueioDia} />
      {!dia.concluido && data <= hoje ? <Botao titulo="Concluir registros do dia" primario disabled={bloqueioDia} cor={corTema} onPress={() => void executar(concluirDia)} /> : null}
      <View style={e.linha}><Botao titulo="Minha dieta" disabled={ocupado} cor={corTema} onPress={() => abrirArea("dieta")} /><Botao titulo="Minhas metas" disabled={ocupado} cor={corTema} onPress={() => abrirArea("metas")} /></View>
      <Botao titulo="Ver balanço de alimentação e exercícios" cor={corTema} onPress={() => { setAba("analise"); setSemanaMostrada(false); }} />
    </> : aba === "dieta" ? <>
      <Text style={e.pequeno}>Aplicar ou registrar refeições usa o dia selecionado: {dataBonita(data)}. As quantidades podem ser ajustadas antes de confirmar o consumo.</Text>
      <View style={e.card}><Text style={e.titulo}>Uma dieta, seus ajustes a cada dia</Text><Text style={e.texto}>Cadastre as refeições uma vez. Cada dia recebe seu próprio planejamento e você altera apenas o que fez diferente.</Text><View style={e.linha}><Text style={[e.texto, { flex: 1 }]}>Repetir a dieta padrão todos os dias</Text><Switch accessibilityLabel="Repetir dieta diariamente" value={estado.preferencias.repetirDiariamente} onValueChange={(valor) => void executar(async () => { if (valor && !estado.preferencias.modeloPadraoId) throw new Error("Escolha uma dieta padrão primeiro."); const desde = deslocarDia(repetirDesde, 0); await guardarPreferencias({ ...estado.preferencias, repetirDiariamente: valor, repetirDesde: desde }); })} trackColor={{ true: corTema }} /></View><Campo titulo="Repetir a partir de (AAAA-MM-DD)" valor={repetirDesde} onChange={setRepetirDesde} /><Botao titulo="Guardar data da repetição" cor={corTema} onPress={() => void executar(async () => guardarPreferencias({ ...estado.preferencias, repetirDesde: deslocarDia(repetirDesde, 0) }))} /><Botao titulo="Criar dieta" disabled={ocupado} primario cor={corTema} onPress={() => abrirModelo()} /></View>
      {estado.modelos.length === 0 ? <Text style={e.texto}>Sua primeira dieta pode ser criada aqui ou a partir de um dia já preenchido.</Text> : null}
      {[...estado.modelos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((modelo) => <View key={modelo.id} style={e.card}><Text style={e.titulo}>{modelo.nome}{estado.preferencias.modeloPadraoId === modelo.id ? " · padrão" : ""}</Text><Text style={e.pequeno}>Versão {modelo.versao} · disponível desde {dataBonita(modelo.vigenteDesde)}</Text><Text style={e.texto}>{modelo.refeicoes.length} refeições · {kcal(somarNutrientes(modelo.refeicoes, false).kcal)} kcal planejadas</Text><View style={e.linha}><Botao titulo="Ver e editar dieta" disabled={ocupado} cor={corTema} onPress={() => abrirModelo(modelo)} /><Botao titulo={`Aplicar em ${dataBonita(data)}`} disabled={ocupado} cor={corTema} onPress={() => void executar(async () => aplicarDieta(modelo))} /><Botao titulo="Definir como padrão" disabled={ocupado} cor={corTema} onPress={() => void executar(async () => definirPadrao(modelo))} /></View></View>)}
    </> : <>
      <View style={e.linha}><Botao titulo="Dia selecionado" primario={!semanaMostrada} cor={corTema} onPress={() => setSemanaMostrada(false)} /><Botao titulo="Semana" primario={semanaMostrada} cor={corTema} onPress={() => setSemanaMostrada(true)} /><Botao titulo="Entenda este cálculo" cor={corTema} onPress={() => setMostrarCalculo(true)} /></View>
      {erroAtividades ? <Text style={estilos.aviso}>Não foi possível atualizar as atividades: {erroAtividades}. Os valores disponíveis podem estar desatualizados; o fechamento do saldo permanece pendente.</Text> : null}
      {!semanaMostrada ? <><CartaoSaldo resumo={resumo} atividadesConferidas={!erroAtividades} /><View style={e.card}><Text style={e.titulo}>Atividades de {dataBonita(data)}</Text>{(["musculacao", "cardio"] as const).map((tipo) => { const total = totaisAtividade(atividadesDoDia, tipo); return <Text key={tipo} style={e.texto}>{tipo === "musculacao" ? "Musculação" : "Cardio"}: {total.sessoes} sessões · {total.minutos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min · {kcal(total.kcal)} kcal ativas conhecidas{total.desconhecidas ? ` · ${total.desconhecidas} sem estimativa` : ""}</Text>; })}{atividades.filter((a) => a.data === data).length === 0 ? <Text style={e.texto}>Nenhuma sessão concluída registrada nesta data.</Text> : atividades.filter((a) => a.data === data).map((a) => <Text key={`${a.tipo}:${a.id}`} style={e.texto}>{a.nome} · {a.minutos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min · {a.caloriasAtivas === null ? "calorias indisponíveis" : `${kcal(a.caloriasAtivas)} kcal ativas`}{a.pendente ? " · pendente" : ""}</Text>)}</View></> : <>
        <View style={e.card}><View style={e.linha}><Botao titulo="‹ Semana" disabled={ocupado} cor={corTema} onPress={() => { const nova = deslocarDia(data, -7); selecionarData(nova); }} /><Text style={[e.texto, { flex: 1 }]}>{dataBonita(inicio)} a {dataBonita(fim)}</Text><Botao titulo="Semana ›" disabled={ocupado} cor={corTema} onPress={() => { const nova = deslocarDia(data, 7); selecionarData(nova); }} /></View><Text style={e.titulo}>{resumoSemana.diasValidos} dia(s) completos incluídos</Text><Text style={e.texto}>{resumoSemana.parciais} parciais · {resumoSemana.semRegistros} sem registros · {resumoSemana.insuficientes} com dados insuficientes</Text><Text style={estilos.numero}>{resumoSemana.saldo === null ? "—" : `${resumoSemana.saldo > 0 ? "+" : resumoSemana.saldo < 0 ? "−" : ""}${kcal(Math.abs(resumoSemana.saldo))} kcal`}</Text><Text style={e.texto}>{resumoSemana.saldo === null ? "Ainda não há saldo fechado para comparar." : resumoSemana.situacao === "manutencao" ? "Saldo líquido próximo da manutenção" : resumoSemana.saldo < 0 ? "Déficit líquido estimado nos dias incluídos" : "Superávit líquido estimado nos dias incluídos"}</Text><Text style={e.texto}>Consumo: {kcal(resumoSemana.consumo)} kcal · Gasto: {kcal(resumoSemana.gasto)} kcal</Text><Text style={e.texto}>Macros nos dias incluídos: proteínas {kcal(macrosSemana.proteinas)} g · carboidratos {kcal(macrosSemana.carboidratos)} g · gorduras {kcal(macrosSemana.gorduras)} g</Text><Text style={e.texto}>Soma dos déficits: {kcal(resumoSemana.deficits)} kcal</Text><Text style={e.texto}>Soma dos superávits: {kcal(resumoSemana.superavits)} kcal</Text><Text style={e.texto}>Média do saldo: {resumoSemana.mediaSaldo === null ? "—" : `${kcal(resumoSemana.mediaSaldo)} kcal/dia incluído`}</Text><Text style={e.pequeno}>Somente dias completos com dados suficientes entram nesses totais. A semana parcial não é extrapolada para sete dias.</Text></View>
        <View style={e.card}><Text style={e.titulo}>Consumo e gasto por dia</Text><Text style={e.pequeno}>Barra colorida: consumo confirmado · barra cinza: gasto estimado. Sem consumo registrado aparece como “sem registros”.</Text>{resumosSemana.map((r) => <View key={r.data} style={{ gap: 4 }}><View style={e.linha}><Text style={[e.texto, { flex: 1 }]}>{dataBonita(r.data)} · {r.situacao === "futuro" ? "futuro" : !r.itensConsumidos ? r.planejado.kcal > 0 ? "somente planejado" : "sem registros" : r.completo ? "completo" : "parcial / insuficiente"}</Text><Botao titulo="Ver dia" disabled={ocupado} cor={corTema} onPress={() => { selecionarData(r.data); setSemanaMostrada(false); }} /></View>{r.itensConsumidos > 0 && r.situacao !== "futuro" ? <><Text style={e.pequeno}>{kcal(r.consumido.kcal)} kcal consumidas · {r.gastoTotal === null ? "gasto indisponível" : `${kcal(r.gastoTotal)} kcal de gasto previsto`}</Text><Text style={e.pequeno}>Saldo fechado: {r.saldo === null ? "pendente" : `${r.saldo > 0 ? "+" : ""}${kcal(r.saldo)} kcal`} · exercícios: {kcal(r.gastoExercicio)} kcal ativas conhecidas{r.desconhecidas ? ` · ${r.desconhecidas} sem estimativa` : ""}</Text><Barra valor={r.consumido.kcal} meta={Math.max(r.consumido.kcal, r.gastoTotal ?? 0, 1)} cor={corTema} /><Barra valor={r.gastoTotal ?? 0} meta={Math.max(r.consumido.kcal, r.gastoTotal ?? 0, 1)} cor="#929D96" /></> : <Text style={e.pequeno}>—</Text>}</View>)}</View>
        <View style={e.card}><Text style={e.titulo}>Exercícios registrados na semana</Text>{(["musculacao", "cardio"] as const).map((tipo) => { const total = totaisAtividade(atividadesDaSemana, tipo); return <Text key={tipo} style={e.texto}>{tipo === "musculacao" ? "Musculação" : "Cardio"}: {total.sessoes} sessões · {total.minutos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} min · {kcal(total.kcal)} kcal ativas conhecidas</Text>; })}<Text style={e.texto}>{resumoSemana.sessoes} sessões · {resumoSemana.minutos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} minutos</Text><Text style={e.texto}>{kcal(resumoSemana.atividadesCalorias)} kcal ativas conhecidas</Text><Text style={e.pequeno}>{atividadesSemCalorias} sessão(ões) sem estimativa de calorias · {atividadesPendentes} aguardando confirmação.</Text><Text style={e.pequeno}>Atividades de dias parciais também aparecem aqui; os totais de saldo acima usam somente dias completos válidos.</Text></View>
      </>}
    </>}
    <View style={estilos.rodapeSincronizacao}>
    <View style={e.linha}><Text style={[e.pequeno, { flex: 1 }]}>{estado.pendencias ? `${estado.pendencias} alteração(ões) aguardando confirmação do servidor` : "Dados locais disponíveis · sincronização conferida na última leitura"}</Text><Botao titulo={ocupado ? "Aguarde…" : "Sincronizar"} disabled={ocupado} cor={corTema} onPress={() => void executar(async () => { const resultado = await sincronizarNutricao(usuarioId); if (resultado.erro) setAviso(resultado.erro); await carregar(); })} /></View>
    <Botao titulo="Ver cópias de recuperação" disabled={ocupado} cor={corTema} onPress={() => void executar(async () => { setCopias(await listarCopiasConflitosNutricao(usuarioId)); setMostrarCopias(true); })} />
    </View>
  </ScrollView>

  <ModalNutricao bloqueado={ocupado} aviso={aviso} visivel={Boolean(modeloEditando)} titulo="Minha dieta · modelo" onFechar={() => setModeloEditando(null)} cor={corTema}>{modeloEditando ? <><Campo titulo="Nome da dieta" valor={nomeModelo} onChange={setNomeModelo} /><Campo titulo="Disponível a partir de (AAAA-MM-DD)" valor={dataModelo} onChange={setDataModelo} /><Text style={e.pequeno}>Salvar uma edição cria outra versão. As cópias já usadas no diário ficam preservadas.</Text><View style={e.linha}><Text style={[e.texto, { flex: 1 }]}>Definir como minha dieta padrão</Text><Switch value={tornarPadrao} onValueChange={setTornarPadrao} trackColor={{ true: corTema }} /></View><View style={e.linha}><Text style={[e.texto, { flex: 1 }]}>Repetir automaticamente como planejamento diário</Text><Switch value={repetirModelo} onValueChange={setRepetirModelo} trackColor={{ true: corTema }} /></View><EditorRefeicoesNutricao {...editorProps} refeicoes={modeloEditando.refeicoes} onAlterar={async (refeicoes) => setModeloEditando((anterior) => anterior ? { ...anterior, refeicoes } : null)} modo="modelo" onRegistrarRefeicao={modeloOrigemEditando ? async (refeicaoId) => mutar(async () => registrarRefeicaoModelo(refeicaoId)) : undefined} bloqueado={ocupado} /><Botao titulo="Salvar dieta" primario cor={corTema} disabled={ocupado} onPress={() => void executar(salvarModelo)} /></> : null}</ModalNutricao>
  <ModalNutricao bloqueado={ocupado} aviso={aviso} visivel={copiarDe !== null} titulo="Repetir refeições de outro dia" onFechar={() => setCopiarDe(null)} cor={corTema}><Campo titulo="Data de origem (AAAA-MM-DD)" valor={copiarDe ?? ""} onChange={setCopiarDe} /><Text style={e.texto}>Os alimentos serão copiados como planejamento. Confirme depois o que realmente consumiu.</Text><Botao titulo="Copiar refeições" disabled={ocupado} primario cor={corTema} onPress={() => void executar(copiarOutroDia)} /></ModalNutricao>
  <ModalNutricao visivel={mostrarCopias} titulo="Cópias de recuperação" cor={corTema} onFechar={() => setMostrarCopias(false)}>{copias.length === 0 ? <Text style={e.texto}>Ainda não há cópias de conflitos neste aparelho.</Text> : [...copias].reverse().map((copia, indice) => <View key={`${copia.recursoId}:${copia.data}:${indice}`} style={e.card}><Text style={e.pequeno}>{copia.origem === "local" ? "Versão deste aparelho" : "Versão do servidor"} · {new Date(copia.data).toLocaleString("pt-BR")}</Text><ResumoDocumento documento={copia.documento} /></View>)}</ModalNutricao>
  <ModalNutricao visivel={comparacao !== null} titulo={comparacao?.titulo ?? "Comparar versões"} cor={corTema} onFechar={() => setComparacao(null)}><View style={e.card}><Text style={e.titulo}>Neste aparelho</Text><ResumoDocumento documento={comparacao?.local} /></View><View style={e.card}><Text style={e.titulo}>No servidor</Text><ResumoDocumento documento={comparacao?.remoto} /></View></ModalNutricao>
  <ModalNutricao visivel={mostrarCalculo} titulo="Entenda este cálculo" onFechar={() => setMostrarCalculo(false)} cor={corTema}><Text style={e.texto}>Saldo energético = consumo confirmado − gasto total estimado. Negativo indica déficit; positivo indica superávit.</Text><Text style={e.texto}>Gasto total = base da rotina sem treinos + calorias ativas das sessões. O repouso já está dentro da base e não é somado novamente.</Text><Text style={e.texto}>A diferença para a meta alimentar mede o cumprimento da meta. Ultrapassá-la pode coexistir com um déficit energético.</Text><Text style={e.texto}>A faixa de manutenção é uma convenção de apresentação, configurada nas metas. Não é uma margem de precisão fisiológica.</Text><Text style={e.texto}>O gasto em repouso segue Mifflin–St Jeor. A base e os exercícios são estimativas. Dados ausentes e dias abertos mantêm o resultado parcial.</Text><Text style={e.pequeno}>Alimentos do catálogo: TACO, NEPA/UNICAMP, 4ª edição, 2011. Consulte a fonte de cada item; alimentos próprios usam os valores do rótulo informado.</Text></ModalNutricao>
  </View>;
}
const estilos = StyleSheet.create({
  listaAreas: { gap: 14 },
  cartaoArea: { backgroundColor: "#191E1B", borderRadius: 18, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: "#303A33", minHeight: 106 },
  iconeArea: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  emojiArea: { fontSize: 27 },
  textoArea: { flex: 1, gap: 6 },
  tituloArea: { fontSize: 18, fontWeight: "800", color: "#F0F3F1" },
  descricaoArea: { fontSize: 13, lineHeight: 19, color: "#A9B6AD" },
  setaArea: { fontSize: 29, fontWeight: "700" },
  rodapeSincronizacao: { gap: 12, marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#303A33" },
  container: { flex: 1, backgroundColor: "#101312", minHeight: 0 }, conteudo: { width: "100%", maxWidth: 860, alignSelf: "center", padding: 18, paddingBottom: 42, gap: 16 }, centro: { flex: 1, backgroundColor: "#101312", alignItems: "center", justifyContent: "center", gap: 12 }, titulo: { fontSize: 30, color: "#F0F3F1", fontWeight: "800", marginTop: 5 }, marca: { fontSize: 11, letterSpacing: 2, fontWeight: "800" }, numero: { color: "#F0F3F1", fontSize: 30, fontWeight: "800" }, trilho: { height: 7, backgroundColor: "#333E36", borderRadius: 5, overflow: "hidden" }, aviso: { color: "#FFD090", lineHeight: 21, fontSize: 14 } });
