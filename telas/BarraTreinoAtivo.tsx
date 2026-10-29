import React, { memo, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  assinarRascunhos,
  lerResumoTreinoAtivo,
  listarRascunhos,
  listarExclusoesPendentes,
  type ResumoTreinoAtivo,
} from "../servicos/treinoLocal";
import { sincronizarTreinosPendentes } from "../servicos/treinoSincronizacao";
import { assinarMudancasDeDados } from "../servicos/revisaoDados";

type BarraProps = {
  usuarioId: string;
  corTema: string;
  visivel: boolean;
  onRetomar: (plano: { planId: string; planName: string }) => void;
  onAbrirNutricao: () => void;
};

function Contagem({
  fimEm,
  pausado,
  restantes,
}: {
  fimEm?: number | null;
  pausado?: boolean;
  restantes?: number;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!fimEm || pausado) return;
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fimEm, pausado]);
  const segundos = pausado
    ? restantes ?? 0
    : fimEm
      ? Math.max(0, Math.ceil((fimEm - agora) / 1000))
      : 0;
  return segundos > 0 ? (
    <Text style={estilos.descanso}>
      Descanso {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
      {pausado ? " · pausado" : ""}
    </Text>
  ) : null;
}

function Barra({
  usuarioId,
  corTema,
  visivel,
  onRetomar,
  onAbrirNutricao,
}: BarraProps) {
  const [resumo, setResumo] = useState<ResumoTreinoAtivo | null>(null);
  const [pendenciasNutricao, setPendenciasNutricao] = useState(0);
  const [erroNutricao, setErroNutricao] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    let ativo = true;
    let versao = 0;
    let haRascunhos = false;

    const atualizar = async () => {
      const pedido = ++versao;
      try {
        const [rascunhos, exclusoes, atual, nutricao] = await Promise.all([
          listarRascunhos(usuarioId),
          listarExclusoesPendentes(usuarioId),
          lerResumoTreinoAtivo(usuarioId),
          import("../servicos/nutricaoRepositorio")
            .then((modulo) => modulo.lerEstadoNutricaoLocal(usuarioId))
            .catch(() => null),
        ]);
        if (!ativo || pedido !== versao) return;
        haRascunhos = rascunhos.length > 0 || exclusoes.length > 0;
        setResumo(atual);
        setPendenciasNutricao(nutricao?.pendencias ?? 0);
        setErroNutricao(nutricao?.erro ?? null);
      } catch {
        // Preserva o último estado conhecido; nunca descarta rascunhos locais.
      }
    };

    const tentarTreinos = () => {
      void sincronizarTreinosPendentes(usuarioId).then(atualizar).catch(atualizar);
    };
    const cancelarRascunhos = assinarRascunhos(atualizar);
    const cancelarMudancas = assinarMudancasDeDados(atualizar);
    const rede = NetInfo.addEventListener((estado) => {
      if (estado.isConnected && estado.isInternetReachable !== false)
        tentarTreinos();
    });
    const foco = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        void atualizar();
        tentarTreinos();
      }
    });
    const tentar = () => {
      if (
        ativo &&
        haRascunhos &&
        (typeof navigator === "undefined" || navigator.onLine !== false)
      )
        tentarTreinos();
    };
    const intervalo = setInterval(tentar, 12000);
    if (typeof window !== "undefined") {
      window.addEventListener("online", tentar);
      window.addEventListener("focus", tentar);
    }
    void atualizar();
    tentarTreinos();

    return () => {
      ativo = false;
      cancelarRascunhos();
      cancelarMudancas();
      rede();
      foco.remove();
      clearInterval(intervalo);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", tentar);
        window.removeEventListener("focus", tentar);
      }
    };
  }, [usuarioId]);

  async function tentarSincronizarNutricao() {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const { sincronizarNutricao } = await import("../servicos/nutricaoRepositorio");
      const resultado = await sincronizarNutricao(usuarioId);
      setPendenciasNutricao(resultado.pendencias);
      setErroNutricao(resultado.erro);
    } catch {
      setErroNutricao("Não foi possível confirmar a sincronização. Tente novamente.");
    } finally {
      setSincronizando(false);
    }
  }

  const mostrarNutricao = pendenciasNutricao > 0 || Boolean(erroNutricao);
  if (!visivel || (!resumo && !mostrarNutricao)) return null;

  return (
    <View style={estilos.grupo}>
      {resumo ? (
        <TouchableOpacity
          style={[estilos.barra, { borderColor: `${corTema}70` }]}
          onPress={() => onRetomar(resumo)}
          accessibilityRole="button"
          accessibilityLabel={`${resumo.finalizacaoPendente ? "Conclusão pendente" : "Continuar treino"}: ${resumo.planName}, ${resumo.seriesConcluidas} de ${resumo.totalSeries} séries`}
        >
          <View style={estilos.textos}>
            <Text style={[estilos.titulo, { color: corTema }]} numberOfLines={1}>
              {resumo.finalizacaoPendente
                ? "Conclusão pendente de envio"
                : "Continuar treino"} · {resumo.planName}
            </Text>
            <Text style={estilos.detalhes}>
              {resumo.seriesConcluidas}/{resumo.totalSeries} séries
              {resumo.conflito
                ? " · revisar conflito"
                : resumo.pendencias
                  ? ` · ${resumo.pendencias} pendente(s)`
                  : " · salvo"}
            </Text>
            <Contagem
              fimEm={resumo.descanso?.fimEm}
              pausado={resumo.descanso?.pausado}
              restantes={resumo.descanso?.segundosPausados}
            />
          </View>
          <Text style={[estilos.seta, { color: corTema }]}>›</Text>
        </TouchableOpacity>
      ) : null}

      {mostrarNutricao ? (
        <View
          style={[estilos.barraNutricao, { borderColor: `${corTema}70` }]}
          accessibilityLiveRegion="polite"
        >
          <View style={estilos.textos}>
            <Text style={[estilos.titulo, { color: corTema }]}>
              {erroNutricao
                ? "Nutrição: sincronização precisa de atenção"
                : `${pendenciasNutricao} alteração(ões) de nutrição pendente(s)`}
            </Text>
            <Text style={estilos.detalhes}>
              {erroNutricao
                ? "Os dados continuam guardados neste aparelho."
                : "As alterações aguardam confirmação do servidor."}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Tentar sincronizar nutrição"
            accessibilityState={{ disabled: sincronizando }}
            disabled={sincronizando}
            onPress={() => void tentarSincronizarNutricao()}
            style={[estilos.acaoNutricao, { borderColor: corTema }]}
          >
            <Text style={{ color: corTema, fontWeight: "800", textAlign: "center" }}>
              {sincronizando ? "Enviando…" : "Sincronizar"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Abrir Nutrição"
            onPress={onAbrirNutricao}
            style={[estilos.acaoNutricao, { borderColor: `${corTema}66` }]}
          >
            <Text style={{ color: "#D8E1DA", fontWeight: "700", textAlign: "center" }}>
              Ver
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default memo(Barra);

const estilos = StyleSheet.create({
  grupo: { marginBottom: 4 },
  barra: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#19251E",
  },
  barraNutricao: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#19251E",
  },
  acaoNutricao: {
    minHeight: 40,
    minWidth: 56,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 9,
  },
  textos: { flex: 1 },
  titulo: { fontSize: 13, fontWeight: "800" },
  detalhes: { color: "#C4CFC7", fontSize: 12, marginTop: 2 },
  descanso: { color: "#FACC15", fontSize: 12, marginTop: 2 },
  seta: { fontSize: 25, marginLeft: 8 },
});
