// Browser isolado e dados fictícios: nenhuma escrita alcança o Supabase real.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || env.match(/^EXPO_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1] || "https://ci-placeholder.supabase.co";
const backend = new URL(supabaseUrl).origin;
const authKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const uid = "11111111-1111-4111-8111-111111111111";
const agora = Date.now();
const usuario = { id: uid, aud: "authenticated", role: "authenticated", email: "nutricao@example.invalid", created_at: new Date(agora).toISOString(), app_metadata: { provider: "email" }, user_metadata: { nome: "Teste nutrição", peso_kg: 80, altura_cm: 175, idade: 30, sexo: "masculino", tema_cor: "#35D07F" } };
const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const sessao = { access_token: `${enc({ alg: "HS256" })}.${enc({ sub: uid, role: "authenticated", aud: "authenticated", exp: Math.floor(agora / 1000) + 3600 })}.fixture`, refresh_token: "fixture", expires_in: 3600, expires_at: Math.floor(agora / 1000) + 3600, token_type: "bearer", user: usuario };
const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const alimento = { id: "22222222-2222-4222-8222-222222222222", usuarioId: null, nome: "Alimento fictício de teste", marca: "", preparo: "Fixture", fonte: "Dados fictícios exclusivos de teste", baseGramas: 100, porcaoNome: "100 g", nutrientes: { kcal: 400, proteinas: 10, carboidratos: 50, gorduras: 17 } };
const tables = { nutrition_days: [], nutrition_goals: [], nutrition_preferences: [], nutrition_templates: [], nutrition_foods: [{ id: alimento.id, user_id: null, name: alimento.nome, document: alimento, revision: 1 }], workout_sessions: [{ id: "33333333-3333-4333-8333-333333333333", user_id: uid, started_at: `${hoje}T15:00:00-03:00`, finished_at: `${hoje}T15:30:00-03:00`, status: "concluido", active_calories: 300, duration_minutes: 30 }], cardio_sessions: [] };
const tipoTabela = { day: "nutrition_days", template: "nutrition_templates", goal: "nutrition_goals", preferences: "nutrition_preferences", food: "nutrition_foods" };
const receipts = new Map();
let offline = false;
const erros = [];
const output = path.join(root, ".test-results", "nutricao", process.env.SMOKE_BROWSER || process.env.SMOKE_BROWSER_CHANNEL || "chromium");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const dist = path.join(root, "dist");
  let file = path.resolve(dist, `.${pathname}`);
  if (!file.startsWith(dist + path.sep) && file !== dist) return res.writeHead(403).end();
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": ({ ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" })[path.extname(file)] || "text/html" });
  fs.createReadStream(file).pipe(res);
});
async function aguardar(condicao) {
  const limite = Date.now() + 10000;
  while (!condicao()) {
    if (Date.now() >= limite) throw new Error("A alteração não chegou ao backend fictício dentro do prazo de teste.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
function filtrar(rows, params) {
  return rows.filter((row) => [...params].every(([campo, filtro]) => {
    if (["select", "order", "offset", "limit", "or"].includes(campo)) return true;
    if (filtro.startsWith("eq.")) return String(row[campo]) === filtro.slice(3);
    if (filtro.startsWith("gte.")) return row[campo] >= filtro.slice(4);
    if (filtro.startsWith("lte.")) return row[campo] <= filtro.slice(4);
    if (filtro.startsWith("lt.")) return row[campo] < filtro.slice(3);
    return true;
  })).slice(Number(params.get("offset") || 0), Number(params.get("offset") || 0) + Number(params.get("limit") || 1000));
}
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browserType = process.env.SMOKE_BROWSER === "webkit" ? webkit : chromium;
  const browser = await browserType.launch({ headless: true, ...(process.env.SMOKE_BROWSER_CHANNEL ? { channel: process.env.SMOKE_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Sao_Paulo", isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (erro) => erros.push(erro.message));
  page.on("dialog", (dialog) => dialog.accept());
  await context.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== backend) return route.fulfill({ status: 200, json: {} });
    if (offline) return route.abort("internetdisconnected");
    if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: url.pathname.endsWith("/user") ? usuario : sessao });
    if (url.pathname.endsWith("/rpc/nutrition_save_document")) {
      const p = req.postDataJSON();
      if (receipts.has(p.p_operation_id)) return route.fulfill({ json: receipts.get(p.p_operation_id) });
      const table = tables[tipoTabela[p.p_type]];
      let linha = table.find((r) => r.id === p.p_id || p.p_type === "day" && r.document.data === p.p_document.data);
      if ((linha?.revision || 0) !== p.p_expected_revision) return route.fulfill({ json: { status: "conflict", id: linha.id, revision: linha.revision, document: linha.document } });
      if (!linha) { linha = { id: p.p_id, user_id: uid, revision: 0 }; table.push(linha); }
      linha.document = { ...p.p_document, ...(p.p_type === "preferences" ? {} : { id: linha.id }) };
      if (p.p_type === "day") linha.local_date = p.p_document.data;
      linha.revision++;
      const resposta = { status: "ok", id: linha.id, revision: linha.revision };
      receipts.set(p.p_operation_id, resposta);
      return route.fulfill({ json: resposta });
    }
    const table = url.pathname.split("/").pop();
    let rows = filtrar(tables[table] || [], url.searchParams);
    if (table === "nutrition_foods") rows = tables.nutrition_foods;
    return route.fulfill({ json: req.headers().accept?.includes("application/vnd.pgrst.object+json") ? rows[0] || null : rows });
  });
  await context.addInitScript(({ authKey, sessao }) => { if (!localStorage.getItem(authKey)) localStorage.setItem(authKey, JSON.stringify(sessao)); }, { authKey, sessao });
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "Abrir nutrição", exact: true }).click();
    await page.getByRole("button", { name: "Metas e ajustes", exact: true }).click();
    await page.getByRole("textbox", { name: "Meta alimentar (kcal/dia)", exact: true }).fill("2000");
    await page.getByRole("textbox", { name: "Gasto diário base sem treinos (kcal)", exact: true }).fill("2500");
    await page.getByRole("button", { name: "Salvar metas", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar alimento em Café da manhã", exact: true }).click();
    await page.getByRole("button", { name: `Escolher ${alimento.nome}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Quantidade em gramas", exact: true }).fill("500");
    await page.getByRole("button", { name: "Adicionar alimento planejado", exact: true }).click();
    await page.getByText("2.000 kcal", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Comi todas as refeições como estão", exact: true }).click();
    await page.getByRole("button", { name: "Concluir registros do dia", exact: true }).click();
    await page.getByRole("button", { name: "Ver balanço de alimentação e exercícios", exact: true }).click();
    await page.getByText("Déficit estimado", { exact: true }).waitFor();
    await page.getByText("−800 kcal", { exact: true }).waitFor();
    assert.equal(tables.nutrition_days[0].document.refeicoes[0].itens.length, 1);
    await page.screenshot({ path: path.join(output, "analise-dia.png"), fullPage: true });
    await page.getByRole("button", { name: "Semana", exact: true }).click();
    await page.getByText("1 dia(s) completos incluídos", { exact: true }).waitFor();
    await page.getByText("Soma dos déficits: 800 kcal", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "analise-semana.png"), fullPage: true });
    await page.getByRole("button", { name: "Hoje", exact: true }).first().click();
    await page.getByRole("button", { name: "Salvar este dia como dieta", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome da dieta", exact: true }).fill("Dieta repetida de teste");
    await page.getByRole("button", { name: "Salvar dieta", exact: true }).click();
    await page.getByRole("button", { name: "Próximo dia ›", exact: true }).click();
    await page.getByRole("button", { name: `Editar ${alimento.nome}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Quantidade em gramas", exact: true }).fill("250");
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await page.waitForFunction(({ uid }) => { const raw = localStorage.getItem(`@treino-familia:nutricao:v1:${uid}`); return raw?.includes('"gramas":250'); }, { uid });
    assert.equal(tables.nutrition_templates[0].document.refeicoes[0].itens[0].gramas, 500);
    await aguardar(() => tables.nutrition_days.some((r) => r.document.data !== hoje && r.document.refeicoes[0]?.itens[0]?.gramas === 250));
    const amanha = tables.nutrition_days.find((r) => r.document.data !== hoje);
    assert.equal(amanha.document.refeicoes[0].itens[0].consumido, false);
    await page.getByRole("button", { name: "Adicionar alimento em Almoço", exact: true }).click();
    await page.getByRole("button", { name: "+ Cadastrar alimento pelo rótulo", exact: true }).click();
    for (const [nome, valor] of [
      ["Nome do alimento", "Rótulo fracionário de teste"],
      ["Origem dos valores nutricionais", "Embalagem fictícia de teste"],
      ["Peso da referência em gramas", "30"],
      ["Nome da porção (ex.: 1 fatia de 30 g)", "1 fatia de 30 g"],
      ["Calorias da referência (kcal)", "100,5"],
      ["Proteínas da referência (g)", "3,2"],
      ["Carboidratos da referência (g)", "15"],
      ["Gorduras da referência (g)", "2.5"],
    ]) await page.getByRole("textbox", { name: nome, exact: true }).fill(valor);
    await page.getByRole("button", { name: "Salvar alimento e informar quantidade", exact: true }).click();
    await page.getByRole("button", { name: "Porções", exact: true }).click();
    await page.getByRole("textbox", { name: "Quantidade de porções (1 fatia de 30 g)", exact: true }).fill("1,5");
    await page.getByText("151 kcal nesta quantidade", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Adicionar alimento planejado", exact: true }).click();
    await aguardar(() => amanha.document.refeicoes[1]?.itens[0]?.gramas === 45);
    assert.equal(amanha.document.refeicoes[1].itens[0].nutrientesBase.kcal, 100.5);
    assert.equal(amanha.document.refeicoes[1].itens[0].nutrientesBase.gorduras, 2.5);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      await page.getByRole("button", { name: "Minha dieta", exact: true }).click();
      await page.getByRole("button", { name: "Ver e editar dieta", exact: true }).click();
      await page.getByRole("button", { name: "Registrar refeição Café da manhã no diário", exact: true }).click();
      await page.getByRole("button", { name: "Salvar dieta", exact: true }).waitFor({ state: "hidden" });
      await page.getByText("Refeição adicionada ao planejamento do dia selecionado.", { exact: false }).first().waitFor();
    }
    await aguardar(() => amanha.document.refeicoes[0]?.itens[0]?.gramas === 250);
    assert.equal(amanha.document.refeicoes.filter((r) => r.nome === "Café da manhã").length, 1);
    await page.getByRole("button", { name: "Dia anterior", exact: false }).click();
    await page.getByRole("button", { name: "Reabrir registros para corrigir", exact: true }).click();
    offline = true;
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline")); });
    await page.getByRole("button", { name: `Editar ${alimento.nome}`, exact: true }).click();
    await page.getByRole("button", { name: "Remover deste dia", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Abrir nutrição", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: `Editar ${alimento.nome}`, exact: true }).count(), 0);
    offline = false;
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); window.dispatchEvent(new Event("online")); });
    await page.getByRole("button", { name: "Sincronizar", exact: true }).click();
    await page.waitForFunction(({ uid }) => { const raw = localStorage.getItem(`@treino-familia:nutricao:v1:${uid}`); return raw && !Object.values(JSON.parse(raw).entradas).some((e) => e.fila.length); }, { uid });
    assert.equal(tables.nutrition_days.find((r) => r.document.data === hoje).document.refeicoes[0].itens.length, 0);
    assert.deepEqual(erros, []);
    await page.screenshot({ path: path.join(output, "diario-apos-exclusao.png"), fullPage: true });
    console.log("OK — Nutrição web: metas, catálogo, quantidades, rótulo manual, porções e decimais, consumo, déficit com treino, dieta repetida, exceção diária e exclusão offline persistente.");
  } catch (erro) { await page.screenshot({ path: path.join(output, "falha.png"), fullPage: true }); fs.writeFileSync(path.join(output, "falha.txt"), (await page.locator("body").innerText()) + "\n" + erros.join("\n")); throw erro; }
  finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((erro) => { console.error(erro); server.close(); process.exitCode = 1; });
