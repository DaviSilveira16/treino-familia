import React, { useRef, useState } from "react";
import { Switch, Text, View } from "react-native";
import type { ConfiguracaoNutricional, PerfilNutricional } from "../../servicos/nutricaoTipos";
import { calcularGastoRepouso } from "../../servicos/metabolismo";
import { novoIdNutricao, numeroNutricional, deslocarDia } from "../../servicos/nutricaoCalculos";
import { BotaoNutricao, CampoNutricao, estilosNutricao as e, numeroKcal } from "./NutricaoBase";
import { erroNutricional } from "./nutricaoUI";
import { dataBrasileiraParaIso, dataIsoParaBrasileira, mascararDataBrasileira } from "../../servicos/datas";

type Props = { usuarioId: string; hoje: string; perfil: PerfilNutricional | null; atual: ConfiguracaoNutricional | null; cor: string; onSalvar: (config: ConfiguracaoNutricional) => Promise<void>; onAbrirPerfil: () => void };
export default function MetasNutricao({ usuarioId, hoje, perfil, atual, cor, onSalvar, onAbrirPerfil }: Props) {
  const [vigencia, setVigencia] = useState(dataIsoParaBrasileira(hoje));
  const [objetivo, setObjetivo] = useState<ConfiguracaoNutricional["objetivo"]>(atual?.objetivo ?? "manter");
  const [meta, setMeta] = useState(String(atual?.metaKcal ?? ""));
  const [proteinas, setProteinas] = useState(String(atual?.metaProteinas ?? ""));
  const [carboidratos, setCarboidratos] = useState(String(atual?.metaCarboidratos ?? ""));
  const [gorduras, setGorduras] = useState(String(atual?.metaGorduras ?? ""));
  const [fator, setFator] = useState(String(atual?.fatorRotina ?? 1.2));
  const [base, setBase] = useState(String(atual?.baseDiariaKcal ?? ""));
  const [tolerancia, setTolerancia] = useState(String(atual?.toleranciaKcal ?? 100));
  const [restricao, setRestricao] = useState(atual?.restricaoAutomatica ?? false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [configuracaoId] = useState(novoIdNutricao);
  const [criadoEm] = useState(() => new Date().toISOString());
  const repouso = calcularGastoRepouso(perfil);
  const fatorNumero = numeroNutricional(fator);
  const estimativaBase = repouso !== null && fatorNumero !== null && fatorNumero >= 1 && fatorNumero <= 2.5 ? Math.round(repouso * fatorNumero) : null;
  const sugestaoPermitida = perfil !== null && repouso !== null && !restricao;
  async function salvar() {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    setErro("");
    try {
      const data = dataBrasileiraParaIso(vigencia);
      if (!data || deslocarDia(data, 0) !== data || data < hoje) throw new Error("Escolha uma data válida a partir de hoje, no formato DD/MM/AAAA. Os dias anteriores manterão suas configurações.");
      const opcional = (texto: string, nome: string, limite: number) => {
        if (!texto.trim()) return null;
        const valor = numeroNutricional(texto);
        if (valor === null || valor < 0 || valor > limite) throw new Error(`Confira ${nome}.`);
        return valor;
      };
      const metaKcal = opcional(meta, "a meta de calorias", 20000);
      if (metaKcal !== null && metaKcal <= 0) throw new Error("A meta de calorias deve ser maior que zero.");
      const baseDiariaKcal = opcional(base, "o gasto base", 20000);
      if (baseDiariaKcal !== null && baseDiariaKcal <= 0) throw new Error("O gasto base deve ser maior que zero.");
      if (fatorNumero === null || fatorNumero < 1 || fatorNumero > 2.5) throw new Error("Use um fator de rotina entre 1 e 2,5.");
      const faixa = opcional(tolerancia, "a faixa de manutenção", 1000);
      await onSalvar({ id: configuracaoId, usuarioId, vigenteDesde: data, objetivo, metaKcal, metaProteinas: opcional(proteinas, "as proteínas", 2000), metaCarboidratos: opcional(carboidratos, "os carboidratos", 3000), metaGorduras: opcional(gorduras, "as gorduras", 2000), perfil, repousoKcal: repouso, fatorRotina: fatorNumero, baseDiariaKcal, toleranciaKcal: faixa ?? 100, restricaoAutomatica: restricao, metodo: "repouso-rotina-v1", criadoEm });
    } catch (falha) { setErro(erroNutricional(falha)); }
    finally { salvandoRef.current = false; setSalvando(false); }
  }
  return <>
    <Text style={e.texto}>Suas metas são editáveis. O gasto base representa a rotina sem os treinos registrados; as calorias ativas das sessões são somadas na análise.</Text>
    <View style={e.card}><Text style={e.titulo}>Dados do perfil</Text><Text style={e.texto}>{perfil ? `${perfil.pesoKg} kg · ${perfil.alturaCm} cm · ${perfil.idade} anos · ${perfil.sexo}` : "Preencha peso, altura, idade e sexo no perfil para estimar o gasto em repouso."}</Text><Text style={e.texto}>Gasto estimado em repouso: {repouso === null ? "indisponível" : `${numeroKcal(repouso)} kcal/dia`}</Text><BotaoNutricao titulo="Revisar meu perfil" onPress={onAbrirPerfil} disabled={salvando} cor={cor} /></View>
    <CampoNutricao titulo="Aplicar a partir de (DD/MM/AAAA)" valor={vigencia} onChange={(valor) => setVigencia(mascararDataBrasileira(valor))} />
    <Text style={e.texto}>Objetivo</Text><View style={e.linha}>{([ ["manter", "Manutenção"], ["perder", "Perda de peso"], ["ganhar", "Ganho de peso"] ] as const).map(([valor, rotulo]) => <BotaoNutricao key={valor} titulo={rotulo} primario={objetivo === valor} onPress={() => setObjetivo(valor)} cor={cor} />)}</View>
    <CampoNutricao titulo="Meta alimentar (kcal/dia)" valor={meta} onChange={setMeta} numerico />
    <View style={e.linha}><CampoNutricao titulo="Proteínas (g) — opcional" valor={proteinas} onChange={setProteinas} numerico /><CampoNutricao titulo="Carboidratos (g) — opcional" valor={carboidratos} onChange={setCarboidratos} numerico /><CampoNutricao titulo="Gorduras (g) — opcional" valor={gorduras} onChange={setGorduras} numerico /></View>
    <View style={e.card}><Text style={e.titulo}>Rotina fora dos treinos</Text><CampoNutricao titulo="Fator de rotina sem treino" valor={fator} onChange={setFator} numerico /><Text style={e.pequeno}>Referências aproximadas para entender o fator:</Text><Text style={e.pequeno}>1,2 · muito pouco movimento no dia, quase sempre sentado ou deitado.</Text><Text style={e.pequeno}>1,4 · rotina principalmente sentada, com alguns deslocamentos e tarefas leves.</Text><Text style={e.pequeno}>1,6–1,7 · bastante movimento cotidiano, caminhadas ou tarefas frequentes em pé.</Text><Text style={e.pequeno}>1,8–1,9 · muitas horas em pé e deslocamentos substanciais ao longo do dia.</Text><Text style={e.pequeno}>2,0–2,4 · trabalho ou rotina diária fisicamente muito exigente.</Text><Text style={e.pequeno}>São faixas gerais de estimativa, não medidas individuais. Escolha pela sua rotina habitual e deixe fora musculação e cardio já registrados: o app soma essas sessões separadamente. Os níveis de atividade são referências amplas descritas nas Dietary Reference Intakes (National Academies, 2023).</Text><View style={e.linha}><Text style={[e.texto, { flex: 1 }]}>Preciso de orientação individual (menor de idade, gestação, amamentação ou outra condição).</Text><Switch value={restricao} onValueChange={setRestricao} trackColor={{ true: cor }} /></View><BotaoNutricao titulo={estimativaBase === null ? "Estimar gasto base" : `Usar estimativa base de ${numeroKcal(estimativaBase)} kcal`} disabled={!sugestaoPermitida || estimativaBase === null} onPress={() => setBase(String(estimativaBase))} cor={cor} /><CampoNutricao titulo="Gasto diário base sem treinos (kcal)" valor={base} onChange={setBase} numerico /><BotaoNutricao titulo="Copiar base como meta de manutenção" disabled={!sugestaoPermitida || !base.trim()} onPress={() => { setMeta(base); setObjetivo("manter"); }} cor={cor} /><Text style={e.pequeno}>A meta de perda ou ganho deve ser informada por você ou pelo profissional que acompanha sua alimentação. O app mantém a meta alimentar fixa ao registrar exercícios.</Text></View>
    <CampoNutricao titulo="Faixa próxima da manutenção (± kcal/dia)" valor={tolerancia} onChange={setTolerancia} numerico /><Text style={e.pequeno}>Essa faixa organiza a apresentação do saldo. Ela não expressa a precisão do cálculo.</Text>
    {erro ? <Text accessibilityRole="alert" style={{ color: "#FFAD9B" }}>{erro}</Text> : null}<BotaoNutricao titulo={salvando ? "Guardando metas…" : "Salvar metas"} onPress={() => void salvar()} disabled={salvando} primario cor={cor} />
  </>;
}
