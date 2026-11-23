const assert = require("node:assert/strict");
const path = require("node:path");

function instalarDiagnostico() {
  if (window.__smokeAvancoDiagnostico) return;
  const log = window.__smokeAvancoDiagnostico = { chamadas: [], tamanhos: [], rolagens: [] };
  const guardar = (lista, valor) => { lista.push(valor); if (lista.length > 120) lista.shift(); };
  const cartoes = () => [...document.querySelectorAll('button[aria-label^="Recolher "],button[aria-label^="Expandir "]')].map((node) => ({
    nome: node.getAttribute("aria-label"), top: node.getBoundingClientRect().top,
    offsetTop: node.parentElement.offsetTop, altura: node.parentElement.offsetHeight,
  }));
  for (const metodo of ["scroll", "scrollTo"]) {
    const original = Element.prototype[metodo];
    if (typeof original !== "function") continue;
    Element.prototype[metodo] = function (...args) {
      const chamada = { metodo, tempo: performance.now(), pedido: args[0], antes: this.scrollTop, cartoes: cartoes() };
      guardar(log.chamadas, chamada);
      const resultado = Reflect.apply(original, this, args);
      chamada.imediato = this.scrollTop;
      setTimeout(() => { chamada.depois = this.scrollTop; chamada.cartoesDepois = cartoes(); }, 250);
      return resultado;
    };
  }
  document.addEventListener("scroll", (evento) => {
    if (evento.target instanceof Element) guardar(log.rolagens, { tempo: performance.now(), top: evento.target.scrollTop, cartoes: cartoes() });
  }, true);
  const observados = new WeakSet();
  const tamanhos = new ResizeObserver((entradas) => {
    for (const entrada of entradas) guardar(log.tamanhos, { tempo: performance.now(), altura: entrada.target.offsetHeight, cartoes: cartoes() });
  });
  function observar() {
    for (const node of document.querySelectorAll('button[aria-label^="Recolher "],button[aria-label^="Expandir "]')) {
      const cartao = node.parentElement;
      if (!observados.has(cartao)) { observados.add(cartao); tamanhos.observe(cartao); }
    }
  }
  function iniciar() {
    observar();
    new MutationObserver(observar).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar, { once: true });
}

