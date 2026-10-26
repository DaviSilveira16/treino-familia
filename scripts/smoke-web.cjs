// Isolated browser + fictional backend. Every non-local request is intercepted.
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const output = path.join(root, ".test-results", process.env.SMOKE_BROWSER || "chromium"); fs.mkdirSync(output, { recursive: true });
const env = fs.existsSync(path.join(root, ".env")) ? fs.readFileSync(path.join(root, ".env"), "utf8") : "";
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || env.match(/^EXPO_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1] || "https://ci-placeholder.supabase.co";
const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
const now = Date.now(), uid = "11111111-1111-4111-8111-111111111111", pid = "22222222-2222-4222-8222-222222222222", eid = "33333333-3333-4333-8333-333333333333", sid = "44444444-4444-4444-8444-444444444444";
const user = { id: uid, aud: "authenticated", role: "authenticated", email: "teste@example.invalid", created_at: new Date(now).toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { nome: "Conta de teste", tema_cor: "#35D07F", peso_kg: 80, altura_cm: 175, idade: 30, sexo: "masculino" } };
const encode = data => Buffer.from(JSON.stringify(data)).toString("base64url");
const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, aud: "authenticated", role: "authenticated", exp: Math.floor(now / 1000) + 3600, iat: Math.floor(now / 1000) })}.fixture-not-a-real-signature`;
const session = { access_token, refresh_token: "fixture-not-a-real-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user };
const active = { id: sid, user_id: uid, plan_id: pid, started_at: new Date(now - 600000).toISOString(), finished_at: null, status: "em_andamento", notes: null };
const oldSession = { ...active, id: "55555555-5555-4555-8555-555555555555", status: "concluido", started_at: new Date(now - 86400000).toISOString(), finished_at: new Date(now - 85800000).toISOString() };
const tables = {
  workout_plans: [{ id: pid, user_id: uid, name: "Plano teste", created_at: new Date(now).toISOString() }],
  exercises: [{ id: eid, plan_id: pid, user_id: uid, name: "Agachamento teste", sets_goal: 2, reps_goal: "8-12", position: 1, created_at: new Date(now).toISOString() }],
  workout_sessions: [active, oldSession],
  workout_sets: [1, 2].map(set_number => ({ id: `old-set-${set_number}`, session_id: oldSession.id, user_id: uid, exercise_id: eid, exercise_name: "Agachamento teste", set_number, reps: 8, weight_kg: 30 })),
  exercise_load_defaults: [1, 2].map(set_number => ({ id: `default-${set_number}`, exercise_id: eid, user_id: uid, set_number, reps: 10, weight_kg: 20 })),
  family_members: [{ user_id: uid, family_id: "family-a", role: "owner" }],
  families: [{ id: "family-a", name: "Família teste", owner_user_id: uid, invite_code: "TESTE" }, { id: "family-c", name: "Amigos da academia", owner_user_id: "outro-usuario", invite_code: "AMIGOS" }],
  community_posts: Array.from({ length: 12 }, (_, i) => ({ id: `post-${String(i).padStart(2, "0")}`, family_id: "family-a", user_id: uid, author_name: "Teste", content: `Publicação de teste ${i + 1}`, post_type: "texto", image_path: null, workout_plan_name: null, workout_snapshot: null, created_at: new Date(now - i * 60000).toISOString() })),
  cardio_activities: [{ id: "cardio-a", user_id: uid, nome: "Escadas teste", tipo: "Escadas", duracao_min: 10, distancia_km: null, calorias: null, observacoes: null }], cardio_sessions: [],
};
let backendOffline = false, feedPages = 0;
let holdSync = false, releaseSync;
let holdDetailsSid = null, releaseDetails;
let releasePost, releaseFeed, holdPost = false, holdFeedFamily = null, postCounter = 0;
const server = http.createServer((req, res) => {
  let requestPath; try { requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400).end(); return; }
  const dist = path.resolve(root, "dist"), file = path.resolve(dist, `.${requestPath}`);
  if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403).end(); return; }
  let target = file; if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(dist, "index.html");
  const type = { ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" }[path.extname(target)] || "text/html";
  res.writeHead(200, { "Content-Type": type }); fs.createReadStream(target).pipe(res);
});
function filtered(table, search) {
  let rows = [...(tables[table] || [])];
  if (table === "workout_sessions" && (search.get("select") || "").includes("workout_sets!inner")) rows = rows.map(row => ({ ...row, workout_sets: tables.workout_sets.filter(set => set.session_id === row.id && set.exercise_id === eid) })).filter(row => row.workout_sets.length);
  for (const [key, value] of search) {
    if (key.includes(".") || ["select", "order", "limit", "offset", "or"].includes(key)) continue;
    const i = value.indexOf("."), operator = value.slice(0, i), expected = value.slice(i + 1);
    rows = rows.filter(row => operator === "eq" ? String(row[key]) === expected : operator === "neq" ? String(row[key]) !== expected : operator === "gte" ? row[key] >= expected : operator === "gt" ? row[key] > expected : operator === "lt" ? row[key] < expected : operator === "in" ? expected.slice(1, -1).split(",").map(v => v.replaceAll('"', "")).includes(String(row[key])) : true);
  }
  const cursor = search.get("or")?.match(/(created_at|started_at)\.lt\."([^"]+)"/), cursorId = search.get("or")?.match(/id\.lt\."([^"]+)"/);
  if (cursor) rows = rows.filter(row => row[cursor[1]] < cursor[2] || (row[cursor[1]] === cursor[2] && row.id < cursorId?.[1]));
  const orders = (search.get("order") || "").split(",").filter(Boolean);
  rows.sort((a, b) => { for (const order of orders) { const [key, direction] = order.split("."); if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * (direction === "desc" ? -1 : 1); } return 0; });
  return rows.slice(Number(search.get("offset") || 0), Number(search.get("offset") || 0) + Number(search.get("limit") || 1000));
}
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await (process.env.SMOKE_BROWSER === "webkit" ? webkit : chromium).launch({ headless: true });
  let activePage;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let phase = "initial";
    let forcedOffline = false, offlineReports = 0;
    const cancelledRequests = new Set(), nativeFetchReports = [], fetchFailures = [];
    await context.exposeBinding("__smokeCancelledFetch", (_, url) => { cancelledRequests.add(url); });
    await context.exposeBinding("__smokeFetchFailure", (_, failure) => { fetchFailures.push(failure); });
    const setOffline = async value => { forcedOffline = value; await context.setOffline(value); };
    const errors = []; const page = await context.newPage(); activePage = page; page.on("pageerror", error => {
      // WebKit relata a falha nativa de fetch como ErrorEvent ao forçar offline,
      // mesmo quando a rejeição é tratada. Não confundir com erro de JS/CORS online.
      const nativeUrl = (error.stack || "").match(/Fetch API cannot load (https?:\/\/\S+) due to access control checks\./)?.[1];
      if (process.env.SMOKE_BROWSER === "webkit" && nativeUrl?.startsWith(`${supabaseUrl}/`)) {
        nativeFetchReports.push({ url: nativeUrl, offline: forcedOffline, at: Date.now() }); return;
      }
      errors.push(error.message); console.error("PAGE ERROR", phase, error.stack || error.message);
    }); page.on("dialog", dialog => dialog.accept());
    page.on("requestfailed", request => {
      const reason = request.failure()?.errorText || "";
      if (/cancelled|canceled|ERR_ABORTED/i.test(reason)) cancelledRequests.add(request.url());
      else if (!forcedOffline) console.error("REQUEST FAILED", phase, new URL(request.url()).pathname, reason);
    });
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (!url.hostname.endsWith(".supabase.co")) return route.abort();
      const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": request.headers()["access-control-request-headers"] || "authorization,apikey,content-type,x-client-info,prefer,range,accept,content-profile,accept-profile", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "content-type": "application/json" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      // Simula serviço indisponível com CORS válido; setOffline cobre a queda real de rede.
      if (backendOffline) return route.fulfill({ status: 503, json: { message: "Serviço temporariamente indisponível" }, headers });
      if (url.pathname === "/auth/v1/user") {
        if (holdSync) { holdSync = false; await new Promise(resolve => { releaseSync = resolve; }); return route.fulfill({ status: 503, json: { message: "Serviço temporariamente indisponível" }, headers }); }
        return route.fulfill({ json: user, headers });
      }
      if (url.pathname.endsWith("/rpc/entrar_na_familia_por_codigo")) {
        const family = tables.families.find(f => f.invite_code === request.postDataJSON().p_codigo);
        if (!family) return route.fulfill({ status: 400, json: { message: "Convite inválido" }, headers });
        if (!tables.family_members.some(m => m.user_id === uid && m.family_id === family.id)) tables.family_members.push({ user_id: uid, family_id: family.id, role: "member" });
        return route.fulfill({ json: true, headers });
      }
      if (url.pathname.endsWith("/rpc/resumo_painel_familia_por_id")) {
        const id = request.postDataJSON().p_family_id;
        return route.fulfill({ json: [{ family_id: id, user_id: uid, display_name: `Participante de ${id}`, workouts_this_week: 1 }, { family_id: "fora-do-grupo", user_id: "outro", display_name: "Não exibir outro grupo" }], headers });
      }
      if (url.pathname.includes("/rpc/")) return route.fulfill({ json: url.pathname.endsWith("tf_resumo_semanal") ? { treinos: 1, cardios: 0, minutos: 10, calorias: 0, caloriasDisponiveis: 0 } : [], headers });
      const table = url.pathname.split("/").pop(); if (!(table in tables)) return route.fulfill({ json: [], headers });
      if (table === "community_posts") feedPages++;
      let rows = filtered(table, url.searchParams);
      if (table === "community_posts" && request.method() === "GET" && url.searchParams.get("family_id") === `eq.${holdFeedFamily}`) {
        holdFeedFamily = null; await new Promise(resolve => { releaseFeed = resolve; });
        return route.fulfill({ json: rows, headers }).catch(() => {});
      }
      if (["POST", "PATCH"].includes(request.method())) {
        const body = request.postDataJSON();
        if (table === "workout_sessions" && request.method() === "PATCH" && !body.status && url.searchParams.get("id") === `eq.${holdDetailsSid}`) {
          holdDetailsSid = null; await new Promise(resolve => { releaseDetails = resolve; });
        }
        if (table === "community_posts" && request.method() === "POST") {
          if (holdPost) { holdPost = false; await new Promise(resolve => { releasePost = resolve; }); }
          Object.assign(body, { id: `post-novo-${++postCounter}`, created_at: new Date().toISOString() });
        }
        if (request.method() === "POST") {
          const inserted = Array.isArray(body) ? body : [body];
          if (table === "families") { body.invite_code = "NOVAFAMILIA"; tables.family_members.push({ user_id: body.owner_user_id, family_id: body.id, role: "owner" }); }
          tables[table].push(...inserted); rows = inserted;
        }
        else rows.forEach(row => Object.assign(row, body));
      }
      const one = request.headers().accept?.includes("application/vnd.pgrst.object+json");
      return route.fulfill({ json: one ? rows[0] || null : rows, headers: { ...headers, "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" } });
    });
    await page.goto(origin); await page.getByText("Bem-vindo de volta!", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "web-login.png") });
    const draftKey = `@treino-familia:rascunho:v1:${uid}:${pid}`;
    await context.addInitScript(({ key, auth, draftKey, uid, pid, sid, eid, start }) => {
      Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      // Comprova cancelamento pelo sinal real, inclusive quando o WebKit não
      // emite requestfailed por ter cancelado antes de criar a requisição HTTP.
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const signal = init?.signal || (typeof input === "object" && input !== null && "signal" in input ? input.signal : null);
        const url = typeof input === "object" && input !== null && "url" in input ? input.url : new URL(String(input), location.href).href;
        const offlineAtStart = navigator.onLine === false;
        const report = () => { void window.__smokeCancelledFetch(url).catch(() => {}); };
        if (signal?.aborted) report();
        else signal?.addEventListener("abort", report, { once: true });
        return nativeFetch(input, init).catch(error => {
          void window.__smokeFetchFailure({ url, offline: offlineAtStart, aborted: Boolean(signal?.aborted), at: Date.now(), name: error.name }).catch(() => {});
          throw error;
        }).finally(() => signal?.removeEventListener("abort", report));
      };
      localStorage.setItem(key, JSON.stringify(auth));
      if (!localStorage.getItem("@smoke:rascunho-inicial")) {
        localStorage.setItem(draftKey, JSON.stringify({ versao: 1, usuarioId: uid, planId: pid, planName: "Plano teste", sessao: { id: sid, plan_id: pid, started_at: start }, exercicios: [{ id: eid, name: "Agachamento teste", sets_goal: 2, reps_goal: "8-12" }], series: [1, 2].map(set_number => ({ chave: `${eid}:${set_number}`, exercise_id: eid, exercise_name: "Agachamento teste", set_number, reps: "10", weight_kg: "20", concluida: false })), intensidade: "moderada", esforco: "adequado", salvoEm: start, descanso: { fimEm: Date.now() + 90000, pausado: false, segundosPausados: 0, duracao: 90 } }));
        localStorage.setItem("@smoke:rascunho-inicial", "1");
      }
    }, { key: storageKey, auth: session, draftKey, uid, pid, sid, eid, start: active.started_at });
    await page.reload(); await page.getByText("Olá, Conta de!", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).click();
    const reps = page.getByRole("textbox", { name: "Agachamento teste, série 1, repetições realizadas", exact: true });
    await reps.waitFor(); await page.getByRole("button", { name: /Usar última sessão de Agachamento teste/ }).click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Agachamento teste, série 1, repetições realizadas"]')?.value === "8");
    await reps.fill("14"); await reps.focus(); const element = await reps.elementHandle();
    await page.waitForTimeout(2100); assert.equal(await reps.inputValue(), "14"); assert.equal(await reps.evaluate((node, old) => node === old, element), true);
    phase = "offline";
    await setOffline(true);
    await page.getByRole("button", { name: "Adicionar exercício durante o treino" }).click();
    await page.getByRole("textbox", { name: "Nome do exercício/aparelho", exact: true }).fill("Remada academia viagem");
    await page.getByRole("textbox", { name: "Quantidade de séries", exact: true }).fill("2");
    await page.getByRole("textbox", { name: "Repetições iniciais", exact: true }).fill("12");
    await page.getByRole("textbox", { name: "Carga inicial em kg", exact: true }).fill("18,5");
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(output, "web-editor-exercicio.png") });
    await page.getByRole("button", { name: "Salvar exercício na sessão", exact: true }).click();
    await page.getByRole("button", { name: "Editar Remada academia viagem", exact: true }).click();
    await page.getByRole("textbox", { name: "Carga inicial em kg", exact: true }).fill("20");
    await page.getByRole("button", { name: "Salvar exercício na sessão", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar série em Remada academia viagem", exact: true }).click();
    await page.getByRole("button", { name: "Retirar série 3 de Remada academia viagem", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Concluir Remada academia viagem, série 3", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Concluir Remada academia viagem, série 1", exact: true }).click();
    await page.getByRole("button", { name: "Concluir Agachamento teste, série 1", exact: true }).click();
    await page.getByRole("button", { name: "Desmarcar Agachamento teste, série 1", exact: true }).click();
    await reps.fill("15");
    await page.getByRole("button", { name: "Concluir Agachamento teste, série 1", exact: true }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).series[0].pendente === "salvar", draftKey);
    backendOffline = true; await setOffline(false); await page.reload();
    await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).click();
    await page.getByRole("button", { name: "Desmarcar Remada academia viagem, série 1", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Remada academia viagem, série 1, carga em quilos", exact: true }).inputValue(), "20");
    // Rede aparenta estar online, mas uma requisição fica em voo durante a revisão.
    backendOffline = false; holdSync = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('div')).some(el => el.textContent === "Sincronizando com o Supabase..."));
    const endedBefore = Date.now(); await page.getByText("Finalizar e salvar treino", { exact: true }).click({ timeout: 5000 });
    await page.getByRole("button", { name: "Criar novo treino", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do novo treino", exact: true }).fill("Academia da viagem");
    await page.getByRole("textbox", { name: "Duração do treino em minutos", exact: true }).fill("35");
    await page.getByRole("button", { name: "Intensidade do treino: Intensa", exact: true }).click();
    await page.getByText(/kcal ativas estimadas/).waitFor();
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(output, "web-revisao-treino.png") });
    await page.getByRole("button", { name: "Confirmar conclusão do treino", exact: true }).click();
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key)).finalizacao, draftKey);
    assert.ok(releaseSync, "Conclusão local deve funcionar com requisição de rede em voo");
    backendOffline = true; releaseSync(); await setOffline(true);
    const finish = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).finalizacao.finishedAt, draftKey);
    assert.ok(Date.parse(finish) >= endedBefore);
    await page.screenshot({ path: path.join(output, "web-offline-completion.png") });
    backendOffline = true; await setOffline(false); await page.reload();
    await page.getByText("Conclusão pendente de envio", { exact: false }).first().waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).finalizacao.finishedAt, draftKey), finish);
    backendOffline = false; await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction(key => !localStorage.getItem(key), draftKey, { timeout: 15000 });
    assert.equal(active.finished_at, finish); assert.equal(tables.workout_sets.filter(set => set.session_id === sid).length, 2);
    assert.equal(active.duration_minutes, 35); assert.equal(active.intensity, "intensa"); assert.ok(active.active_calories > 0);
    assert.equal(tables.workout_plans.length, 2); const travel = tables.workout_plans.find(p => p.name === "Academia da viagem"); assert.ok(travel);
    assert.equal(active.plan_id, travel.id); assert.equal(tables.exercises.filter(e => e.plan_id === travel.id).length, 2);
    assert.equal(tables.exercises.filter(e => e.plan_id === pid).length, 1); assert.equal(tables.exercise_load_defaults.find(e => e.exercise_id === eid).weight_kg, 20);
    // Estado do vídeo: conclusão local antiga, conclusão remota diferente, rascunho legado.
    phase = "remote conflict";
    const conflictSid = "66666666-6666-4666-8666-666666666666";
    const serverFinish = new Date(now - 30000).toISOString(), localFinish = new Date(now - 32000).toISOString();
    tables.workout_sessions.push({ ...active, id: conflictSid, plan_id: pid, finished_at: serverFinish });
    const serverBefore = JSON.stringify(tables);
    await page.evaluate(({ draftKey, uid, pid, eid, conflictSid, start, localFinish }) => {
      localStorage.setItem(draftKey, JSON.stringify({ versao: 1, usuarioId: uid, planId: pid, planName: "Plano teste", sessao: { id: conflictSid, plan_id: pid, started_at: start }, exercicios: [{ id: eid, name: "Agachamento teste", sets_goal: 2, reps_goal: "8-12" }], series: [{ chave: `${eid}:1`, exercise_id: eid, exercise_name: "Agachamento teste", set_number: 1, reps: "8", weight_kg: "300", concluida: true }], intensidade: "moderada", esforco: "adequado", salvoEm: start, finalizacao: { finishedAt: localFinish, notes: "Cópia do vídeo", metricas: { duration_minutes: 3 } }, conflitoSincronizacao: true, erroSincronizacao: "Esta sessão foi encerrada ou alterada em outro aparelho." }));
    }, { draftKey, uid, pid, eid, conflictSid, start: active.started_at, localFinish });
    await page.reload();
    await page.waitForFunction(key => !localStorage.getItem(key), draftKey);
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Conclusão pendente: Plano teste/ }).count(), 0, "Conclusão remota dispensa recuperação manual");
    assert.equal(JSON.stringify(tables), serverBefore, "Recuperar não escreve no Supabase");
    const backupKey = `@treino-familia:recuperacao:v1:${uid}:${pid}:${conflictSid}`;
    const preserved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), backupKey);
    assert.equal(preserved.rascunho.series[0].weight_kg, "300");
    assert.equal(preserved.rascunho.finalizacao.finishedAt, localFinish);
    await page.getByText("Meus treinos", { exact: true }).click();
    await page.getByText("Plano teste", { exact: true }).first().click();
    await page.getByText("▶ Iniciar treino com cronômetro", { exact: true }).click();
    await page.getByRole("button", { name: "Ver cópias de segurança deste treino", exact: true }).click();
    await page.getByText(/Agachamento teste · série 1: 8 × 300 kg/).waitFor();
    await page.waitForTimeout(300); // Captura o modal após a animação de entrada.
    await page.screenshot({ path: path.join(output, "web-copia-preservada.png") });
    // O swipe-back fecha o modal primeiro e preserva os dados, sem navegar para fora.
    const swipeBack = async () => page.evaluate(() => {
      const target = document.body;
      const dispatch = (type, x) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = { identifier: 1, target, clientX: x, clientY: 250 };
        Object.defineProperties(event, {
          touches: { value: type === "touchend" ? [] : [touch] },
          targetTouches: { value: type === "touchend" ? [] : [touch] },
          changedTouches: { value: [touch] },
        });
        target.dispatchEvent(event);
      };
      dispatch("touchstart", 15); dispatch("touchmove", 140); dispatch("touchend", 140);
    });
    await swipeBack();
    await page.getByText("Cópias locais preservadas", { exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Pronto para começar?", { exact: true }).waitFor();
    await page.waitForTimeout(350); // Aguarda a animação de fechamento do Modal antes do segundo gesto.
    await swipeBack();
    await page.getByText("Exercícios — Plano teste", { exact: true }).waitFor();
    assert.ok(await page.evaluate(key => localStorage.getItem(key), backupKey));
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    // Estado da nova imagem: a cópia local terminou, mas não há conclusão remota.
    phase = "local resend";
    const missingSid = "77777777-7777-4777-8777-777777777777";
    const missingStart = new Date(now - 2 * 86400000).toISOString();
    const missingFinish = new Date(Date.parse(missingStart) + 178000).toISOString();
    await page.evaluate(({ draftKey, uid, pid, eid, missingSid, missingStart, missingFinish }) => {
      localStorage.setItem(draftKey, JSON.stringify({ versao: 1, usuarioId: uid, planId: pid, planName: "Plano teste", sessao: { id: missingSid, plan_id: pid, started_at: missingStart }, exercicios: [{ id: eid, name: "Agachamento teste", sets_goal: 18, reps_goal: "8" }], series: Array.from({ length: 18 }, (_, i) => ({ chave: `${eid}:${i + 1}`, exercise_id: eid, exercise_name: "Agachamento teste", set_number: i + 1, reps: "8", weight_kg: "300", concluida: i === 0 })), intensidade: "moderada", esforco: "adequado", salvoEm: missingFinish, finalizacao: { finishedAt: missingFinish, notes: "Treino da imagem", metricas: { duration_minutes: 2.97, volume_kg: 2400, sets_completed: 1 } }, conflitoSincronizacao: true, conflitoSessao: true, erroSincronizacao: "Não há uma conclusão válida para esta sessão no servidor." }));
    }, { draftKey, uid, pid, eid, missingSid, missingStart, missingFinish });
    await page.reload();
    await page.getByRole("button", { name: /Conclusão pendente: Plano teste/ }).click();
    await page.getByRole("button", { name: "Usar conclusão do servidor e guardar cópia local", exact: true }).click();
    await page.getByText(/Esta sessão não foi encontrada no servidor/).waitFor();
    await page.screenshot({ path: path.join(output, "web-sessao-ausente-reenvio.png") });
    holdDetailsSid = missingSid;
    await page.getByRole("button", { name: "Enviar treino salvo neste aparelho", exact: true }).click();
    await page.waitForFunction(key => Boolean(JSON.parse(localStorage.getItem(key) || "null")?.encerradaNoServidor), draftKey);
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Conclusão pendente: Plano teste/ }).count(), 0, "Detalhes em voo não mantêm a barra ativa");
    await page.getByRole("button", { name: "Abrir comunidade da família" }).click();
    await page.getByRole("textbox", { name: "Texto para a família selecionada", exact: true }).waitFor();
    assert.ok(releaseDetails, "Detalhes devem continuar na fila depois de fechar a tela ativa");
    releaseDetails();
    await page.waitForFunction(key => !localStorage.getItem(key), draftKey);
    await page.getByRole("textbox", { name: "Texto para a família selecionada", exact: true }).waitFor();
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    const restored = tables.workout_sessions.filter(row => row.id === missingSid);
    assert.equal(restored.length, 1); assert.equal(restored[0].status, "concluido");
    assert.equal(restored[0].started_at, missingStart); assert.equal(restored[0].finished_at, missingFinish); assert.equal(restored[0].volume_kg, 2400);
    assert.equal(tables.workout_sets.filter(row => row.session_id === missingSid).length, 1, "Envia somente a série concluída de 18");
    assert.equal(tables.workout_sets.find(row => row.session_id === missingSid).weight_kg, 300);
    const resendBackup = `@treino-familia:recuperacao:v1:${uid}:${pid}:${missingSid}`;
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).rascunho.series.length, resendBackup), 18);
    await page.reload(); await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Conclusão pendente: Plano teste/ }).count(), 0);
    assert.equal(tables.workout_sessions.filter(row => row.id === missingSid).length, 1);
    phase = "history";
    await page.getByText("Histórico", { exact: true }).click();
    await page.getByText("Volume registrado: 2.400 kg·reps", { exact: true }).click();
    await page.getByText("1 exercícios · 1 séries registradas", { exact: true }).waitFor();
    await page.getByText("300", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "web-treino-reenviado-historico.png") });
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    // Sessão concluída fora desta tela, enquanto o editor do treino está aberto.
    phase = "external completion";
    const externalSid = "88888888-8888-4888-8888-888888888888";
    const externalStart = new Date(now - 3 * 86400000).toISOString();
    const externalSession = { id: externalSid, user_id: uid, plan_id: pid, started_at: externalStart, status: "em_andamento", finished_at: null };
    tables.workout_sessions.push(externalSession);
    tables.workout_sets.push({ id: "external-set", user_id: uid, session_id: externalSid, exercise_id: eid, exercise_name: "Agachamento teste", set_number: 1, reps: 8, weight_kg: 20 });
    await page.evaluate(({ draftKey, uid, pid, eid, externalSid, externalStart }) => {
      localStorage.setItem(draftKey, JSON.stringify({ versao: 1, usuarioId: uid, planId: pid, planName: "Plano teste", sessao: { id: externalSid, plan_id: pid, started_at: externalStart }, exercicios: [{ id: eid, name: "Agachamento teste", sets_goal: 2, reps_goal: "8" }], series: [1, 2].map(set_number => ({ chave: `${eid}:${set_number}`, exercise_id: eid, exercise_name: "Agachamento teste", set_number, reps: "8", weight_kg: "20", concluida: set_number === 1 })), intensidade: "moderada", esforco: "adequado", salvoEm: externalStart }));
    }, { draftKey, uid, pid, eid, externalSid, externalStart });
    await page.reload();
    await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).click();
    await page.getByRole("button", { name: "Adicionar exercício durante o treino", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do exercício/aparelho", exact: true }).waitFor();
    externalSession.status = "concluido"; externalSession.finished_at = new Date(Date.parse(externalStart) + 178000).toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(key => !localStorage.getItem(key), draftKey);
    await page.getByRole("textbox", { name: "Nome do exercício/aparelho", exact: true }).waitFor({ state: "hidden" });
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Continuar Plano teste", exact: true }).count(), 0, "O cartão inicial também deve abandonar a sessão encerrada");
    assert.equal(await page.getByText(/Seu treino está em andamento/).count(), 0);
    await page.screenshot({ path: path.join(output, "web-concluido-sem-aviso.png") });
    phase = "community";
    await page.getByRole("button", { name: "Abrir comunidade da família" }).click();
    await page.getByText("Ver mais publicações", { exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('div')).some(el => el.textContent === "Ver mais publicações"));
    assert.ok(feedPages >= 2);
    assert.equal(await page.getByRole("button", { name: "Abrir família Amigos da academia", exact: true }).count(), 0, "Não lista família sem vínculo");
    assert.equal(await page.getByText("Não exibir outro grupo", { exact: true }).count(), 0);
    const composer = page.getByRole("textbox", { name: "Texto para a família selecionada", exact: true });
    await composer.fill("Rascunho exclusivo da família A");
    await page.getByRole("button", { name: "Foto", exact: true }).click();
    const photoChooser = page.waitForEvent("filechooser"); await page.getByText("Escolher foto", { exact: true }).click();
    await (await photoChooser).setFiles(path.join(root, "public", "treino-familia-icon-192-v2.png"));
    await page.getByText("Trocar foto", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Criar outra família", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome da nova família", exact: true }).fill("Família da academia");
    await page.getByRole("button", { name: "Confirmar criação de família", exact: true }).click();
    await page.getByRole("button", { name: "Publicar em Família da academia", exact: true }).waitFor();
    const familyB = tables.families.find(f => f.name === "Família da academia");
    assert.ok(familyB); assert.equal(tables.family_members.length, 2); assert.equal(await composer.inputValue(), "");
    assert.equal(await page.getByText("Trocar foto", { exact: true }).count(), 0);
    await composer.fill("Mensagem exclusiva da academia"); holdPost = true;
    const sending = page.waitForRequest(r => r.method() === "POST" && r.url().includes("/rest/v1/community_posts"));
    await page.getByRole("button", { name: "Publicar em Família da academia", exact: true }).click(); await sending;
    assert.equal(await page.getByRole("button", { name: "Abrir família Família teste", exact: true }).isDisabled(), true);
    while (!releasePost) await page.waitForTimeout(10); releasePost();
    await page.getByText("Mensagem exclusiva da academia", { exact: true }).waitFor();
    await page.getByText("Publicar em Família da academia", { exact: true }).waitFor();
    assert.equal(tables.community_posts.find(p => p.content === "Mensagem exclusiva da academia").family_id, familyB.id);
    await page.getByRole("button", { name: "Abrir família Família teste", exact: true }).click();
    await page.getByRole("button", { name: "Publicar em Família teste", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Texto para a família selecionada"]')?.value === "Rascunho exclusivo da família A");
    assert.equal(await page.getByText("Mensagem exclusiva da academia", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Texto", exact: true }).click();
    await page.getByRole("button", { name: "Publicar em Família teste", exact: true }).click();
    await page.getByText("Rascunho exclusivo da família A", { exact: true }).waitFor();
    assert.equal(tables.community_posts.find(p => p.content === "Rascunho exclusivo da família A").family_id, "family-a");
    await page.getByPlaceholder("Código de convite", { exact: true }).fill("AMIGOS");
    await page.getByText("Entrar com código", { exact: true }).click();
    await page.getByRole("button", { name: "Publicar em Amigos da academia", exact: true }).waitFor();
    assert.equal(tables.family_members.length, 3);
    assert.equal(await page.getByText("Mensagem exclusiva da academia", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Rascunho exclusivo da família A", { exact: true }).count(), 0);
    holdFeedFamily = "family-a";
    const stale = page.waitForRequest(r => r.url().includes("/rest/v1/community_posts") && new URL(r.url()).searchParams.get("family_id") === "eq.family-a");
    await page.getByRole("button", { name: "Abrir família Família teste", exact: true }).click(); await stale;
    await page.getByRole("button", { name: "Abrir família Família da academia", exact: true }).click();
    await page.getByText("Mensagem exclusiva da academia", { exact: true }).waitFor();
    while (!releaseFeed) await page.waitForTimeout(10); releaseFeed(); await page.waitForTimeout(150);
    assert.equal(await page.getByText("Rascunho exclusivo da família A", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Não exibir outro grupo", { exact: true }).count(), 0);
    await page.reload(); await page.getByRole("button", { name: "Abrir comunidade da família" }).click();
    await page.getByRole("button", { name: "Publicar em Família da academia", exact: true }).waitFor();
    await page.getByText("Mensagem exclusiva da academia", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Abrir família Família da academia", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "web-minhas-familias.png") });
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    await page.getByText("Frequência", { exact: true }).click();
    await page.getByText("Registrar cardio", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("treino-familia:android-back-v1", { cancelable: true }))), true);
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    await page.getByText("Frequência", { exact: true }).click();
    await page.getByText("Registrar cardio", { exact: true }).waitFor();
    await page.getByText(/Escadas teste · Escadas/).click();
    await page.getByPlaceholder("Ex.: 25", { exact: true }).fill("10");
    await page.getByText("Moderada", { exact: true }).click();
    assert.equal(await page.getByText("Complete seu perfil", { exact: true }).count(), 0);
    const salvo = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/rest/v1/cardio_sessions") && response.status() === 200);
    await page.getByText(/^Confirmar cardio ·/).click(); await salvo;
    assert.equal(tables.cardio_sessions.length, 1); assert.equal(tables.cardio_sessions[0].weight_kg_snapshot, 80);
    await page.getByText("‹", { exact: true }).click();
    await page.getByText("15", { exact: true }).click();
    await page.getByText("Plano teste", { exact: true }).first().click();
    await page.getByRole("textbox", { name: "Duração do treino em minutos", exact: true }).fill("40");
    await page.getByRole("button", { name: "Intensidade do treino: Moderada", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar série em Agachamento teste", exact: true }).click();
    await page.getByRole("textbox", { name: "Agachamento teste, série 3, carga em quilos", exact: true }).fill("25");
    await page.getByRole("button", { name: "Marcar todas as séries deste registro", exact: true }).click();
    await page.getByText(/kcal ativas estimadas/).waitFor();
    await page.getByRole("button", { name: "Confirmar registro de musculação", exact: true }).click();
    await page.getByText(/40 min · moderada · ≈/).waitFor();
    const manual = tables.workout_sessions.find(s => s.notes?.includes("Frequência"));
    assert.ok(manual); assert.equal(manual.duration_minutes, 40); assert.equal(manual.sets_completed, 3); assert.ok(manual.active_calories > 0);
    assert.equal(tables.workout_sets.find(s => s.session_id === manual.id && s.set_number === 3).weight_kg, 25);
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    const unexpectedFetch = nativeFetchReports.filter(report => !report.offline && !cancelledRequests.has(report.url)
      && !fetchFailures.some(failure => failure.url === report.url && (failure.offline || failure.aborted) && Math.abs(failure.at - report.at) < 1000));
    if (unexpectedFetch.length) console.error("NATIVE FETCH DIAGNOSTIC", { reports: nativeFetchReports, cancelled: [...cancelledRequests], failures: fetchFailures });
    assert.deepEqual(unexpectedFetch, [], "Falhas nativas do WebKit só são esperadas offline ou em requisições canceladas");
    offlineReports = nativeFetchReports.filter(report => report.offline).length;
    if (offlineReports) console.log(`WebKit: ${offlineReports} avisos nativos durante a queda de rede forçada; estado e retomada verificados.`);
    console.log("OK UI — restaura e envia sessão ausente (1/18 séries), preserva horário e cópia, rede em voo, conflito legado, swipe-back, famílias, registro manual e cardio");
    await context.close();
  } catch (error) {
    if (activePage) { await activePage.screenshot({ path: path.join(output, "web-failure.png") }).catch(() => {}); console.error((await activePage.locator("body").innerText()).slice(0, 2000)); }
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
