import React, { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TreinoDoDia from "./TreinoDoDia";
import ResumoSemanal from "./ResumoSemanal";
import PreferenciasPainel, { preferenciasIniciais, type Preferencias } from "../componentes/PreferenciasPainel";
import { chaveDiaPainel } from "../servicos/painelSemanal";
import { supabase } from "../supabase";
import { medir } from "../servicos/performance";

const COR_PADRAO = "#35D07F";

const telas = [
  {
    id: "treinos",
    titulo: "Meus treinos",
    descricao: "Acesse seus treinos e exercícios",
    emoji: "🏋️",
  },
  {
    id: "cardios",
    titulo: "Meus Cardios",
    descricao: "Cadastre e acompanhe seus cardios",
    emoji: "🏃",
  },
  {
    id: "evolucao",
    titulo: "Evolução física",
    descricao: "Acompanhe seu peso e suas medidas",
    emoji: "📈",
  },
  {
    id: "evolucaoTreinos",
    titulo: "Evolução dos treinos",
    descricao: "Compare cargas, repetições e volume por exercício",
    emoji: "📊",
  },
  {
    id: "historico",
    titulo: "Histórico",
    descricao: "Consulte seus treinos anteriores",
    emoji: "📋",
  },
  {
    id: "frequencia",
    titulo: "Frequência",
    descricao: "Veja sua frequência de treinamento",
    emoji: "📅",
  },
] as const;

type Props = {
  usuarioId: string;
  nomeUsuario: string;
  fotoUrl: string | null;
  corTema: string;
  onSair: () => void;
  onNavegar: (rota: (typeof telas)[number]["id"] | "perfil" | "comunidade") => void;
  onAbrirTreino: (plano: { planId: string; planName: string }) => void;
};

type Indicadores = { carga: { exercicio: string; serie: number; atual: number; anterior: number } | null };
type Aviso = { id: string; texto: string; rota: "comunidade" | "evolucao" };

export default function PainelInicial({ usuarioId, nomeUsuario, fotoUrl, corTema, onSair, onNavegar, onAbrirTreino }: Props) {
  const chave = `@treino-familia:painel:v1:${usuarioId}`;
  const [prefs, setPrefs] = useState(preferenciasIniciais);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(() => new Date());
  const [revisao, setRevisao] = useState(0);

  useFocusEffect(useCallback(() => {
    let ativo = true;
    setAgora(new Date());
    const cancelador = new AbortController();
    const ler = async () => {
      const [preferencias, metricas] = await Promise.all([
        AsyncStorage.getItem(chave),
        supabase.rpc("tf_indicadores_painel", { p_fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }).abortSignal(cancelador.signal),
      ]);
      if (!ativo) return;
      if (preferencias) {
        try { setPrefs({ ...preferenciasIniciais, ...JSON.parse(preferencias) }); } catch {}
      }
      if (!metricas.error && metricas.data) setIndicadores(metricas.data as Indicadores);
      setErro("");
    };
    void medir("painel.carregar", ler).catch(() => { if (ativo) setErro("Não foi possível atualizar o painel."); });
    const timer = setInterval(() => setAgora(new Date()), 60_000);
    return () => { ativo = false; cancelador.abort(); clearInterval(timer); };
  }, [chave, revisao]));

  const diaAtual = chaveDiaPainel(agora);
  useFocusEffect(useCallback(() => {
    let ativo = true;
    const verificar = async () => {
      const novos: Aviso[] = [];
      if (prefs.medidas) {
        const { data, error } = await supabase.from("physical_measurements").select("measured_at")
          .eq("user_id", usuarioId).order("measured_at", { ascending: false }).limit(1).maybeSingle();
        const limite = new Date();
        limite.setDate(limite.getDate() - prefs.intervalo);
        const dataLimite = chaveDiaPainel(limite);
        if (!error && (!data || data.measured_at <= dataLimite))
          novos.push({ id: `medidas:${diaAtual}`, texto: "É hora de registrar suas medidas.", rota: "evolucao" });
      }
      if (prefs.comunidade) {
        const { data: vinculos } = await supabase.from("family_members").select("family_id").eq("user_id", usuarioId);
        if (vinculos?.length) {
          const { data } = await supabase.from("community_posts").select("id, family_id")
            .in("family_id", vinculos.map((item) => item.family_id)).neq("user_id", usuarioId)
            .gte("created_at", new Date(Date.now() - 86400000).toISOString())
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (data) novos.push({ id: `familia:${data.id}`, texto: "Há uma novidade na comunidade.", rota: "comunidade" });
        }
      }
      const visiveis = await Promise.all(novos.map(async (item) =>
        await AsyncStorage.getItem(`${chave}:lido:${item.id.split(":")[0]}`) === item.id ? null : item,
      ));
      if (ativo) setAvisos(visiveis.filter((item): item is Aviso => Boolean(item)));
    };
    void verificar().catch(() => {});
    return () => { ativo = false; };
  }, [chave, usuarioId, prefs.medidas, prefs.intervalo, prefs.comunidade, diaAtual]));

  return (
    <View style={estilos.container}>
      <ScrollView
        contentContainerStyle={estilos.conteudoHome}
        showsVerticalScrollIndicator={false}
      >
        <View style={estilos.topoHome}>
          <View style={estilos.informacoesUsuario}>
            <Text style={[estilos.marcaPequena, { color: corTema }]}>
              TREINO FAMÍLIA
            </Text>

            <Text
              style={estilos.tituloHome}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Olá, {nomeUsuario}!
            </Text>

            <Text style={estilos.subtituloHome}>
              Vamos treinar hoje?
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Abrir perfil"
            style={[
              estilos.avatar,
              {
                backgroundColor: `${corTema}30`,
                borderColor: corTema,
              },
            ]}
            onPress={() => onNavegar("perfil")}
            activeOpacity={0.8}
          >
            {fotoUrl ? (
              <Image
                source={{ uri: fotoUrl }}
                style={estilos.imagemAvatar}
              />
            ) : (
              <Text style={[estilos.avatarTexto, { color: corTema }]}>
                {nomeUsuario.charAt(0).toUpperCase()}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <TreinoDoDia
          onAbrirFrequencia={() => onNavegar("frequencia")}
          onAbrirTreino={(plano) =>
            plano
              ? onAbrirTreino(plano)
              : onNavegar("treinos")
          }
          corTema={corTema}
        />

        <ResumoSemanal corTema={corTema} metaSemanal={prefs.meta} />
        {indicadores ? (
          <View style={[estilos.cartaoHome, { flexDirection: "column", alignItems: "flex-start", marginBottom: 16 }]}>
            <Text style={estilos.tituloCartao}>Evolução de carga</Text>
            {indicadores.carga ? <Text style={estilos.descricaoCartao}>
              {indicadores.carga.exercicio} · série {indicadores.carga.serie}: {indicadores.carga.anterior} → {indicadores.carga.atual} kg
            </Text> : <Text style={estilos.descricaoCartao}>Registre a mesma série em dois treinos para comparar suas cargas.</Text>}
            <TouchableOpacity accessibilityRole="button" onPress={() => onNavegar("evolucaoTreinos")} style={{ paddingVertical: 12 }}>
              <Text style={{ color: corTema }}>Ver evolução dos treinos</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {avisos.map((aviso) => (
          <TouchableOpacity key={aviso.id} accessibilityRole="button"
            accessibilityLabel={`${aviso.texto} Marcar lembrete como lido`} style={[estilos.cartaoHome, { marginBottom: 10 }]}
            onPress={() => {
              void AsyncStorage.setItem(`${chave}:lido:${aviso.id.split(":")[0]}`, aviso.id)
                .then(() => setAvisos((itens) => itens.filter((item) => item.id !== aviso.id))).catch(() => {});
              onNavegar(aviso.rota);
            }}>
            <Text style={estilos.tituloCartao}>{aviso.texto}</Text>
          </TouchableOpacity>
        ))}
        {erro ? <TouchableOpacity accessibilityRole="button" onPress={() => setRevisao((valor) => valor + 1)}>
          <Text style={estilos.descricaoCartao}>{erro} Tentar novamente</Text>
        </TouchableOpacity> : null}
        <PreferenciasPainel atual={prefs}
          salvar={async (novo) => { await AsyncStorage.setItem(chave, JSON.stringify(novo)); setPrefs(novo); }} />

        <Text style={estilos.tituloSecao}>Seu espaço de treino</Text>

        <View style={estilos.listaCartoes}>
          {telas.map((tela) => (
            <TouchableOpacity
              key={tela.id}
              style={estilos.cartaoHome}
              onPress={() => onNavegar(tela.id)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  estilos.iconeCartao,
                  { backgroundColor: `${corTema}20` },
                ]}
              >
                <Text style={estilos.emojiCartao}>{tela.emoji}</Text>
              </View>

              <View style={estilos.textoCartao}>
                <Text style={estilos.tituloCartao}>
                  {tela.titulo}
                </Text>

                <Text style={estilos.descricaoCartao}>
                  {tela.descricao}
                </Text>
              </View>

              <Text style={[estilos.setaCartao, { color: corTema }]}>
                ›
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={estilos.botaoSair}
          onPress={onSair}
          activeOpacity={0.8}
        >
          <Text style={estilos.textoBotaoSair}>Sair da conta</Text>
        </TouchableOpacity>

        <Text style={estilos.rodapeHome}>
          Treino Família · Evoluindo juntos
        </Text>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101312" },
  conteudoHome: {
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 30,
  },
  topoHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 12,
  },
  informacoesUsuario: {
    flex: 1,
    minWidth: 0,
  },
  marcaPequena: {
    color: COR_PADRAO,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  tituloHome: {
    color: "#F0F3F1",
    fontSize: 27,
    fontWeight: "800",
  },
  subtituloHome: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 7,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#244C36",
    borderWidth: 1,
    borderColor: COR_PADRAO,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  imagemAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarTexto: {
    color: COR_PADRAO,
    fontSize: 22,
    fontWeight: "800",
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 19,
    fontWeight: "800",
    marginBottom: 16,
  },
  listaCartoes: {
    gap: 12,
  },
  cartaoHome: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 16,
    padding: 16,
  },
  iconeCartao: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#25382C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  emojiCartao: {
    fontSize: 23,
  },
  textoCartao: {
    flex: 1,
  },
  tituloCartao: {
    color: "#F0F3F1",
    fontSize: 15,
    fontWeight: "700",
  },
  descricaoCartao: {
    color: "#A4ADA7",
    fontSize: 12,
    marginTop: 5,
    lineHeight: 17,
  },
  setaCartao: {
    color: COR_PADRAO,
    fontSize: 28,
    marginLeft: 8,
  },
  botaoSair: {
    borderWidth: 1,
    borderColor: "#454D48",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  textoBotaoSair: {
    color: "#D6DDD8",
    fontWeight: "600",
    fontSize: 14,
  },
  rodapeHome: {
    color: "#6F7972",
    fontSize: 12,
    textAlign: "center",
    marginTop: 22,
  },
});
