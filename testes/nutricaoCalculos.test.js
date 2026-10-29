const assert = require("node:assert/strict");
const { carregar } = require("./suporte.cjs");
const calculos = carregar("servicos/nutricaoCalculos.ts");
const metabolismo = carregar("servicos/metabolismo.ts");
const treino = carregar("servicos/caloriasTreino.ts", { "./metabolismo": metabolismo });
const cardio = carregar("servicos/caloriasCardio.ts", { "./metabolismo": metabolismo });

const perfil = { pesoKg: 80, alturaCm: 175, idade: 30, sexo: "masculino" };
const config = {
  id: "config1", usuarioId: "u1", vigenteDesde: "2026-10-01", objetivo: "manter",
  metaKcal: 2000, metaProteinas: 100, metaCarboidratos: 200, metaGorduras: 70,
  perfil, repousoKcal: 1749, fatorRotina: 1.2, baseDiariaKcal: 2000,
  toleranciaKcal: 100, restricaoAutomatica: false, metodo: "repouso-rotina-v1",
  criadoEm: "2026-10-01T12:00:00Z",
};
const item = {
  id: "item1", alimentoId: "a1", nome: "Alimento", marca: "", preparo: "cozido", fonte: "Rótulo",
  gramas: 125, baseGramas: 100,
  nutrientesBase: { kcal: 200, proteinas: 8, carboidratos: 30, gorduras: 6 }, consumido: true,
};
const modelo = {
  id: "m1", usuarioId: "u1", grupoId: "grupo1", nome: "Minha dieta", versao: 1,
  vigenteDesde: "2026-10-01", criadoEm: "2026-10-01T12:00:00Z",
  refeicoes: [{ id: "r1", nome: "Almoço", horario: "12:00", itens: [item] }],
};
const json = (valor) => JSON.parse(JSON.stringify(valor));
function diario(kcal, data = "2026-10-26", concluido = true) {
  const dia = calculos.criarDia("u1", data, config);
  dia.refeicoes[0].itens = [{ ...item, gramas: 100, nutrientesBase: { kcal, proteinas: 10, carboidratos: 10, gorduras: 10 } }];
  dia.concluido = concluido;
  return dia;
}
const atividade = (modificacoes = {}) => ({
  id: "treino1", tipo: "musculacao", data: "2026-10-26", nome: "Treino",
  caloriasAtivas: 300, minutos: 40, pendente: false, ...modificacoes,
});

assert.equal(metabolismo.calcularGastoRepouso(perfil), 1749);
assert.equal(metabolismo.calcularGastoRepouso({ ...perfil, sexo: "feminino" }), 1583);
assert.equal(metabolismo.calcularGastoRepouso({ ...perfil, idade: 17 }), null);
assert.equal(metabolismo.calcularGastoRepouso({ ...perfil, pesoKg: NaN }), null);
assert.equal(metabolismo.calcularGastoRepouso(null), null);
assert.equal(treino.estimarCaloriasAtivasTreino({ ...perfil, duracaoMinutos: 30, intensidade: "moderada", series: [{ exercise_name: "A", set_number: 1, reps: 10, weight_kg: 20 }] }).caloriasAtivas, 111);
assert.equal(cardio.estimarCaloriasAtivas({ ...perfil, tipo: "caminhada", intensidade: "moderada", duracaoMinutos: 30 }).caloriasAtivas, 123);

for (const [texto, esperado] of [["0", 0], ["0,6", 0.6], ["125.5", 125.5], [" ,5 ", 0.5], ["12,", 12]])
  assert.equal(calculos.numeroNutricional(texto), esperado);
for (const texto of ["", "-1", "1,2.3", "Infinity", "1e3", "1 000", "abc"])
  assert.equal(calculos.numeroNutricional(texto), null, texto);
assert.equal(calculos.deslocarDia("2024-02-28", 1), "2024-02-29");
assert.equal(calculos.deslocarDia("2026-12-31", 1), "2027-01-01");
assert.deepEqual(json(calculos.semanaDaData("2026-11-01")), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
assert.throws(() => calculos.deslocarDia("2026-02-30", 1), /Data inválida/);
assert.throws(() => calculos.semanaDaData("2026-2-1"), /Data inválida/);
const ids = Array.from({ length: 100 }, () => calculos.novoIdNutricao());
assert.equal(new Set(ids).size, ids.length);
assert.ok(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));

assert.deepEqual(json(calculos.nutrientesItem(item)), { kcal: 250, proteinas: 10, carboidratos: 37.5, gorduras: 7.5 });
const refeicoes = [{ id: "r1", nome: "Almoço", horario: "", itens: [item, { ...item, id: "item2", consumido: false }] }];
assert.equal(calculos.somarNutrientes(refeicoes).kcal, 250);
assert.equal(calculos.somarNutrientes(refeicoes, false).kcal, 500);
assert.throws(() => calculos.nutrientesItem({ ...item, baseGramas: 0 }), /Confira/);
assert.throws(() => calculos.validarAlimento({ nome: "", baseGramas: 100, nutrientes: item.nutrientesBase }), /nome/);
assert.throws(() => calculos.validarAlimento({ nome: "A", baseGramas: 100, nutrientes: { ...item.nutrientesBase, kcal: NaN } }), /Calorias/);
calculos.validarAlimento({ nome: "A", baseGramas: 100, nutrientes: { kcal: 0, proteinas: 0, carboidratos: 0, gorduras: 0 } });