async function executar({ page, tables, uid, sid, draftKey, output }) {
  if (process.env.SMOKE_AVANCO_DIAGNOSTICO) {
    await page.addInitScript(instalarDiagnostico);
    await page.evaluate(instalarDiagnostico);
  }
  const nomes = ["Agachamento teste", "Remada avanço", "Elevação avanço"];
  const botao = (name) => page.getByRole("button", { name, exact: true });
  let treinoAtivo = true;
  async function aguardarSerie(nome, numero, concluida) {
    if (!treinoAtivo) return;
    await page.waitForFunction(({ key, nome, numero, concluida }) => {
      const serie = JSON.parse(localStorage.getItem(key))?.series.find(
        (s) => s.exercise_name === nome && s.set_number === numero,
      );
      return serie?.concluida === concluida && !serie.pendente;
    }, { key: draftKey, nome, numero, concluida });
    // The queue removes its pending flag before the screen finishes merging
    // the response. Await that visible completion before the next user action.
    await page.getByText("Treino sincronizado.", { exact: true }).waitFor();
  }
  async function concluir(nome, numero) {
    await botao(`Concluir ${nome}, série ${numero}`).click();
    await aguardarSerie(nome, numero, true);
  }
  const expandir = (nome) => botao(`Expandir ${nome}`);
  const recolher = (nome) => botao(`Recolher ${nome}`);

  // These assertions only read layout. Playwright visibility/actions must not
  // scroll the destination into view and accidentally implement the behavior.
  async function conferirDestino(locator, limiteTopo = 280) {
    const prazo = Date.now() + 6000;
    let posicao;
    let estavelDesde = null;
    while (Date.now() < prazo) {
      posicao = await locator.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        let topoVisivel = 0, fimVisivel = window.innerHeight;
        for (let pai = node.parentElement; pai; pai = pai.parentElement) {
          if (!/(auto|scroll|hidden)/.test(getComputedStyle(pai).overflowY)) continue;
          const area = pai.getBoundingClientRect();
          topoVisivel = Math.max(topoVisivel, area.top);
          fimVisivel = Math.min(fimVisivel, area.bottom);
        }
        return { top: rect.top, bottom: rect.bottom, topoVisivel, fimVisivel };
      }).catch(() => null);
      if (posicao && posicao.top >= posicao.topoVisivel - 2 &&
          posicao.top <= limiteTopo && posicao.bottom <= posicao.fimVisivel + 2) {
        estavelDesde ??= Date.now();
        if (Date.now() - estavelDesde >= 250) return;
      } else estavelDesde = null;
      await page.waitForTimeout(50);
    }
    const diagnostico = await locator.evaluate((node) => {
      const ancestrais = [];
      for (let atual = node; atual && ancestrais.length < 10; atual = atual.parentElement) {
        const rect = atual.getBoundingClientRect();
        ancestrais.push({
          tag: atual.tagName, rotulo: atual.getAttribute("aria-label"),
          top: rect.top, bottom: rect.bottom, offsetTop: atual.offsetTop,
          scrollTop: atual.scrollTop, scrollHeight: atual.scrollHeight,
          clientHeight: atual.clientHeight, overflowY: getComputedStyle(atual).overflowY,
        });
      }
      const log = window.__smokeAvancoDiagnostico;
      return { viewport: window.innerHeight, ancestrais, log: log && {
        chamadas: log.chamadas.slice(-8), tamanhos: log.tamanhos.slice(-8), rolagens: log.rolagens.slice(-8),
      } };
    }).catch(() => null);
    assert.fail(`O avanço deve deixar o destino visível após recolher o cartão: ${JSON.stringify({ posicao, diagnostico })}`);
  }

  async function concluirDuas(nome, destino, limiteTopo) {
    await concluir(nome, 1);
    assert.equal(await recolher(nome).count(), 1, "A primeira série mantém o exercício aberto");
    await concluir(nome, 2);
    await expandir(nome).waitFor();
    assert.equal(await botao(`Desmarcar ${nome}, série 1`).count(), 0);
    await conferirDestino(destino, limiteTopo);
  }

  async function reabrirDesmarcarEAdicionar(nome, destino) {
    await expandir(nome).click();
    await botao(`Desmarcar ${nome}, série 1`).click();
    await aguardarSerie(nome, 1, false);
    assert.equal(await recolher(nome).count(), 1);
    await botao(`Adicionar série em ${nome}`).click();
    await concluir(nome, 1);
    assert.equal(await recolher(nome).count(), 1, "Uma nova série pendente mantém o cartão aberto");
    await concluir(nome, 3);
    await expandir(nome).waitFor();
    await conferirDestino(destino);
  }

  const sessoesAntes = tables.workout_sessions.length;
  await page.getByRole("button", { name: /Continuar treino: Plano teste|^Continuar Plano teste$/ }).first().click();
  await recolher(nomes[0]).waitFor();
  await concluirDuas(nomes[0], recolher(nomes[1]));
  await reabrirDesmarcarEAdicionar(nomes[0], recolher(nomes[1]));
  await concluirDuas(nomes[1], recolher(nomes[2]));
  await concluirDuas(nomes[2], page.getByText("Encerrar e revisar", { exact: true }), 740);
  await page.waitForFunction((key) => {
    const draft = JSON.parse(localStorage.getItem(key));
    return draft?.series.length === 7 && draft.series.every((serie) => serie.concluida && !serie.pendente);
  }, draftKey);
  assert.equal(tables.workout_sessions.length, sessoesAntes);
  assert.equal(tables.workout_sessions.find((sessao) => sessao.id === sid).status, "em_andamento");
  assert.equal(await page.evaluate((key) => Boolean(JSON.parse(localStorage.getItem(key)).finalizacao), draftKey), false);
  await page.screenshot({ path: path.join(output, "web-avanco-treino-ativo.png") });

  await page.reload();
  treinoAtivo = false;
  await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
  await page.getByText("Frequência", { exact: true }).click();
  await page.getByText("Registrar cardio", { exact: true }).waitFor();
  // A past month without fixture sessions keeps the manual entry independent
  // from the active session and yesterday's completed workout.
  await page.getByText("‹", { exact: true }).click();
  await page.getByText("‹", { exact: true }).click();
  await page.getByText("15", { exact: true }).click();
  await page.getByText("Plano teste", { exact: true }).filter({ visible: true }).first().click();
  await recolher(nomes[0]).waitFor();
  assert.equal(await expandir(nomes[0]).count(), 0, "Um novo formulário começa com os exercícios abertos");
  const registrosAntes = {
    sessoes: JSON.stringify(tables.workout_sessions),
    series: JSON.stringify(tables.workout_sets),
  };
  await concluirDuas(nomes[0], recolher(nomes[1]));
  await reabrirDesmarcarEAdicionar(nomes[0], recolher(nomes[1]));
  await concluirDuas(nomes[1], recolher(nomes[2]));
  const resumo = page.getByText("Como foi o treino?", { exact: true });
  await concluirDuas(nomes[2], resumo);
  // Completing manually collapsed cards does not resize those cards. The
  // mark-all action must still measure and reveal the summary after commit.
  for (const nome of nomes.slice(1)) {
    await expandir(nome).click();
    await botao(`Desmarcar ${nome}, série 2`).click();
    assert.equal(await recolher(nome).count(), 1);
    await recolher(nome).click();
    assert.equal(await expandir(nome).count(), 1);
  }
  await botao("Marcar todas as séries deste registro").click();
  for (const nome of nomes) await expandir(nome).waitFor();
  await conferirDestino(resumo);
  assert.equal(tables.workout_sessions.length, sessoesAntes);
  assert.equal(JSON.stringify(tables.workout_sessions), registrosAntes.sessoes, "Concluir séries não confirma o registro manual");
  assert.equal(JSON.stringify(tables.workout_sets), registrosAntes.series, "A Frequência só grava depois da confirmação explícita");
  assert.ok(tables.workout_sessions.every((sessao) => sessao.user_id === uid));
  await page.screenshot({ path: path.join(output, "web-avanco-frequencia.png") });
  console.log("OK UI — avanço após recolhimento no treino ativo e Frequência, reabertura, nova série e resumo sem salvar automaticamente");
}

module.exports = { executar };
