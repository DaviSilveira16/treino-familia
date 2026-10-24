import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Alert } from "../servicos/alerta";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";

const estiloRolagemWeb =
  Platform.OS === "web"
    ? ({
        flex: 1,
        minHeight: 0,
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",
      } as any)
    : { flex: 1, minHeight: 0 };

const TEMAS = [
  { nome: "Verde", cor: "#35D07F" },
  { nome: "Azul escuro", cor: "#0878D1" },
  { nome: "Rosa", cor: "#FF5CA8" },
  { nome: "Roxo", cor: "#A78BFA" },
  { nome: "Vermelho", cor: "#F05252" },
  { nome: "Laranja", cor: "#FB923C" },
  { nome: "Ciano", cor: "#22D3EE" },
  { nome: "Amarelo", cor: "#FACC15" },
];

type RegistroExportacao = Record<string, any>;

async function buscarTodosOsRegistros(
  tabela: string,
  idUsuario: string,
): Promise<RegistroExportacao[]> {
  const resultado: RegistroExportacao[] = [];
  const tamanhoPagina = 500;
  let inicio = 0;

  while (true) {
    const resposta = await (supabase as any)
      .from(tabela)
      .select("*")
      .eq("user_id", idUsuario)
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanhoPagina - 1);

    if (resposta.error) {
      throw new Error(
        `Não foi possível ler ${tabela}: ${resposta.error.message}`,
      );
    }

    const pagina = (resposta.data ?? []) as RegistroExportacao[];
    resultado.push(...pagina);
    if (pagina.length < tamanhoPagina) break;
    inicio += tamanhoPagina;
  }

  return resultado;
}

async function buscarSeriesDasSessoes(
  idUsuario: string,
  idsSessoes: string[],
): Promise<RegistroExportacao[]> {
  const resultado: RegistroExportacao[] = [];
  const tamanhoGrupo = 100;
  const tamanhoPagina = 500;

  for (let posicao = 0; posicao < idsSessoes.length; posicao += tamanhoGrupo) {
    const grupoIds = idsSessoes.slice(posicao, posicao + tamanhoGrupo);
    let inicio = 0;

    while (true) {
      const resposta = await supabase
        .from("workout_sets")
        .select("*")
        .eq("user_id", idUsuario)
        .in("session_id", grupoIds)
        .order("set_number", { ascending: true })
        .range(inicio, inicio + tamanhoPagina - 1);

      if (resposta.error) {
        throw new Error(
          `Não foi possível ler as séries dos treinos: ${resposta.error.message}`,
        );
      }

      const pagina = (resposta.data ?? []) as unknown as RegistroExportacao[];
      resultado.push(...pagina);
      if (pagina.length < tamanhoPagina) break;
      inicio += tamanhoPagina;
    }
  }

  return resultado;
}

function escaparHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarDataRelatorio(valor: unknown): string {
  if (!valor) return "Não informada";
  const texto = String(valor);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T12:00:00`)
    : new Date(texto);
  if (Number.isNaN(data.getTime())) return texto;
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatarNumeroRelatorio(valor: unknown, maximo = 1): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "—";
  return numero.toLocaleString("pt-BR", { maximumFractionDigits: maximo });
}

function formatarDataCampo(data: Date): string {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function dataPadraoRelatorio(diasAtras: number): string {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - diasAtras);
  return formatarDataCampo(data);
}

function formatarEntradaData(texto: string): string {
  const digitos = texto.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

function converterDataCampo(texto: string): Date | null {
  const correspondencia = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!correspondencia) return null;
  const dia = Number(correspondencia[1]);
  const mes = Number(correspondencia[2]);
  const ano = Number(correspondencia[3]);
  const data = new Date(ano, mes - 1, dia);
  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  )
    return null;
  data.setHours(0, 0, 0, 0);
  return data;
}

function formatarDataIsoParaCampo(valor: string): string {
  const correspondencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!correspondencia) return "";
  return `${correspondencia[3]}/${correspondencia[2]}/${correspondencia[1]}`;
}

function formatarDataCampoParaIso(valor: string): string {
  const correspondencia = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!correspondencia) return "";
  return `${correspondencia[3]}-${correspondencia[2]}-${correspondencia[1]}`;
}

function registroNoIntervalo(valor: unknown, inicio: Date, fim: Date): boolean {
  if (!valor) return false;
  const texto = String(valor);
  let data: Date;
  const apenasData = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (apenasData) {
    data = new Date(
      Number(apenasData[1]),
      Number(apenasData[2]) - 1,
      Number(apenasData[3]),
    );
  } else {
    data = new Date(texto);
  }
  if (Number.isNaN(data.getTime())) return false;
  const limiteFinal = new Date(fim);
  limiteFinal.setHours(23, 59, 59, 999);
  return data >= inicio && data <= limiteFinal;
}

function criarHtmlRelatorio(dados: {
  nome: string;
  email: string;
  corTema: string;
  periodoTexto: string;
  perfil: Record<string, unknown>;
  treinos: RegistroExportacao[];
  series: RegistroExportacao[];
  planos: RegistroExportacao[];
  cardios: RegistroExportacao[];
  medicoes: RegistroExportacao[];
}): string {
  const planosPorId = new Map(
    dados.planos.map((plano) => [
      String(plano.id),
      String(plano.name ?? "Treino"),
    ]),
  );
  const seriesPorSessao = new Map<string, RegistroExportacao[]>();
  for (const serie of dados.series) {
    const idSessao = String(serie.session_id ?? "");
    const lista = seriesPorSessao.get(idSessao) ?? [];
    lista.push(serie);
    seriesPorSessao.set(idSessao, lista);
  }

  let totalMinutos = 0;
  let totalCalorias = 0;
  let contagemCalorias = 0;
  for (const sessao of dados.treinos) {
    totalMinutos += Number(sessao.duration_minutes) || 0;
    if (
      sessao.active_calories !== null &&
      sessao.active_calories !== undefined
    ) {
      totalCalorias += Number(sessao.active_calories) || 0;
      contagemCalorias += 1;
    }
  }
  for (const cardio of dados.cardios) {
    totalMinutos += Number(cardio.duration_minutes) || 0;
    const valorCalorias = cardio.active_calories ?? cardio.calories;
    if (valorCalorias !== null && valorCalorias !== undefined) {
      totalCalorias += Number(valorCalorias) || 0;
      contagemCalorias += 1;
    }
  }

  const htmlTreinos = dados.treinos.length
    ? dados.treinos
        .map((sessao) => {
          const lista = seriesPorSessao.get(String(sessao.id)) ?? [];
          const grupos = new Map<string, RegistroExportacao[]>();
          for (const serie of lista) {
            const nomeExercicio = String(
              serie.exercise_name ?? "Exercício sem nome",
            );
            const grupo = grupos.get(nomeExercicio) ?? [];
            grupo.push(serie);
            grupos.set(nomeExercicio, grupo);
          }
          const linhasSeries = Array.from(grupos.entries())
            .map(([nomeExercicio, grupo]) => {
              const reps = grupo.reduce(
                (total, serie) => total + (Number(serie.reps) || 0),
                0,
              );
              const volume = grupo.reduce(
                (total, serie) =>
                  total +
                  (Number(serie.reps) || 0) * (Number(serie.weight_kg) || 0),
                0,
              );
              const maiorCarga = Math.max(
                0,
                ...grupo.map((serie) => Number(serie.weight_kg) || 0),
              );
              return `<tr><td>${escaparHtml(nomeExercicio)}</td><td>${grupo.length}</td><td>${reps}</td><td>${formatarNumeroRelatorio(maiorCarga, 2)} kg</td><td>${formatarNumeroRelatorio(volume, 2)} kg</td></tr>`;
            })
            .join("");
          const calorias =
            sessao.active_calories == null
              ? "Não estimadas"
              : `${formatarNumeroRelatorio(sessao.active_calories, 0)} kcal`;
          const tituloTreino = sessao.plan_id
            ? (planosPorId.get(String(sessao.plan_id)) ?? "Treino registrado")
            : "Treino registrado";
          return `<section class="registro"><h3>${escaparHtml(tituloTreino)}</h3><p class="meta">${formatarDataRelatorio(sessao.started_at)} · ${formatarNumeroRelatorio(sessao.duration_minutes, 0)} min · Intensidade: ${escaparHtml(sessao.intensity ?? "não informada")} · ${calorias}</p>${lista.length ? `<table><thead><tr><th>Exercício</th><th>Séries</th><th>Reps.</th><th>Maior carga</th><th>Volume</th></tr></thead><tbody>${linhasSeries}</tbody></table>` : `<p class="vazio">Não há séries detalhadas nesta sessão.</p>`}</section>`;
        })
        .join("")
    : `<p class="vazio">Nenhum treino concluído no período.</p>`;

  const htmlCardios = dados.cardios.length
    ? `<table><thead><tr><th>Data</th><th>Atividade</th><th>Duração</th><th>Distância</th><th>Calorias</th><th>Detalhes</th></tr></thead><tbody>${dados.cardios
        .map((cardio) => {
          const calorias = cardio.active_calories ?? cardio.calories;
          const detalhes = [
            cardio.intensity ? `Intensidade: ${cardio.intensity}` : "",
            cardio.incline_percent != null
              ? `Inclinação: ${cardio.incline_percent}%`
              : "",
            cardio.floors_up != null ? `Andares: ${cardio.floors_up}` : "",
            cardio.notes ? `Obs.: ${cardio.notes}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return `<tr><td>${formatarDataRelatorio(cardio.started_at)}</td><td>${escaparHtml(cardio.activity_name ?? cardio.activity_type ?? "Cardio")}</td><td>${formatarNumeroRelatorio(cardio.duration_minutes, 0)} min</td><td>${cardio.distance_km == null ? "—" : `${formatarNumeroRelatorio(cardio.distance_km, 2)} km`}</td><td>${calorias == null ? "—" : `${formatarNumeroRelatorio(calorias, 0)} kcal`}</td><td>${escaparHtml(detalhes || "—")}</td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="vazio">Nenhum cardio registrado no período.</p>`;

  const htmlMedicoes = dados.medicoes.length
    ? `<table><thead><tr><th>Data</th><th>Peso</th><th>Gordura corporal</th><th>Cintura</th><th>Quadril</th><th>Peito</th></tr></thead><tbody>${dados.medicoes.map((medicao) => `<tr><td>${formatarDataRelatorio(medicao.measured_at)}</td><td>${medicao.weight_kg == null ? "—" : `${formatarNumeroRelatorio(medicao.weight_kg)} kg`}</td><td>${medicao.body_fat_percentage == null ? "—" : `${formatarNumeroRelatorio(medicao.body_fat_percentage)}%`}</td><td>${medicao.waist_cm == null ? "—" : `${formatarNumeroRelatorio(medicao.waist_cm)} cm`}</td><td>${medicao.hip_cm == null ? "—" : `${formatarNumeroRelatorio(medicao.hip_cm)} cm`}</td><td>${medicao.chest_cm == null ? "—" : `${formatarNumeroRelatorio(medicao.chest_cm)} cm`}</td></tr>`).join("")}</tbody></table>`
    : `<p class="vazio">Nenhuma medição física registrada no período.</p>`;

  const altura =
    dados.perfil.altura_cm == null
      ? "—"
      : `${escaparHtml(dados.perfil.altura_cm)} cm`;
  const peso =
    dados.perfil.peso_kg == null
      ? "—"
      : `${escaparHtml(dados.perfil.peso_kg)} kg`;
  const idade =
    dados.perfil.idade == null
      ? "—"
      : `${escaparHtml(dados.perfil.idade)} anos`;
  const sexo =
    dados.perfil.sexo === "masculino"
      ? "Masculino"
      : dados.perfil.sexo === "feminino"
        ? "Feminino"
        : "—";
  const cor = /^#[0-9a-fA-F]{6}$/.test(dados.corTema)
    ? dados.corTema
    : "#35D07F";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório Treino Família</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#202722;background:#fff;font-size:10.5pt;line-height:1.45;margin:0}.barra-acoes{position:sticky;top:0;z-index:10;display:flex;justify-content:flex-end;gap:10px;padding:12px 16px;background:#101312;border-bottom:1px solid #354039}.botao-acao{border:0;border-radius:9px;padding:11px 16px;background:${cor};color:#101312;font-weight:800;font-size:14px;cursor:pointer}.botao-sair{background:#252d28;color:#f0f3f1;border:1px solid #536158}@media print{.barra-acoes{display:none}}header{border-bottom:3px solid ${cor};padding-bottom:14px;margin-bottom:18px}h1{font-size:24pt;margin:0 0 5px;color:#152019}h2{font-size:15pt;color:#152019;border-bottom:1px solid #d9e0db;padding-bottom:6px;margin:24px 0 10px;break-after:avoid}h3{font-size:12pt;margin:0 0 4px;color:#152019}p{margin:4px 0}.muted,.meta,.vazio{color:#637068;font-size:9pt}.resumo{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.indicador{flex:1 1 22%;min-width:115px;padding:10px;border:1px solid #d9e0db;border-top:3px solid ${cor};border-radius:7px}.indicador strong{display:block;font-size:16pt;margin-top:3px}table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:8.8pt}th{text-align:left;background:#edf2ee;color:#243229;font-weight:700}th,td{padding:6px;border-bottom:1px solid #e2e7e3;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}.registro{border:1px solid #e0e6e1;border-radius:8px;padding:10px;margin:10px 0;break-inside:avoid}.perfil{display:flex;flex-wrap:wrap;gap:12px 20px}.perfil span{display:inline-block}.rodape{border-top:1px solid #d9e0db;margin-top:24px;padding-top:8px;font-size:8pt;color:#68746c}.aviso{background:#f1f5f2;padding:10px;border-left:3px solid ${cor};margin-top:14px;font-size:8.5pt}@media print{.registro,table{break-inside:auto}h2,h3{break-after:avoid}thead{display:table-header-group}}
    </style></head><body><div class="barra-acoes" role="toolbar" aria-label="Ações do relatório"><button class="botao-acao" type="button" onclick="window.focus();window.print()">Baixar / Salvar PDF</button><button class="botao-acao botao-sair" type="button" onclick="(function(){window.close();if(!window.closed){window.location.href=document.referrer||'/'}})()">Sair do relatório</button></div><header><h1>Treino Família</h1><p><strong>Relatório pessoal de atividades</strong></p><p class="muted">Período: ${escaparHtml(dados.periodoTexto)} · Gerado em ${formatarDataRelatorio(new Date().toISOString())}</p><p class="muted">${escaparHtml(dados.nome)}${dados.email ? ` · ${escaparHtml(dados.email)}` : ""}</p></header>
    <h2>Resumo do período</h2><div class="resumo"><div class="indicador">Musculação<strong>${dados.treinos.length}</strong></div><div class="indicador">Cardios<strong>${dados.cardios.length}</strong></div><div class="indicador">Tempo registrado<strong>${formatarNumeroRelatorio(totalMinutos, 0)} min</strong></div><div class="indicador">Calorias disponíveis<strong>${contagemCalorias ? `${formatarNumeroRelatorio(totalCalorias, 0)} kcal` : "—"}</strong></div></div>
    <h2>Perfil</h2><div class="perfil"><span><strong>Peso atual:</strong> ${peso}</span><span><strong>Altura:</strong> ${altura}</span><span><strong>Idade:</strong> ${idade}</span><span><strong>Sexo usado no cálculo:</strong> ${sexo}</span></div>
    <h2>Treinos de musculação</h2>${htmlTreinos}
    <h2>Cardios</h2>${htmlCardios}
    <h2>Evolução física</h2>${htmlMedicoes}
    <div class="aviso">As calorias apresentadas são estimativas registradas pelo aplicativo, não medições exatas. Sessões antigas sem estimativa permanecem sem cálculo retroativo. Este relatório contém dados pessoais: guarde e compartilhe apenas em locais seguros.</div>
    <div class="rodape">Treino Família · Relatório gerado a partir dos registros da conta conectada. Nenhum dado foi alterado durante a exportação.</div></body></html>`;
}

type Props = {
  usuario: User;
  onVoltar: () => void;
  onTemaAlterado?: (cor: string) => void;
};

export default function Perfil({ usuario, onVoltar, onTemaAlterado }: Props) {
  const nomeAtual =
    typeof usuario.user_metadata?.nome === "string"
      ? usuario.user_metadata.nome
      : "";

  const fotoAtual =
    typeof usuario.user_metadata?.foto_url === "string"
      ? usuario.user_metadata.foto_url
      : null;

  const temaAtual =
    typeof usuario.user_metadata?.tema_cor === "string" &&
    TEMAS.some((tema) => tema.cor === usuario.user_metadata.tema_cor)
      ? usuario.user_metadata.tema_cor
      : "#35D07F";

  const [nome, setNome] = useState(nomeAtual);
  const [fotoUrl, setFotoUrl] = useState<string | null>(fotoAtual);
  const [corTema, setCorTema] = useState(temaAtual);
  const [senhaAtualizada, setSenhaAtualizada] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [salvandoTema, setSalvandoTema] = useState(false);
  const [pesoKg, setPesoKg] = useState(
    usuario.user_metadata?.peso_kg == null
      ? ""
      : String(usuario.user_metadata.peso_kg),
  );
  const [alturaCm, setAlturaCm] = useState(
    usuario.user_metadata?.altura_cm == null
      ? ""
      : String(usuario.user_metadata.altura_cm),
  );
  const [idade, setIdade] = useState(
    usuario.user_metadata?.idade == null
      ? ""
      : String(usuario.user_metadata.idade),
  );
  const [sexo, setSexo] = useState<"masculino" | "feminino" | "">(
    usuario.user_metadata?.sexo === "masculino" ||
      usuario.user_metadata?.sexo === "feminino"
      ? usuario.user_metadata.sexo
      : "",
  );
  const [salvandoDadosCalorias, setSalvandoDadosCalorias] = useState(false);
  const [exportandoRelatorio, setExportandoRelatorio] = useState(false);
  const [exportandoBackup, setExportandoBackup] = useState(false);
  const [dataInicioRelatorio, setDataInicioRelatorio] = useState(() =>
    dataPadraoRelatorio(89),
  );
  const [dataFimRelatorio, setDataFimRelatorio] = useState(() =>
    dataPadraoRelatorio(0),
  );

  async function metadadosComPerfil(
    adicionais: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Sua sessão expirou. Entre novamente.");

    const metadadosAtuais = data.user.user_metadata ?? {};
    const pesoInformado = pesoKg.trim()
      ? Number(pesoKg.replace(",", "."))
      : Number(metadadosAtuais.peso_kg);
    const alturaInformada = alturaCm.trim()
      ? Number(alturaCm.replace(",", "."))
      : Number(metadadosAtuais.altura_cm);
    const idadeInformada = idade.trim()
      ? Number(idade.replace(",", "."))
      : Number(metadadosAtuais.idade);

    return {
      ...metadadosAtuais,
      nome: nome.trim() || metadadosAtuais.nome || nomeAtual,
      tema_cor: corTema,
      ...(fotoUrl ? { foto_url: fotoUrl } : {}),
      ...(Number.isFinite(pesoInformado) &&
      pesoInformado >= 20 &&
      pesoInformado <= 400
        ? { peso_kg: pesoInformado }
        : {}),
      ...(Number.isFinite(alturaInformada) &&
      alturaInformada >= 100 &&
      alturaInformada <= 250
        ? { altura_cm: alturaInformada }
        : {}),
      ...(Number.isFinite(idadeInformada) &&
      idadeInformada >= 18 &&
      idadeInformada <= 110
        ? { idade: idadeInformada }
        : {}),
      ...(sexo === "masculino" || sexo === "feminino" ? { sexo } : {}),
      ...adicionais,
    };
  }

  async function salvarDadosCalorias() {
    const peso = Number(pesoKg.replace(",", "."));
    const altura = Number(alturaCm.replace(",", "."));
    const idadeNumerica = Number(idade.replace(",", "."));

    if (!pesoKg.trim() || !Number.isFinite(peso) || peso < 20 || peso > 400) {
      Alert.alert(
        "Peso inválido",
        "Informe seu peso atual em kg, entre 20 e 400.",
      );
      return;
    }
    if (
      !alturaCm.trim() ||
      !Number.isFinite(altura) ||
      altura < 100 ||
      altura > 250
    ) {
      Alert.alert(
        "Altura inválida",
        "Informe sua altura em centímetros, entre 100 e 250.",
      );
      return;
    }
    if (
      !idade.trim() ||
      !Number.isInteger(idadeNumerica) ||
      idadeNumerica < 18 ||
      idadeNumerica > 110
    ) {
      Alert.alert("Idade inválida", "Informe uma idade entre 18 e 110 anos.");
      return;
    }
    if (sexo !== "masculino" && sexo !== "feminino") {
      Alert.alert(
        "Sexo necessário",
        "Selecione uma das opções para calcular a estimativa personalizada.",
      );
      return;
    }

    setSalvandoDadosCalorias(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: await metadadosComPerfil({
          peso_kg: peso,
          altura_cm: altura,
          idade: idadeNumerica,
          sexo,
        }),
      });
      if (error) throw error;
      const metadadosSalvos = data.user?.user_metadata;
      if (
        !data.user ||
        Number(metadadosSalvos?.peso_kg) !== peso ||
        Number(metadadosSalvos?.altura_cm) !== altura ||
        Number(metadadosSalvos?.idade) !== idadeNumerica ||
        metadadosSalvos?.sexo !== sexo
      ) {
        throw new Error(
          "O servidor não confirmou o salvamento dos dados pessoais.",
        );
      }
      setPesoKg(String(peso));
      setAlturaCm(String(altura));
      setIdade(String(idadeNumerica));
      Alert.alert(
        "Dados salvos",
        "Esses dados serão usados para estimar as calorias dos próximos cardios. Os registros anteriores continuarão iguais.",
      );
    } catch (erro) {
      Alert.alert(
        "Erro ao salvar os dados pessoais",
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar os dados para estimar calorias.",
      );
    } finally {
      setSalvandoDadosCalorias(false);
    }
  }

  async function exportarRelatorioPdf() {
    if (exportandoRelatorio) return;

    const inicioSelecionado = converterDataCampo(dataInicioRelatorio);
    const fimSelecionado = converterDataCampo(dataFimRelatorio);
    if (!inicioSelecionado || !fimSelecionado) {
      const mensagem =
        "Informe uma data inicial e final válidas no formato DD/MM/AAAA.";
      if (Platform.OS === "web" && typeof window !== "undefined")
        window.alert(mensagem);
      else Alert.alert("Datas inválidas", mensagem);
      return;
    }
    if (inicioSelecionado.getTime() > fimSelecionado.getTime()) {
      const mensagem = "A data inicial não pode ser posterior à data final.";
      if (Platform.OS === "web" && typeof window !== "undefined")
        window.alert(mensagem);
      else Alert.alert("Período inválido", mensagem);
      return;
    }

    let janelaRelatorio: Window | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      janelaRelatorio = window.open("", "_blank");
      if (!janelaRelatorio) {
        window.alert(
          "O navegador bloqueou a janela do relatório. Permita pop-ups para o Treino Família e tente novamente.",
        );
        return;
      }
      janelaRelatorio.document.open();
      janelaRelatorio.document.write(
        "<!DOCTYPE html><html lang='pt-BR'><meta charset='utf-8'><title>Preparando relatório</title><body style='font-family:Arial;padding:32px;color:#202722'><h2>Preparando seu relatório…</h2><p>Estamos organizando seus registros. A janela de impressão será aberta em seguida.</p></body></html>",
      );
      janelaRelatorio.document.close();
    }

    setExportandoRelatorio(true);
    try {
      const { data: respostaUsuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !respostaUsuario.user) {
        throw new Error(
          "Entre novamente na sua conta antes de exportar o relatório.",
        );
      }

      const usuarioRelatorio = respostaUsuario.user;
      const inicio = inicioSelecionado;
      const fim = fimSelecionado;
      const [sessoesBrutas, cardiosBrutos, medicoesBrutas, planos] =
        await Promise.all([
          buscarTodosOsRegistros("workout_sessions", usuarioRelatorio.id),
          buscarTodosOsRegistros("cardio_sessions", usuarioRelatorio.id),
          buscarTodosOsRegistros("physical_measurements", usuarioRelatorio.id),
          buscarTodosOsRegistros("workout_plans", usuarioRelatorio.id),
        ]);

      const treinos = sessoesBrutas
        .filter(
          (sessao) =>
            sessao.status !== "em_andamento" &&
            registroNoIntervalo(sessao.started_at, inicio, fim),
        )
        .sort(
          (a, b) =>
            new Date(String(b.started_at)).getTime() -
            new Date(String(a.started_at)).getTime(),
        );
      const cardios = cardiosBrutos
        .filter((cardio) => registroNoIntervalo(cardio.started_at, inicio, fim))
        .sort(
          (a, b) =>
            new Date(String(b.started_at)).getTime() -
            new Date(String(a.started_at)).getTime(),
        );
      const medicoes = medicoesBrutas
        .filter((medicao) =>
          registroNoIntervalo(medicao.measured_at, inicio, fim),
        )
        .sort(
          (a, b) =>
            new Date(String(b.measured_at)).getTime() -
            new Date(String(a.measured_at)).getTime(),
        );
      const idsSessoes = treinos.map((sessao) => String(sessao.id));
      const series =
        idsSessoes.length > 0
          ? await buscarSeriesDasSessoes(usuarioRelatorio.id, idsSessoes)
          : [];
      const meta = usuarioRelatorio.user_metadata ?? {};
      const periodoTexto = `${dataInicioRelatorio} até ${dataFimRelatorio}`;
      const html = criarHtmlRelatorio({
        nome:
          typeof meta.nome === "string" && meta.nome.trim()
            ? meta.nome
            : "Usuário do Treino Família",
        email: usuarioRelatorio.email ?? "",
        corTema,
        periodoTexto,
        perfil: {
          peso_kg: meta.peso_kg ?? null,
          altura_cm: meta.altura_cm ?? null,
          idade: meta.idade ?? null,
          sexo: meta.sexo ?? null,
        },
        treinos,
        series,
        planos,
        cardios,
        medicoes,
      });

      const dataArquivoInicio = formatarDataCampoParaIso(dataInicioRelatorio);
      const dataArquivoFim = formatarDataCampoParaIso(dataFimRelatorio);
      const nomeArquivo = `treino-familia-relatorio-${dataArquivoInicio}-a-${dataArquivoFim}.pdf`;
      if (Platform.OS === "web") {
        if (!janelaRelatorio || janelaRelatorio.closed) {
          throw new Error(
            "A janela do relatório foi fechada. Tente novamente e permita pop-ups.",
          );
        }
        janelaRelatorio.document.open();
        janelaRelatorio.document.write(html);
        janelaRelatorio.document.close();
        janelaRelatorio.document.title = nomeArquivo;
        window.setTimeout(() => {
          if (janelaRelatorio && !janelaRelatorio.closed)
            janelaRelatorio.focus();
        }, 100);
      } else {
        const arquivoPdf = await Print.printToFileAsync({
          html,
          width: 595,
          height: 842,
          margins: { top: 36, bottom: 36, left: 36, right: 36 },
        });
        const compartilhamentoDisponivel = await Sharing.isAvailableAsync();
        if (!compartilhamentoDisponivel) {
          throw new Error(
            `O PDF foi criado, mas o compartilhamento não está disponível neste aparelho. Arquivo: ${arquivoPdf.uri}`,
          );
        }
        await Sharing.shareAsync(arquivoPdf.uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Salvar ou compartilhar relatório",
        });
      }
    } catch (erro) {
      if (janelaRelatorio && !janelaRelatorio.closed) janelaRelatorio.close();
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível gerar o relatório.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`Não foi possível gerar o PDF.\n\n${mensagem}`);
      } else {
        Alert.alert("Erro ao gerar relatório", mensagem);
      }
    } finally {
      setExportandoRelatorio(false);
    }
  }

  async function exportarBackup() {
    if (exportandoBackup) return;
    setExportandoBackup(true);

    try {
      const { data: respostaUsuario, error: erroUsuario } =
        await supabase.auth.getUser();
      if (erroUsuario || !respostaUsuario.user) {
        throw new Error(
          "Entre novamente na sua conta antes de exportar os dados.",
        );
      }

      const usuarioBackup = respostaUsuario.user;
      const tabelas = [
        "workout_plans",
        "exercises",
        "exercise_load_defaults",
        "workout_sessions",
        "workout_sets",
        "cardio_activities",
        "cardio_sessions",
        "physical_measurements",
      ] as const;
      const dadosTabelas: Record<string, RegistroExportacao[]> = {};
      for (const tabela of tabelas) {
        dadosTabelas[tabela] = await buscarTodosOsRegistros(
          tabela,
          usuarioBackup.id,
        );
      }

      const metadados = usuarioBackup.user_metadata ?? {};
      const backup = {
        aplicativo: "Treino Família",
        formato: "treino-familia-backup",
        versao: 1,
        exportado_em: new Date().toISOString(),
        usuario: {
          id: usuarioBackup.id,
          email: usuarioBackup.email ?? null,
          perfil: {
            nome: metadados.nome ?? null,
            tema_cor: metadados.tema_cor ?? null,
            foto_url: metadados.foto_url ?? null,
            peso_kg: metadados.peso_kg ?? null,
            altura_cm: metadados.altura_cm ?? null,
            idade: metadados.idade ?? null,
            sexo: metadados.sexo ?? null,
          },
        },
        tabelas: dadosTabelas,
        observacao:
          "O arquivo contém registros e referências das fotos, mas não incorpora os arquivos de imagem armazenados no Supabase Storage. Não inclui senhas nem tokens.",
      };

      const conteudo = JSON.stringify(backup, null, 2);
      const agoraLocal = new Date();
      const dataArquivo = `${agoraLocal.getFullYear()}-${String(agoraLocal.getMonth() + 1).padStart(2, "0")}-${String(agoraLocal.getDate()).padStart(2, "0")}`;
      const nomeArquivo = `treino-familia-backup-${dataArquivo}.json`;
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const arquivo = new Blob([conteudo], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        window.alert(
          "Backup JSON exportado. Guarde o arquivo em local privado e seguro. As fotos continuam armazenadas no Supabase.",
        );
      } else {
        if (!FileSystem.cacheDirectory)
          throw new Error(
            "Não foi possível acessar o armazenamento temporário deste aparelho.",
          );
        const uri = `${FileSystem.cacheDirectory}${nomeArquivo}`;
        await FileSystem.writeAsStringAsync(uri, conteudo);
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error(
            `O backup foi criado, mas o compartilhamento não está disponível. Arquivo: ${uri}`,
          );
        }
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          UTI: "public.json",
          dialogTitle: "Guardar backup completo",
        });
      }
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível exportar os dados. Nenhum registro foi alterado.";
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`Erro ao exportar backup\n\n${mensagem}`);
      } else {
        Alert.alert("Erro ao exportar backup", mensagem);
      }
    } finally {
      setExportandoBackup(false);
    }
  }

  async function salvarNome() {
    if (!nome.trim()) {
      Alert.alert("Atenção", "Digite seu nome.");
      return;
    }

    setSalvandoNome(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: await metadadosComPerfil(),
      });

      if (error) {
        Alert.alert("Erro", error.message);
        return;
      }

      Alert.alert("Sucesso", "Seu nome foi atualizado.");
    } catch {
      Alert.alert("Erro", "Não foi possível atualizar seu nome.");
    } finally {
      setSalvandoNome(false);
    }
  }

  async function salvarTema() {
    setSalvandoTema(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: await metadadosComPerfil({ tema_cor: corTema }),
      });

      if (error) {
        Alert.alert("Erro", error.message);
        return;
      }

      onTemaAlterado?.(corTema);

      Alert.alert("Sucesso", "Sua cor de tema foi salva.");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar a cor do tema.");
    } finally {
      setSalvandoTema(false);
    }
  }

  async function escolherFoto() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissao.granted) {
      Alert.alert(
        "Permissão necessária",
        "Permita o acesso à galeria para escolher sua foto de perfil.",
      );
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: [1, 1],
      quality: 1,
    });

    if (resultado.canceled || !resultado.assets[0]) {
      return;
    }

    const imagem = resultado.assets[0];
    setEnviandoFoto(true);

    try {
      const resposta = await fetch(imagem.uri);
      const arquivo = await resposta.blob();

      const extensaoEncontrada = imagem.uri.match(/\.(jpg|jpeg|png|webp)$/i);
      const extensao = extensaoEncontrada
        ? extensaoEncontrada[1].toLowerCase()
        : "jpg";

      const tipoArquivo =
        imagem.mimeType ||
        (extensao === "png"
          ? "image/png"
          : extensao === "webp"
            ? "image/webp"
            : "image/jpeg");

      const caminho = `${usuario.id}/avatar.${extensao}`;

      const { error: erroUpload } = await supabase.storage
        .from("avatars")
        .upload(caminho, arquivo, {
          upsert: true,
          contentType: tipoArquivo,
        });

      if (erroUpload) {
        throw erroUpload;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(caminho);

      const urlFoto = `${data.publicUrl}?v=${Date.now()}`;

      const { error: erroPerfil } = await supabase.auth.updateUser({
        data: await metadadosComPerfil({ foto_url: urlFoto }),
      });

      if (erroPerfil) {
        throw erroPerfil;
      }

      setFotoUrl(urlFoto);
      Alert.alert("Sucesso", "Sua foto de perfil foi atualizada.");
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível enviar a foto.";

      Alert.alert("Erro ao atualizar foto", mensagem);
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function alterarSenha() {
    if (senhaAtualizada.length < 6) {
      Alert.alert("Atenção", "A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (senhaAtualizada !== confirmacaoSenha) {
      Alert.alert("Atenção", "As senhas digitadas não são iguais.");
      return;
    }

    setAlterandoSenha(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: senhaAtualizada,
      });

      if (error) {
        Alert.alert("Erro", error.message);
        return;
      }

      setSenhaAtualizada("");
      setConfirmacaoSenha("");

      Alert.alert("Sucesso", "Sua senha foi alterada.");
    } catch {
      Alert.alert("Erro", "Não foi possível alterar sua senha.");
    } finally {
      setAlterandoSenha(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={estiloRolagemWeb}
        contentContainerStyle={[estilos.conteudo, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.botaoVoltar} onPress={onVoltar}>
          <Text style={[estilos.textoVoltar, { color: corTema }]}>
            ‹ Voltar
          </Text>
        </TouchableOpacity>

        <Text style={[estilos.marca, { color: corTema }]}>TREINO FAMÍLIA</Text>
        <Text style={estilos.titulo}>Meu perfil</Text>
        <Text style={estilos.subtitulo}>
          Gerencie suas informações pessoais.
        </Text>

        <View style={estilos.cartaoFoto}>
          <TouchableOpacity
            style={estilos.areaFoto}
            onPress={escolherFoto}
            disabled={enviandoFoto}
          >
            {fotoUrl ? (
              <Image
                source={{ uri: fotoUrl }}
                style={[estilos.foto, { borderColor: corTema }]}
              />
            ) : (
              <View
                style={[
                  estilos.fotoVazia,
                  {
                    backgroundColor: `${corTema}30`,
                    borderColor: corTema,
                  },
                ]}
              >
                <Text style={[estilos.letraAvatar, { color: corTema }]}>
                  {(nome.trim() || usuario.email || "A")
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}

            <View
              style={[
                estilos.botaoCamera,
                {
                  backgroundColor: corTema,
                  borderColor: "#191E1B",
                },
              ]}
            >
              <Text style={estilos.iconeCamera}>✎</Text>
            </View>
          </TouchableOpacity>

          {enviandoFoto ? (
            <ActivityIndicator color={corTema} style={estilos.carregandoFoto} />
          ) : (
            <TouchableOpacity onPress={escolherFoto}>
              <Text style={[estilos.linkFoto, { color: corTema }]}>
                Alterar foto
              </Text>
            </TouchableOpacity>
          )}

          <Text style={estilos.email}>{usuario.email}</Text>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Personalizar tema</Text>
          <Text style={estilos.descricaoSecao}>
            Escolha sua cor favorita. O fundo do aplicativo continuará preto.
          </Text>

          <View style={estilos.gradeTemas}>
            {TEMAS.map((tema) => {
              const selecionado = corTema === tema.cor;

              return (
                <TouchableOpacity
                  key={tema.cor}
                  style={[
                    estilos.opcaoTema,
                    selecionado && {
                      borderColor: tema.cor,
                      backgroundColor: `${tema.cor}18`,
                    },
                  ]}
                  onPress={() => setCorTema(tema.cor)}
                  accessibilityRole="button"
                  accessibilityLabel={`Selecionar tema ${tema.nome}`}
                  accessibilityState={{ selected: selecionado }}
                >
                  <View
                    style={[
                      estilos.amostraCor,
                      {
                        backgroundColor: tema.cor,
                        borderColor: selecionado ? "#F0F3F1" : tema.cor,
                      },
                    ]}
                  >
                    {selecionado && (
                      <Text style={estilos.marcaSelecionado}>✓</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      estilos.nomeTema,
                      selecionado && { color: tema.cor },
                    ]}
                  >
                    {tema.nome}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={estilos.previaTema}>
            <View style={[estilos.pontoPrevia, { backgroundColor: corTema }]} />
            <Text style={estilos.textoPrevia}>
              Tema selecionado:{" "}
              <Text style={{ color: corTema, fontWeight: "800" }}>
                {TEMAS.find((tema) => tema.cor === corTema)?.nome}
              </Text>
            </Text>
          </View>

          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema },
              salvandoTema && estilos.botaoDesabilitado,
            ]}
            onPress={salvarTema}
            disabled={salvandoTema}
          >
            {salvandoTema ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>Salvar tema</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Informações pessoais</Text>

          <Text style={estilos.rotulo}>Nome</Text>
          <TextInput
            style={estilos.input}
            value={nome}
            onChangeText={setNome}
            placeholder="Seu nome"
            placeholderTextColor="#828A85"
            autoCapitalize="words"
            editable={!salvandoNome}
          />

          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema },
              salvandoNome && estilos.botaoDesabilitado,
            ]}
            onPress={salvarNome}
            disabled={salvandoNome}
          >
            {salvandoNome ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>Salvar nome</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Dados para estimar calorias</Text>
          <Text style={estilos.descricaoSecao}>
            Preencha estes dados uma vez e atualize o peso quando necessário. A
            estimativa usa uma equação de metabolismo de repouso para
            personalizar as calorias ativas. Alterar o perfil não modifica
            sessões antigas.
          </Text>
          <Text style={estilos.rotulo}>Peso atual (kg)</Text>
          <TextInput
            style={estilos.input}
            value={pesoKg}
            onChangeText={setPesoKg}
            placeholder="Ex.: 80,5"
            placeholderTextColor="#828A85"
            keyboardType="decimal-pad"
            editable={!salvandoDadosCalorias}
          />
          <Text style={estilos.rotulo}>Altura (cm)</Text>
          <TextInput
            style={estilos.input}
            value={alturaCm}
            onChangeText={setAlturaCm}
            placeholder="Ex.: 174"
            placeholderTextColor="#828A85"
            keyboardType="number-pad"
            editable={!salvandoDadosCalorias}
          />
          <Text style={estilos.rotulo}>Idade (anos, 18 ou mais)</Text>
          <TextInput
            style={estilos.input}
            value={idade}
            onChangeText={setIdade}
            placeholder="Ex.: 30"
            placeholderTextColor="#828A85"
            keyboardType="number-pad"
            editable={!salvandoDadosCalorias}
          />
          <Text style={estilos.rotulo}>Sexo usado na equação</Text>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 8,
              marginBottom: 14,
            }}
          >
            {(
              [
                ["masculino", "Masculino"],
                ["feminino", "Feminino"],
              ] as const
            ).map(([valor, rotulo]) => (
              <TouchableOpacity
                key={valor}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: sexo === valor ? corTema : "#343B37",
                  backgroundColor: sexo === valor ? `${corTema}22` : "#171B19",
                  alignItems: "center",
                }}
                onPress={() => setSexo(valor)}
                disabled={salvandoDadosCalorias}
              >
                <Text
                  style={{
                    color: sexo === valor ? corTema : "#E8ECE9",
                    fontWeight: "700",
                  }}
                >
                  {rotulo}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema },
              salvandoDadosCalorias && estilos.botaoDesabilitado,
            ]}
            onPress={salvarDadosCalorias}
            disabled={salvandoDadosCalorias}
          >
            {salvandoDadosCalorias ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>
                Salvar dados para calorias
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Segurança</Text>
          <Text style={estilos.descricaoSecao}>
            Escolha uma nova senha para sua conta.
          </Text>

          <Text style={estilos.rotulo}>Nova senha</Text>
          <TextInput
            style={estilos.input}
            value={senhaAtualizada}
            onChangeText={setSenhaAtualizada}
            placeholder="Mínimo de 6 caracteres"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            editable={!alterandoSenha}
          />

          <Text style={estilos.rotulo}>Confirmar nova senha</Text>
          <TextInput
            style={estilos.input}
            value={confirmacaoSenha}
            onChangeText={setConfirmacaoSenha}
            placeholder="Digite a senha novamente"
            placeholderTextColor="#828A85"
            secureTextEntry
            autoCapitalize="none"
            editable={!alterandoSenha}
          />

          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema },
              alterandoSenha && estilos.botaoDesabilitado,
            ]}
            onPress={alterarSenha}
            disabled={alterandoSenha}
          >
            {alterandoSenha ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>Alterar senha</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Meus dados</Text>
          <Text style={estilos.descricaoSecao}>
            Baixe um relatório fácil de ler para guardar ou compartilhar. O
            backup completo é separado e serve como cópia técnica dos registros
            da sua conta.
          </Text>
          <Text style={estilos.rotulo}>Período do relatório</Text>
          <Text
            style={[
              estilos.descricaoSecao,
              { marginTop: -8, marginBottom: 12 },
            ]}
          >
            Escolha as duas datas. O PDF incluirá somente os registros
            realizados entre elas, inclusive.
          </Text>
          <View style={estilos.gradeDatasRelatorio}>
            <View style={estilos.campoDataRelatorio}>
              <Text style={estilos.rotulo}>Data inicial</Text>
              {Platform.OS === "web" ? (
                React.createElement("input" as any, {
                  type: "date",
                  value: formatarDataCampoParaIso(dataInicioRelatorio),
                  max: formatarDataCampoParaIso(dataFimRelatorio) || undefined,
                  onChange: (evento: any) =>
                    setDataInicioRelatorio(
                      formatarDataIsoParaCampo(evento?.target?.value ?? ""),
                    ),
                  "aria-label": "Data inicial do relatório",
                  style: {
                    display: "block",
                    width: "calc(100% - 4px)",
                    minWidth: 0,
                    maxWidth: "calc(100% - 4px)",
                    boxSizing: "border-box",
                    height: 46,
                    margin: 0,
                    padding: "0 8px",
                    overflow: "hidden",
                    WebkitAppearance: "none",
                    borderRadius: 10,
                    border: "1px solid #354039",
                    backgroundColor: "#101512",
                    color: "#E5EAE6",
                    fontSize: 14,
                    fontFamily: "inherit",
                  },
                })
              ) : (
                <TextInput
                  style={estilos.inputDataRelatorio}
                  value={dataInicioRelatorio}
                  onChangeText={(valor) =>
                    setDataInicioRelatorio(formatarEntradaData(valor))
                  }
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#828A85"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  accessibilityLabel="Data inicial do relatório"
                />
              )}
            </View>
            <View style={estilos.campoDataRelatorio}>
              <Text style={estilos.rotulo}>Data final</Text>
              {Platform.OS === "web" ? (
                React.createElement("input" as any, {
                  type: "date",
                  value: formatarDataCampoParaIso(dataFimRelatorio),
                  min:
                    formatarDataCampoParaIso(dataInicioRelatorio) || undefined,
                  max: formatarDataCampoParaIso(dataPadraoRelatorio(0)),
                  onChange: (evento: any) =>
                    setDataFimRelatorio(
                      formatarDataIsoParaCampo(evento?.target?.value ?? ""),
                    ),
                  "aria-label": "Data final do relatório",
                  style: {
                    display: "block",
                    width: "calc(100% - 4px)",
                    minWidth: 0,
                    maxWidth: "calc(100% - 4px)",
                    boxSizing: "border-box",
                    height: 46,
                    margin: 0,
                    padding: "0 8px",
                    overflow: "hidden",
                    WebkitAppearance: "none",
                    borderRadius: 10,
                    border: "1px solid #354039",
                    backgroundColor: "#101512",
                    color: "#E5EAE6",
                    fontSize: 14,
                    fontFamily: "inherit",
                  },
                })
              ) : (
                <TextInput
                  style={estilos.inputDataRelatorio}
                  value={dataFimRelatorio}
                  onChangeText={(valor) =>
                    setDataFimRelatorio(formatarEntradaData(valor))
                  }
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor="#828A85"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  accessibilityLabel="Data final do relatório"
                />
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[
              estilos.botaoPrincipal,
              { backgroundColor: corTema },
              exportandoRelatorio && estilos.botaoDesabilitado,
            ]}
            onPress={exportarRelatorioPdf}
            disabled={exportandoRelatorio || exportandoBackup}
          >
            {exportandoRelatorio ? (
              <ActivityIndicator color="#101312" />
            ) : (
              <Text style={estilos.textoBotaoPrincipal}>
                Abrir relatório e opções do PDF
              </Text>
            )}
          </TouchableOpacity>
          <Text
            style={[estilos.descricaoSecao, { marginTop: 10, marginBottom: 0 }]}
          >
            No navegador, o relatório abre em uma nova janela. Dentro dele,
            toque em “Baixar / Salvar PDF” e escolha “Salvar como PDF” na janela
            de impressão. Para voltar ao app, toque em “Sair do relatório”. No
            aplicativo instalado, use o menu para salvar/compartilhar ou cancele
            para voltar.
          </Text>
        </View>

        <View style={estilos.cartao}>
          <Text style={estilos.tituloSecao}>Backup completo</Text>
          <Text style={estilos.descricaoSecao}>
            Guarde este arquivo JSON em local privado e seguro. Ele contém os
            registros tabulares da sua conta e as referências das fotos, mas não
            os arquivos de imagem. Não é um relatório para leitura e ainda não
            possui uma função de restauração automática dentro do aplicativo.
          </Text>
          <TouchableOpacity
            style={[
              estilos.botaoSecundario,
              { borderColor: corTema },
              exportandoBackup && estilos.botaoDesabilitado,
            ]}
            onPress={exportarBackup}
            disabled={exportandoBackup || exportandoRelatorio}
          >
            {exportandoBackup ? (
              <ActivityIndicator color={corTema} />
            ) : (
              <Text style={[estilos.textoBotaoSecundario, { color: corTema }]}>
                Fazer backup completo (.json)
              </Text>
            )}
          </TouchableOpacity>
          <Text
            style={[estilos.descricaoSecao, { marginTop: 12, marginBottom: 0 }]}
          >
            A exportação não altera nem exclui registros e não substitui o
            backup administrativo do projeto Supabase. O arquivo inclui apenas
            dados da conta conectada.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101312",
  },
  conteudo: {
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "web" ? 8 : 58,
    paddingBottom: 36,
  },
  botaoVoltar: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 22,
  },
  textoVoltar: {
    fontSize: 16,
    fontWeight: "700",
  },
  marca: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titulo: {
    color: "#F0F3F1",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitulo: {
    color: "#A4ADA7",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  cartaoFoto: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 20,
    alignItems: "center",
    padding: 24,
    marginBottom: 18,
  },
  areaFoto: {
    position: "relative",
    marginBottom: 14,
  },
  foto: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
  },
  fotoVazia: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  letraAvatar: {
    fontSize: 44,
    fontWeight: "800",
  },
  botaoCamera: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
  },
  iconeCamera: {
    color: "#101312",
    fontSize: 20,
    fontWeight: "800",
  },
  linkFoto: {
    fontSize: 14,
    fontWeight: "700",
  },
  carregandoFoto: {
    marginVertical: 5,
  },
  email: {
    color: "#A4ADA7",
    fontSize: 13,
    marginTop: 12,
  },
  cartao: {
    backgroundColor: "#191E1B",
    borderWidth: 1,
    borderColor: "#2B332E",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
  },
  tituloSecao: {
    color: "#F0F3F1",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 18,
  },
  descricaoSecao: {
    color: "#A4ADA7",
    fontSize: 13,
    marginTop: -10,
    marginBottom: 18,
    lineHeight: 19,
  },
  gradeTemas: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  opcaoTema: {
    width: "47%",
    minHeight: 94,
    backgroundColor: "#101312",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  amostraCor: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  marcaSelecionado: {
    color: "#101312",
    fontSize: 18,
    fontWeight: "900",
  },
  nomeTema: {
    color: "#E5EAE6",
    fontSize: 13,
    fontWeight: "700",
  },
  previaTema: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 10,
    gap: 8,
  },
  pontoPrevia: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  textoPrevia: {
    color: "#A4ADA7",
    fontSize: 13,
  },
  rotulo: {
    color: "#E5EAE6",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#101512",
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: "#F0F3F1",
    marginBottom: 12,
  },
  botaoPrincipal: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  botaoDesabilitado: {
    opacity: 0.65,
  },
  gradeDatasRelatorio: {
    flexDirection: "column",
    gap: 12,
    marginBottom: 10,
    width: "100%",
    minWidth: 0,
  },
  campoDataRelatorio: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    gap: 6,
  },
  inputDataRelatorio: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#354039",
    borderRadius: 10,
    backgroundColor: "#101512",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#E5EAE6",
    fontSize: 14,
  },
  botaoSecundario: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    backgroundColor: "#101512",
  },
  textoBotaoSecundario: {
    fontWeight: "800",
    fontSize: 14,
  },
  textoBotaoPrincipal: {
    color: "#101312",
    fontWeight: "800",
    fontSize: 15,
  },
});