const diaModelo = calculos.criarDia("u1", "2026-10-26", config, modelo);
assert.equal(diaModelo.refeicoes[0].itens[0].consumido, false, "Plano não vira consumo automaticamente");
assert.notEqual(diaModelo.refeicoes[0].id, modelo.refeicoes[0].id);
assert.notEqual(diaModelo.refeicoes[0].itens[0].id, item.id);
assert.notEqual(diaModelo.configuracao, config, "Configuração é um snapshot");
assert.notEqual(diaModelo.configuracao.perfil, perfil);
diaModelo.refeicoes[0].itens[0].consumido = true;
assert.equal(calculos.aplicarModelo(diaModelo, modelo), diaModelo, "Reaplicar mesma versão é idempotente e preserva consumo");
assert.equal(calculos.planejarRefeicaoDoModelo(diaModelo, modelo, "r1"), diaModelo, "Uma dieta já aplicada reconhece a origem de cada refeição");
assert.throws(() => calculos.aplicarModelo(diaModelo, { ...modelo, id: "m2" }), /já tem alimentos/);
assert.throws(() => calculos.aplicarModelo(calculos.criarDia("u1", "2026-10-26", config), { ...modelo, vigenteDesde: "2026-10-27" }), /não está disponível/);
const copia = calculos.copiarDia(diaModelo, "2026-10-27");
assert.notEqual(copia.id, diaModelo.id);
assert.notEqual(copia.refeicoes[0].itens[0].id, diaModelo.refeicoes[0].itens[0].id);
assert.equal(copia.refeicoes[0].itens[0].consumido, false);
assert.equal(copia.concluido, false);
assert.throws(() => calculos.copiarDia(diaModelo, diario(100, "2026-10-28")), /já tem alimentos/);
assert.throws(() => calculos.copiarDia(diaModelo, "2026-10-26"), /outro dia/);
const configNova = { ...config, id: "config2", vigenteDesde: "2026-10-28", metaKcal: 2200 };
assert.equal(calculos.configuracaoNaData([configNova, config], "2026-10-27").id, config.id);
assert.equal(calculos.configuracaoNaData([configNova, config], "2026-10-28").id, configNova.id);
const modeloNovo = { ...modelo, id: "m2", versao: 2, vigenteDesde: "2026-10-28" };
const prefs = { modeloPadraoId: "m2", repetirDiariamente: true, repetirDesde: "2026-10-01", favoritos: [], recentes: [] };
assert.equal(calculos.modeloNaData([modelo, modeloNovo], prefs, "2026-10-27").id, "m1");
assert.equal(calculos.modeloNaData([modelo, modeloNovo], prefs, "2026-10-28").id, "m2");
assert.equal(calculos.modeloNaData([modelo], { ...prefs, repetirDiariamente: false }, "2026-10-28"), null);

const baseRefeicao = calculos.criarDia("u1", "2026-10-26", config);
const baseAntes = json(baseRefeicao), modeloAntes = json(modelo);
const individual = calculos.planejarRefeicaoDoModelo(baseRefeicao, modelo, "r1");
assert.equal(individual.id, baseRefeicao.id);
assert.equal(individual.configuracao, baseRefeicao.configuracao);
assert.equal(individual.refeicoes.length, 4, "Usa o slot vazio de mesmo nome sem criar duas refeições homônimas");
const almocoIndividual = individual.refeicoes.find((r) => r.nome === "Almoço");
assert.equal(almocoIndividual.origemModeloId, modelo.id);
assert.equal(almocoIndividual.origemRefeicaoId, "r1");
assert.notEqual(almocoIndividual.id, "r1");
assert.notEqual(almocoIndividual.itens[0].id, item.id);
assert.equal(almocoIndividual.itens[0].consumido, false);
assert.deepEqual(json(baseRefeicao), baseAntes, "A cópia não muda o diário original");
assert.deepEqual(json(modelo), modeloAntes, "A cópia não muda a dieta salva");
assert.equal(calculos.planejarRefeicaoDoModelo(individual, modelo, "r1"), individual, "Repetir a ação não duplica itens ou refeições");
almocoIndividual.itens[0].gramas = 50;
almocoIndividual.itens[0].consumido = true;
assert.equal(calculos.planejarRefeicaoDoModelo(individual, modelo, "r1"), individual, "Repetir preserva ajustes e consumo do dia");
assert.equal(modelo.refeicoes[0].itens[0].gramas, 125);
const comAlmocoProprio = { ...baseRefeicao, refeicoes: baseRefeicao.refeicoes.map((r) => r.nome === "Almoço" ? { ...r, itens: [{ ...item }] } : r) };
const adicionado = calculos.planejarRefeicaoDoModelo(comAlmocoProprio, modelo, "r1");
assert.equal(adicionado.refeicoes.length, 5, "Uma refeição própria com itens não é substituída");
assert.equal(adicionado.refeicoes.find((r) => r.id === comAlmocoProprio.refeicoes[1].id).itens[0].consumido, true);
assert.throws(() => calculos.planejarRefeicaoDoModelo({ ...baseRefeicao, concluido: true }, modelo, "r1"), /Reabra/);
assert.throws(() => calculos.planejarRefeicaoDoModelo(baseRefeicao, { ...modelo, usuarioId: "u2" }, "r1"), /usuário/);
assert.throws(() => calculos.planejarRefeicaoDoModelo(baseRefeicao, modelo, "ausente"), /encontrada/);
assert.throws(() => calculos.planejarRefeicaoDoModelo(baseRefeicao, { ...modelo, vigenteDesde: "2026-10-27" }, "r1"), /disponível/);

