import React, { useRef, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { AlimentoNutricao, ItemRefeicao, PreferenciasNutricao, RefeicaoNutricao } from "../../servicos/nutricaoTipos";
import { novoIdNutricao, nutrientesItem, somarNutrientes } from "../../servicos/nutricaoCalculos";
import { useVoltarDoModal } from "../../servicos/voltarModal";
import SeletorAlimentoNutricao from "./SeletorAlimentoNutricao";
import { BotaoNutricional, CampoNutricional, confirmarNutricao, erroNutricional, n, numeroNutricao } from "./nutricaoUI";

export type EditorRefeicoesNutricaoProps = {
  usuarioId: string;
  refeicoes: RefeicaoNutricao[];
  onAlterar: (refeicoes: RefeicaoNutricao[]) => Promise<void>;
  modo: "dia" | "modelo" | "planejamento";
  corTema: string;
  bloqueado?: boolean;
  preferencias: PreferenciasNutricao;
  onPreferencias: (preferencias: PreferenciasNutricao) => Promise<void>;
  alimentosLocais: AlimentoNutricao[];
  onAlimentoSalvo?: (alimento: AlimentoNutricao) => void;
  onRegistrarRefeicao?: (refeicaoId: string) => Promise<void>;
};

function trocar<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return lista;
  const nova = [...lista];
  [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
  return nova;
}

export default function EditorRefeicoesNutricao({ usuarioId, refeicoes, onAlterar, modo, corTema, bloqueado = false, preferencias, onPreferencias, alimentosLocais, onAlimentoSalvo, onRegistrarRefeicao }: EditorRefeicoesNutricaoProps) {
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [erro, setErro] = useState("");
  const [editorRefeicao, setEditorRefeicao] = useState<{ id: string; novo: boolean; nome: string; horario: string } | null>(null);
  const [seletor, setSeletor] = useState<{ refeicaoId: string; item?: ItemRefeicao } | null>(null);
  const desabilitado = bloqueado || salvando;
  useVoltarDoModal(Boolean(editorRefeicao), () => { if (!salvandoRef.current) setEditorRefeicao(null); });

  async function aplicar(alterar: (atuais: RefeicaoNutricao[]) => RefeicaoNutricao[]) {
    if (bloqueado || salvandoRef.current) throw new Error("Aguarde a gravação em andamento.");
    salvandoRef.current = true;
    setSalvando(true);
    setErro("");
    try {
      const atualizadas = alterar(refeicoes);
      await onAlterar(modo !== "dia"
        ? atualizadas.map((refeicao) => ({ ...refeicao, itens: refeicao.itens.map((item) => ({ ...item, consumido: false })) }))
        : atualizadas);
    }
    finally { salvandoRef.current = false; setSalvando(false); }
  }

  async function acao(alterar: (atuais: RefeicaoNutricao[]) => RefeicaoNutricao[]) {
    try { await aplicar(alterar); } catch (falha) { setErro(erroNutricional(falha)); }
  }

  async function salvarRefeicao() {
    const editor = editorRefeicao;
    if (!editor) return;
    const nome = editor.nome.trim();
    const horario = editor.horario.trim();
    if (!nome || nome.length > 100) { setErro("Informe um nome de até 100 caracteres para a refeição."); return; }
    if (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) { setErro("Informe o horário no formato HH:MM ou deixe em branco."); return; }
    try {
      await aplicar((atuais) => {
        if (editor.novo && !atuais.some((refeicao) => refeicao.id === editor.id)) return [...atuais, { id: editor.id, nome, horario, itens: [] }];
        if (!atuais.some((refeicao) => refeicao.id === editor.id)) throw new Error("Esta refeição mudou. Feche o editor e abra novamente.");
        return atuais.map((refeicao) => refeicao.id === editor.id ? { ...refeicao, nome, horario } : refeicao);
      });
      setEditorRefeicao(null);
    } catch (falha) { setErro(erroNutricional(falha)); }
  }

  async function removerRefeicao() {
    const editor = editorRefeicao;
    if (!editor || editor.novo) return;
    if (!await confirmarNutricao("Remover refeição?", `Remover ${editor.nome} e seus alimentos ${modo === "modelo" ? "deste modelo" : "somente deste dia"}?`)) return;
    try {
      await aplicar((atuais) => atuais.filter((refeicao) => refeicao.id !== editor.id));
      setEditorRefeicao(null);
    } catch (falha) { setErro(erroNutricional(falha)); }
  }

  async function salvarItem(item: ItemRefeicao) {
    const alvo = seletor;
    if (!alvo) throw new Error("Abra novamente o alimento para continuar.");
    await aplicar((atuais) => {
      if (!atuais.some((refeicao) => refeicao.id === alvo.refeicaoId)) throw new Error("A refeição não está mais disponível. Feche e selecione outra refeição.");
      return atuais.map((refeicao) => refeicao.id !== alvo.refeicaoId ? refeicao : {
        ...refeicao,
        itens: refeicao.itens.some((atual) => atual.id === item.id)
          ? refeicao.itens.map((atual) => atual.id === item.id ? item : atual)
          : [...refeicao.itens, item],
      });
    });
  }

  async function registrarRefeicao(refeicaoId: string) {
    if (!onRegistrarRefeicao || bloqueado || salvandoRef.current) return;
    salvandoRef.current = true; setSalvando(true); setErro("");
    try { await onRegistrarRefeicao(refeicaoId); }
    catch (falha) { setErro(erroNutricional(falha)); }
    finally { salvandoRef.current = false; setSalvando(false); }
  }

  const previsto = somarNutrientes(refeicoes, false);
  const consumido = somarNutrientes(refeicoes, true);

  return <View style={n.pilha}>
    <View style={n.cartao}>
      <Text style={n.subtitulo}>{modo === "modelo" ? "Total planejado da dieta" : "Refeições deste dia"}</Text>
      <Text style={n.texto}>Previsto: {numeroNutricao(previsto.kcal, 0)} kcal · P {numeroNutricao(previsto.proteinas)} g · C {numeroNutricao(previsto.carboidratos)} g · G {numeroNutricao(previsto.gorduras)} g</Text>
      {modo === "dia" && <>
        <Text style={[n.texto, { color: corTema }]}>Confirmado: {numeroNutricao(consumido.kcal, 0)} kcal · P {numeroNutricao(consumido.proteinas)} g · C {numeroNutricao(consumido.carboidratos)} g · G {numeroNutricao(consumido.gorduras)} g</Text>
        <Text style={n.secundario}>Ajuste o que comeu diferente e confirme os alimentos consumidos. As mudanças valem somente para este dia.</Text>
      </>}
      {modo === "modelo" && <Text style={n.secundario}>Este é o planejamento. Cada dia receberá uma cópia independente, com consumo a confirmar.</Text>}
      {modo === "planejamento" && <Text style={n.secundario}>Planejamento somente deste dia. Ajuste as refeições e confirme o consumo quando a data chegar; sua dieta padrão permanece preservada.</Text>}
      {modo === "modelo" && <Text style={n.secundario}>{onRegistrarRefeicao ? "Registrar uma refeição copia a versão salva para o dia selecionado. Salve as alterações da dieta antes de registrar." : "Salve a dieta para poder registrar suas refeições no diário."}</Text>}
    </View>
    {erro && !editorRefeicao ? <Text accessibilityRole="alert" style={n.erro}>{erro}</Text> : null}
    {salvando ? <View style={n.linha}><ActivityIndicator color={corTema} /><Text style={n.secundario}>Guardando alteração...</Text></View> : null}
    {refeicoes.map((refeicao, indiceRefeicao) => {
      const totalRefeicao = somarNutrientes([refeicao], false);
      const totalConsumido = somarNutrientes([refeicao], true);
      const todosConfirmados = refeicao.itens.length > 0 && refeicao.itens.every((item) => item.consumido);
      return <View key={refeicao.id} style={n.cartao}>
        <View style={n.linha}>
          <View style={n.crescer}><Text style={n.titulo}>{refeicao.nome}</Text>{refeicao.horario ? <Text style={n.secundario}>{refeicao.horario}</Text> : null}</View>
          <BotaoNutricional texto="↑" rotulo={`Mover ${refeicao.nome} para cima`} cor={corTema} pequeno desabilitado={desabilitado || indiceRefeicao === 0} onPress={() => void acao((atuais) => trocar(atuais, indiceRefeicao, -1))} />
          <BotaoNutricional texto="↓" rotulo={`Mover ${refeicao.nome} para baixo`} cor={corTema} pequeno desabilitado={desabilitado || indiceRefeicao === refeicoes.length - 1} onPress={() => void acao((atuais) => trocar(atuais, indiceRefeicao, 1))} />
          <BotaoNutricional texto="Editar" rotulo={`Editar refeição ${refeicao.nome}`} cor={corTema} desabilitado={desabilitado} onPress={() => { setErro(""); setEditorRefeicao({ id: refeicao.id, novo: false, nome: refeicao.nome, horario: refeicao.horario }); }} />
        </View>
        <Text style={n.secundario}>Previsto {numeroNutricao(totalRefeicao.kcal, 0)} kcal{modo === "dia" ? ` · Confirmado ${numeroNutricao(totalConsumido.kcal, 0)} kcal` : ""}</Text>
        {refeicao.itens.length === 0 && <Text style={n.secundario}>Adicione os alimentos desta refeição.</Text>}
        {refeicao.itens.map((item, indiceItem) => {
          const nutrientes = nutrientesItem(item);
          return <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: "#303B33", paddingTop: 12, gap: 8 }}>
            <View style={n.linha}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editar ${item.nome}`} disabled={desabilitado} onPress={() => setSeletor({ refeicaoId: refeicao.id, item })} style={n.crescer}>
                <Text style={n.subtitulo}>{indiceItem + 1}.{item.nome}</Text>
                <Text style={n.texto}>{numeroNutricao(item.gramas)} g · {numeroNutricao(nutrientes.kcal, 0)} kcal</Text>
                {item.marca || item.preparo ? <Text style={n.secundario}>{[item.marca, item.preparo].filter(Boolean).join(" · ")}</Text> : null}
                <Text style={n.secundario}>P {numeroNutricao(nutrientes.proteinas)} g · C {numeroNutricao(nutrientes.carboidratos)} g · G {numeroNutricao(nutrientes.gorduras)} g</Text>
              </TouchableOpacity>
              {modo === "dia" && <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`Confirmar consumo de ${item.nome}`} accessibilityState={{ checked: item.consumido, disabled: desabilitado }} disabled={desabilitado}
                onPress={() => void acao((atuais) => atuais.map((atual) => atual.id !== refeicao.id ? atual : { ...atual, itens: atual.itens.map((alimento) => alimento.id === item.id ? { ...alimento, consumido: !alimento.consumido } : alimento) }))}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 8 }}>
                <View style={{ width: 24, height: 24, borderWidth: 2, borderColor: corTema, borderRadius: 5, backgroundColor: item.consumido ? corTema : "transparent", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#101312", fontWeight: "900" }}>{item.consumido ? "✓" : ""}</Text></View>
                <Text style={[n.secundario, item.consumido && { color: corTema }]}>{item.consumido ? "Consumido" : "Planejado"}</Text>
              </TouchableOpacity>}
            </View>
            <View style={n.linha}>
              <BotaoNutricional texto="Editar quantidade / trocar" cor={corTema} desabilitado={desabilitado} onPress={() => setSeletor({ refeicaoId: refeicao.id, item })} />
              <BotaoNutricional texto="↑" rotulo={`Mover ${item.nome} para cima nesta refeição`} cor={corTema} pequeno desabilitado={desabilitado || indiceItem === 0} onPress={() => void acao((atuais) => atuais.map((atual) => atual.id !== refeicao.id ? atual : { ...atual, itens: trocar(atual.itens, indiceItem, -1) }))} />
              <BotaoNutricional texto="↓" rotulo={`Mover ${item.nome} para baixo nesta refeição`} cor={corTema} pequeno desabilitado={desabilitado || indiceItem === refeicao.itens.length - 1} onPress={() => void acao((atuais) => atuais.map((atual) => atual.id !== refeicao.id ? atual : { ...atual, itens: trocar(atual.itens, indiceItem, 1) }))} />
            </View>
          </View>;
        })}
        <BotaoNutricional texto="+ Adicionar alimento" rotulo={`Adicionar alimento em ${refeicao.nome}`} cor={corTema} desabilitado={desabilitado} onPress={() => setSeletor({ refeicaoId: refeicao.id })} />
        {modo === "modelo" && <BotaoNutricional texto="Registrar esta refeição" rotulo={`Registrar refeição ${refeicao.nome} no diário`} cor={corTema} desabilitado={desabilitado || !onRegistrarRefeicao || refeicao.itens.length === 0} onPress={() => void registrarRefeicao(refeicao.id)} />}
        {modo === "dia" && refeicao.itens.length > 0 && <BotaoNutricional texto={todosConfirmados ? "Refeição confirmada" : "Comi esta refeição como planejado"} cor={corTema} primario={!todosConfirmados} desabilitado={desabilitado || todosConfirmados} onPress={() => void acao((atuais) => atuais.map((atual) => atual.id !== refeicao.id ? atual : { ...atual, itens: atual.itens.map((item) => ({ ...item, consumido: true })) }))} />}
      </View>;
    })}
    <BotaoNutricional texto="+ Adicionar refeição" cor={corTema} desabilitado={desabilitado} onPress={() => { setErro(""); setEditorRefeicao({ id: novoIdNutricao(), novo: true, nome: "", horario: "" }); }} />

    {editorRefeicao && <Modal transparent visible animationType="fade" onRequestClose={() => { if (!salvandoRef.current) setEditorRefeicao(null); }}>
      <View style={n.fundoModal}><View style={n.modal}>
        <View style={n.cabecalhoModal}><Text style={[n.titulo, n.crescer]}>{editorRefeicao.novo ? "Adicionar refeição" : "Editar refeição"}</Text><BotaoNutricional texto="Fechar" cor={corTema} desabilitado={salvando} onPress={() => { if (!salvandoRef.current) setEditorRefeicao(null); }} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={n.corpoModal}>
          {erro ? <Text accessibilityRole="alert" style={n.erro}>{erro}</Text> : null}
          <CampoNutricional rotulo="Nome da refeição" value={editorRefeicao.nome} onChangeText={(nome) => setEditorRefeicao((atual) => atual ? { ...atual, nome } : atual)} placeholder="Ex.: Café da manhã" maxLength={100} editable={!salvando} />
          <CampoNutricional rotulo="Horário opcional (HH:MM)" value={editorRefeicao.horario} onChangeText={(horario) => setEditorRefeicao((atual) => atual ? { ...atual, horario } : atual)} placeholder="Ex.: 08:00" maxLength={5} editable={!salvando} />
          <BotaoNutricional texto="Salvar refeição" cor={corTema} primario carregando={salvando} onPress={() => void salvarRefeicao()} />
          {!editorRefeicao.novo && <BotaoNutricional texto={modo === "modelo" ? "Remover refeição deste modelo" : "Remover refeição somente deste dia"} cor={corTema} perigo desabilitado={salvando} onPress={() => void removerRefeicao()} />}
        </ScrollView>
      </View></View>
    </Modal>}
    {seletor && <SeletorAlimentoNutricao usuarioId={usuarioId} inicial={seletor.item} modo={modo} corTema={corTema} preferencias={preferencias} alimentosLocais={alimentosLocais} onPreferencias={onPreferencias} onAlimentoSalvo={onAlimentoSalvo} onSalvar={salvarItem} onFechar={() => setSeletor(null)} onRemover={seletor.item ? async () => {
      const alvo = seletor;
      await aplicar((atuais) => atuais.map((refeicao) => refeicao.id !== alvo.refeicaoId ? refeicao : { ...refeicao, itens: refeicao.itens.filter((item) => item.id !== alvo.item?.id) }));
    } : undefined} />}
  </View>;
}
