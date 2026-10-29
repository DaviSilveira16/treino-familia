import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { AlimentoNutricao, ItemRefeicao, Nutrientes, PreferenciasNutricao } from "../../servicos/nutricaoTipos";
import { novoIdNutricao, numeroNutricional, nutrientesItem, validarAlimento } from "../../servicos/nutricaoCalculos";
import { buscarAlimentosNutricao, salvarAlimentoNutricao } from "../../servicos/nutricaoRepositorio";
import { useVoltarDoModal } from "../../servicos/voltarModal";
import { BotaoNutricional, CampoNutricional, confirmarNutricao, erroNutricional, n, numeroNutricao } from "./nutricaoUI";

type Props = {
  usuarioId: string;
  inicial?: ItemRefeicao;
  iniciarNaBusca?: boolean;
  modo: "dia" | "modelo" | "planejamento";
  corTema: string;
  preferencias: PreferenciasNutricao;
  alimentosLocais: AlimentoNutricao[];
  onPreferencias: (preferencias: PreferenciasNutricao) => Promise<void>;
  onAlimentoSalvo?: (alimento: AlimentoNutricao) => void;
  onSalvar: (item: ItemRefeicao) => Promise<void>;
  onRemover?: () => Promise<void>;
  onFechar: () => void;
};

function alimentoDoItem(item?: ItemRefeicao): AlimentoNutricao | null {
  return item ? {
    id: item.alimentoId ?? item.id,
    usuarioId: null,
    nome: item.nome,
    marca: item.marca,
    preparo: item.preparo,
    fonte: item.fonte,
    baseGramas: item.baseGramas,
    porcaoNome: `${numeroNutricao(item.baseGramas)} g`,
    nutrientes: { ...item.nutrientesBase },
  } : null;
}