const completo = calculos.analisarDia(diario(2000), [atividade()], "2026-10-26", "2026-10-28");
assert.equal(completo.gastoExercicio, 300);
assert.equal(completo.gastoTotal, 2300, "Soma apenas kcal ativas uma vez à rotina sem treino");
assert.equal(completo.saldo, -300);
assert.equal(completo.deficit, 300);
assert.equal(completo.diferencaMeta, 0, "Meta alimentar é independente do balanço energético");
assert.equal(completo.situacao, "deficit");
const duplicado = calculos.analisarDia(diario(2000), [atividade(), atividade({ pendente: true }), atividade()], "2026-10-26", "2026-10-28");
assert.equal(duplicado.gastoExercicio, 300);
assert.equal(duplicado.sessoes, 1);
assert.equal(duplicado.pendentes, 0, "Versão confirmada prevalece sobre cache pendente");
const parcial = calculos.analisarDia(diario(10, "2026-10-26", false), [atividade()], "2026-10-26", "2026-10-28");
assert.equal(parcial.situacao, "parcial");
assert.equal(parcial.saldo, null);
assert.equal(parcial.deficit, 0, "Dia ainda aberto não produz déficit aparente");
const pendente = calculos.analisarDia(diario(2000), [atividade({ pendente: true })], "2026-10-26", "2026-10-28");
assert.equal(pendente.situacao, "parcial");
assert.equal(pendente.saldo, null);
const desconhecido = calculos.analisarDia(diario(2000), [atividade({ caloriasAtivas: null })], "2026-10-26", "2026-10-28");
assert.equal(desconhecido.situacao, "insuficiente");
assert.equal(desconhecido.gastoTotal, null);
assert.equal(desconhecido.saldo, null);
assert.equal(desconhecido.desconhecidas, 1);
const vazio = calculos.analisarDia(null, [atividade()], "2026-10-26", "2026-10-28");
assert.equal(vazio.saldo, null, "Diário ausente não é ingestão zero");
assert.equal(vazio.deficit, 0);
assert.equal(vazio.sessoes, 1, "Atividade segue visível sem diário alimentar");
const soPlanejado = calculos.analisarDia(calculos.criarDia("u1", "2026-10-26", config, modelo), [], "2026-10-26", "2026-10-28");
assert.equal(soPlanejado.planejado.kcal, 250);
assert.equal(soPlanejado.consumido.kcal, 0);
assert.equal(soPlanejado.saldo, null);
const futuro = calculos.analisarDia(diario(100, "2026-10-29"), [], "2026-10-29", "2026-10-28");
assert.equal(futuro.situacao, "futuro");
assert.equal(futuro.saldo, null);

const menos = calculos.analisarDia(diario(1850, "2026-10-26"), [], "2026-10-26", "2026-10-28");
const mais = calculos.analisarDia(diario(2250, "2026-10-27"), [], "2026-10-27", "2026-10-28");
const semana = calculos.resumirSemana([menos, mais, parcial, futuro, vazio]);
assert.equal(semana.diasValidos, 2);
assert.equal(semana.consumo, 4100);
assert.equal(semana.gasto, 4000);
assert.equal(semana.saldo, 100);
assert.equal(semana.deficits, 150);
assert.equal(semana.superavits, 250);
assert.equal(semana.mediaSaldo, 50);
assert.equal(semana.faixa, 200, "Faixa semanal soma as faixas dos dias considerados");
assert.equal(semana.situacao, "manutencao");
assert.equal(semana.consumoRegistrado, 4110, "Parciais são informados, mas não entram no saldo");
assert.equal(calculos.resumirSemana([vazio, futuro]).saldo, null);
assert.equal(calculos.resumirSemana([parcial]).situacao, "parcial");
const cobertura = calculos.resumirSemana([menos, parcial, vazio, soPlanejado, desconhecido, futuro]);
assert.equal(cobertura.semRegistros, 2);
assert.equal(cobertura.insuficientes, 1);
assert.equal(cobertura.diasValidos + cobertura.parciais + cobertura.semRegistros + cobertura.insuficientes, 5, "Cobertura não duplica dias sem consumo ou futuros");

console.log("OK — nutrição: quantidades, snapshots, versões, datas, repouso compartilhado, consumo explícito e balanços sem dupla contagem");