export default function SeletorAlimentoNutricao({ usuarioId, inicial, iniciarNaBusca = false, modo, corTema, preferencias, alimentosLocais, onPreferencias, onAlimentoSalvo, onSalvar, onRemover, onFechar }: Props) {
  const [fase, setFase] = useState<"catalogo" | "quantidade" | "cadastro">(inicial && !iniciarNaBusca ? "quantidade" : "catalogo");
  const [aba, setAba] = useState<"catalogo" | "recentes" | "favoritos">("catalogo");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [resultados, setResultados] = useState<AlimentoNutricao[]>([]);
  const [conhecidosExtras, setConhecidosExtras] = useState<AlimentoNutricao[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ocupadoRef = useRef(false);
  const [escolhido, setEscolhido] = useState<AlimentoNutricao | null>(() => alimentoDoItem(inicial));
  const [quantidade, setQuantidade] = useState(inicial ? String(inicial.gramas).replace(".", ",") : "100");
  const [unidade, setUnidade] = useState<"g" | "porcao">("g");
  const [consumido, setConsumido] = useState(modo === "dia" && Boolean(inicial?.consumido));
  const [itemId] = useState(() => inicial?.id ?? novoIdNutricao());
  const [alimentoIdManual, setAlimentoIdManual] = useState(novoIdNutricao);
  const [cadastro, setCadastro] = useState({ nome: "", marca: "", preparo: "", fonte: "Rótulo informado pelo usuário", base: "100", porcao: "100 g", kcal: "", proteinas: "", carboidratos: "", gorduras: "" });

  const voltar = () => {
    if (ocupadoRef.current) return;
    if (fase === "cadastro" || (fase === "quantidade" && !inicial)) {
      setFase("catalogo");
      setErro("");
    } else onFechar();
  };
  useVoltarDoModal(true, voltar);

  useEffect(() => {
    if (fase !== "catalogo" || aba !== "catalogo") return;
    let ativo = true;
    const temporizador = setTimeout(() => {
      setCarregando(true);
      setErroBusca("");
      void buscarAlimentosNutricao(usuarioId, busca.trim(), pagina).then((resposta) => {
        if (!ativo) return;
        setResultados((anteriores) => {
          const mapa = new Map((pagina === 0 ? [] : anteriores).map((alimento) => [alimento.id, alimento]));
          resposta.alimentos.forEach((alimento) => mapa.set(alimento.id, alimento));
          return [...mapa.values()];
        });
        setConhecidosExtras((anteriores) => {
          const mapa = new Map(anteriores.map((alimento) => [alimento.id, alimento]));
          resposta.alimentos.forEach((alimento) => mapa.set(alimento.id, alimento));
          return [...mapa.values()];
        });
        setTemMais(resposta.temMais);
        setErroBusca(resposta.erro ?? "");
      }).catch((falha) => {
        if (ativo) setErroBusca(erroNutricional(falha));
      }).finally(() => {
        if (ativo) setCarregando(false);
      });
    }, 250);
    return () => { ativo = false; clearTimeout(temporizador); };
  }, [usuarioId, busca, pagina, aba, fase]);

  const conhecidos = useMemo(() => {
    const mapa = new Map(alimentosLocais.map((alimento) => [alimento.id, alimento]));
    conhecidosExtras.forEach((alimento) => mapa.set(alimento.id, alimento));
    return mapa;
  }, [alimentosLocais, conhecidosExtras]);
  const alimentosExibidos = aba === "catalogo" ? resultados : (aba === "favoritos" ? preferencias.favoritos : preferencias.recentes).map((id) => conhecidos.get(id)).filter((alimento): alimento is AlimentoNutricao => Boolean(alimento));

  function selecionarAlimento(alimento: AlimentoNutricao) {
    setEscolhido(alimento);
    setQuantidade(inicial ? String(inicial.gramas).replace(".", ",") : String(alimento.baseGramas).replace(".", ","));
    setUnidade("g");
    setErro("");
    setFase("quantidade");
  }

  function abrirCadastro() {
    setAlimentoIdManual(novoIdNutricao());
    setCadastro({ nome: busca.trim(), marca: "", preparo: "", fonte: "Rótulo informado pelo usuário", base: "100", porcao: "100 g", kcal: "", proteinas: "", carboidratos: "", gorduras: "" });
    setFase("cadastro");
    setErro("");
  }

  async function executar(acao: () => Promise<void>) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setOcupado(true);
    setErro("");
    try { await acao(); } catch (falha) { setErro(erroNutricional(falha)); }
    finally { ocupadoRef.current = false; setOcupado(false); }
  }

  async function alterarFavorito(alimento: AlimentoNutricao) {
    await executar(async () => {
      const favoritos = preferencias.favoritos.includes(alimento.id)
        ? preferencias.favoritos.filter((id) => id !== alimento.id)
        : [...preferencias.favoritos, alimento.id];
      await onPreferencias({ ...preferencias, favoritos });
    });
  }

  const numeroQuantidade = numeroNutricional(quantidade);
  const gramas = numeroQuantidade !== null && escolhido ? numeroQuantidade * (unidade === "g" ? 1 : escolhido.baseGramas) : null;
  let previa: Nutrientes | null = null;
  if (escolhido && gramas !== null && gramas > 0 && gramas <= 10000) {
    try {
      previa = nutrientesItem({ id: itemId, alimentoId: escolhido.id, nome: escolhido.nome, marca: escolhido.marca, preparo: escolhido.preparo, fonte: escolhido.fonte, gramas, baseGramas: escolhido.baseGramas, nutrientesBase: escolhido.nutrientes, consumido });
    } catch { /* A validação ao salvar explica referências antigas incompletas. */ }
  }

  async function confirmarItem() {
    await executar(async () => {
      if (!escolhido || gramas === null || !Number.isFinite(gramas) || gramas <= 0 || gramas > 10000)
        throw new Error("Informe uma quantidade maior que zero e até 10.000 g.");
      validarAlimento(escolhido);
      const alimentoId = inicial?.alimentoId === null && escolhido.id === inicial.id ? null : escolhido.id;
      const item: ItemRefeicao = {
        id: itemId,
        alimentoId,
        nome: escolhido.nome,
        marca: escolhido.marca,
        preparo: escolhido.preparo,
        fonte: escolhido.fonte,
        gramas: Math.round(gramas * 1000) / 1000,
        baseGramas: escolhido.baseGramas,
        nutrientesBase: { ...escolhido.nutrientes },
        consumido: modo === "dia" && consumido,
      };
      await onSalvar(item);
      if (alimentoId) {
        const recentes = [alimentoId, ...preferencias.recentes.filter((id) => id !== alimentoId)].slice(0, 50);
        // A conveniência dos recentes não pode repetir um alimento já gravado se falhar.
        void onPreferencias({ ...preferencias, recentes }).catch(() => {});
      }
      onFechar();
    });
  }

  async function salvarCadastro() {
    await executar(async () => {
      const valores = [cadastro.base, cadastro.kcal, cadastro.proteinas, cadastro.carboidratos, cadastro.gorduras].map(numeroNutricional);
      if (valores.some((valor) => valor === null)) throw new Error("Preencha o peso da referência e todos os nutrientes. Informe 0 quando o rótulo indicar zero.");
      const [base, kcal, proteinas, carboidratos, gorduras] = valores as number[];
      if (!cadastro.fonte.trim()) throw new Error("Informe a origem dos valores nutricionais.");
      const alimento: AlimentoNutricao = { id: alimentoIdManual, usuarioId, nome: cadastro.nome.trim(), marca: cadastro.marca.trim(), preparo: cadastro.preparo.trim(), fonte: cadastro.fonte.trim(), baseGramas: base, porcaoNome: cadastro.porcao.trim() || `${numeroNutricao(base)} g`, nutrientes: { kcal, proteinas, carboidratos, gorduras } };
      validarAlimento(alimento);
      await salvarAlimentoNutricao(alimento);
      setConhecidosExtras((anteriores) => [...anteriores.filter((a) => a.id !== alimento.id), alimento]);
      onAlimentoSalvo?.(alimento);
      selecionarAlimento(alimento);
    });
  }

  return <Modal transparent visible animationType="fade" onRequestClose={voltar}>
    <View style={n.fundoModal}>
      <View style={n.modal}>
        <View style={n.cabecalhoModal}>
          <Text style={[n.titulo, n.crescer]}>{fase === "cadastro" ? "Cadastrar alimento" : fase === "quantidade" ? "Quantidade e consumo" : inicial ? "Substituir alimento" : "Adicionar alimento"}</Text>
          <BotaoNutricional texto="Fechar" cor={corTema} desabilitado={ocupado} onPress={() => { if (!ocupadoRef.current) onFechar(); }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={n.corpoModal}>
          {erro ? <Text accessibilityRole="alert" style={n.erro}>{erro}</Text> : null}
          {fase === "catalogo" && <>
            <View style={n.linha}>{([['catalogo', 'Pesquisar'], ['recentes', 'Recentes'], ['favoritos', 'Favoritos']] as const).map(([valor, rotulo]) => <BotaoNutricional key={valor} texto={rotulo} cor={corTema} primario={aba === valor} desabilitado={ocupado} onPress={() => { setAba(valor); setPagina(0); setCarregando(false); }} />)}</View>
            {aba === "catalogo" && <CampoNutricional rotulo="Pesquisar alimento ou marca" value={busca} onChangeText={(valor) => { setBusca(valor); setPagina(0); setResultados([]); setTemMais(false); }} placeholder="Ex.: arroz cozido" autoCapitalize="none" />}
            <BotaoNutricional texto="+ Cadastrar alimento pelo rótulo" cor={corTema} desabilitado={ocupado} onPress={abrirCadastro} />
            {erroBusca ? <Text style={n.erro}>{erroBusca}</Text> : null}
            {aba === "catalogo" && carregando && pagina === 0 ? <ActivityIndicator color={corTema} /> : null}
            {!carregando && alimentosExibidos.length === 0 ? <Text style={n.secundario}>{aba === "favoritos" ? "Seus favoritos aparecerão aqui. Toque na estrela ao lado de um alimento." : aba === "recentes" ? "Seus alimentos usados recentemente aparecerão aqui." : "Nenhum alimento encontrado. Você pode cadastrar os dados da embalagem."}</Text> : null}
            {alimentosExibidos.map((alimento) => <View key={alimento.id} style={n.cartao}>
              <View style={n.linha}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Escolher ${alimento.nome}`} onPress={() => selecionarAlimento(alimento)} disabled={ocupado} style={n.crescer}>
                  <Text style={n.subtitulo}>{alimento.nome}</Text>
                  {alimento.marca || alimento.preparo ? <Text style={n.secundario}>{[alimento.marca, alimento.preparo].filter(Boolean).join(" · ")}</Text> : null}
                  <Text style={n.texto}>{numeroNutricao(alimento.nutrientes.kcal, 0)} kcal por {numeroNutricao(alimento.baseGramas)} g</Text>
                  <Text style={n.secundario}>P {numeroNutricao(alimento.nutrientes.proteinas)} g · C {numeroNutricao(alimento.nutrientes.carboidratos)} g · G {numeroNutricao(alimento.nutrientes.gorduras)} g</Text>
                </TouchableOpacity>
                <BotaoNutricional texto={preferencias.favoritos.includes(alimento.id) ? "★" : "☆"} rotulo={`${preferencias.favoritos.includes(alimento.id) ? "Remover" : "Adicionar"} ${alimento.nome} ${preferencias.favoritos.includes(alimento.id) ? "dos" : "aos"} favoritos`} cor={corTema} pequeno desabilitado={ocupado} onPress={() => void alterarFavorito(alimento)} />
              </View>
              <Text style={n.secundario}>Fonte: {alimento.fonte}</Text>
            </View>)}
            {aba === "catalogo" && temMais && <BotaoNutricional texto="Carregar mais alimentos" cor={corTema} carregando={carregando} onPress={() => setPagina((atual) => atual + 1)} />}
          </>}
          {fase === "quantidade" && escolhido && <>
            <Text style={n.titulo}>{escolhido.nome}</Text>
            {escolhido.marca || escolhido.preparo ? <Text style={n.secundario}>{[escolhido.marca, escolhido.preparo].filter(Boolean).join(" · ")}</Text> : null}
            <Text style={n.secundario}>Fonte: {escolhido.fonte}. Referência de {numeroNutricao(escolhido.baseGramas)} g.</Text>
            <BotaoNutricional texto="Trocar alimento" cor={corTema} desabilitado={ocupado} onPress={() => { setFase("catalogo"); setErro(""); }} />
            <View style={n.linha}>
              <BotaoNutricional texto="Gramas" cor={corTema} primario={unidade === "g"} desabilitado={ocupado} onPress={() => { if (unidade !== "g") { setQuantidade(gramas !== null ? String(gramas).replace(".", ",") : ""); setUnidade("g"); } }} />
              <BotaoNutricional texto="Porções" cor={corTema} primario={unidade === "porcao"} desabilitado={ocupado} onPress={() => { if (unidade !== "porcao") { setQuantidade(gramas !== null ? String(Math.round(gramas / escolhido.baseGramas * 1000) / 1000).replace(".", ",") : ""); setUnidade("porcao"); } }} />
            </View>
            <CampoNutricional rotulo={unidade === "g" ? "Quantidade em gramas" : `Quantidade de porções (${escolhido.porcaoNome || `${numeroNutricao(escolhido.baseGramas)} g`})`} value={quantidade} onChangeText={setQuantidade} keyboardType="decimal-pad" editable={!ocupado} maxLength={12} />
            {unidade === "porcao" && <Text style={n.secundario}>Uma porção = {numeroNutricao(escolhido.baseGramas)} g. Total: {gramas === null ? "—" : `${numeroNutricao(gramas)} g`}.</Text>}
            {previa && <View style={n.cartao}>
              <Text style={n.subtitulo}>{numeroNutricao(previa.kcal, 0)} kcal nesta quantidade</Text>
              <Text style={n.texto}>Proteínas: {numeroNutricao(previa.proteinas)} g</Text>
              <Text style={n.texto}>Carboidratos: {numeroNutricao(previa.carboidratos)} g</Text>
              <Text style={n.texto}>Gorduras: {numeroNutricao(previa.gorduras)} g</Text>
            </View>}
            {modo === "dia" && <View style={n.pilha}>
              <Text style={n.rotulo}>Este alimento já foi consumido?</Text>
              <View style={n.linha}>
                <BotaoNutricional texto="Ainda é planejado" cor={corTema} primario={!consumido} desabilitado={ocupado} onPress={() => setConsumido(false)} />
                <BotaoNutricional texto="Sim, consumi" cor={corTema} primario={consumido} desabilitado={ocupado} onPress={() => setConsumido(true)} />
              </View>
            </View>}
            {modo === "modelo" && <Text style={n.secundario}>Este alimento será salvo como planejado na dieta. O consumo será confirmado em cada dia.</Text>}
            {modo === "planejamento" && <Text style={n.secundario}>Este alimento ficará planejado somente neste dia. Confirme o consumo quando a data chegar.</Text>}
            <BotaoNutricional texto={inicial ? "Salvar alterações" : modo === "dia" && consumido ? "Registrar alimento consumido" : "Adicionar alimento planejado"} cor={corTema} primario carregando={ocupado} onPress={() => void confirmarItem()} />
            {inicial && onRemover && <BotaoNutricional texto={modo === "modelo" ? "Remover deste modelo" : "Remover deste dia"} cor={corTema} perigo desabilitado={ocupado} onPress={() => void executar(async () => {
              if (!await confirmarNutricao("Remover alimento?", `Remover ${inicial.nome} ${modo === "modelo" ? "deste modelo" : "somente deste dia"}?`)) return;
              await onRemover();
              onFechar();
            })} />}
          </>}
          {fase === "cadastro" && <>
            <Text style={n.secundario}>Copie os valores da embalagem ou de uma fonte confiável. Informe todos os nutrientes para a mesma quantidade de referência.</Text>
            {([
              ["nome", "Nome do alimento", false], ["marca", "Marca (opcional)", false], ["preparo", "Preparo: cru, cozido etc. (opcional)", false],
              ["fonte", "Origem dos valores nutricionais", false], ["base", "Peso da referência em gramas", true], ["porcao", "Nome da porção (ex.: 1 fatia de 30 g)", false],
              ["kcal", "Calorias da referência (kcal)", true], ["proteinas", "Proteínas da referência (g)", true], ["carboidratos", "Carboidratos da referência (g)", true], ["gorduras", "Gorduras da referência (g)", true],
            ] as const).map(([chave, rotulo, numerico]) => <CampoNutricional key={chave} rotulo={rotulo} value={cadastro[chave]} onChangeText={(valor) => setCadastro((atual) => ({ ...atual, [chave]: valor, ...(chave === "base" && atual.porcao === `${atual.base} g` ? { porcao: `${valor} g` } : {}) }))} keyboardType={numerico ? "decimal-pad" : "default"} maxLength={numerico ? 12 : chave === "fonte" ? 500 : 150} editable={!ocupado} />)}
            <BotaoNutricional texto="Salvar alimento e informar quantidade" cor={corTema} primario carregando={ocupado} onPress={() => void salvarCadastro()} />
            <BotaoNutricional texto="Voltar ao catálogo" cor={corTema} desabilitado={ocupado} onPress={() => { setFase("catalogo"); setErro(""); }} />
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
