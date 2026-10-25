// Isolated browser + fictional backend. Every non-local request is intercepted.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const output = path.join(root, ".test-results"); fs.mkdirSync(output, { recursive: true });
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
  families: [{ id: "family-a", name: "Família teste", owner_id: uid, invite_code: "TESTE" }],
  community_posts: Array.from({ length: 12 }, (_, i) => ({ id: `post-${String(i).padStart(2, "0")}`, family_id: "family-a", user_id: uid, author_name: "Teste", content: `Publicação de teste ${i + 1}`, post_type: "texto", image_path: null, workout_plan_name: null, workout_snapshot: null, created_at: new Date(now - i * 60000).toISOString() })),
  cardio_activities: [{ id: "cardio-a", user_id: uid, nome: "Escadas teste", tipo: "Escadas", duracao_min: 10, distancia_km: null, calorias: null, observacoes: null }], cardio_sessions: [],
};
let backendOffline = false, feedPages = 0;
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
  const browser = await chromium.launch({ headless: true });
  let activePage;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; const page = await context.newPage(); activePage = page; page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (!url.hostname.endsWith(".supabase.co")) return route.abort();
      if (backendOffline) return route.abort("internetdisconnected");
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "content-type": "application/json" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user, headers });
      if (url.pathname.includes("/rpc/")) return route.fulfill({ json: url.pathname.endsWith("tf_resumo_semanal") ? { treinos: 1, cardios: 0, minutos: 10, calorias: 0, caloriasDisponiveis: 0 } : [], headers });
      const table = url.pathname.split("/").pop(); if (!(table in tables)) return route.fulfill({ json: [], headers });
      if (table === "community_posts") feedPages++;
      let rows = filtered(table, url.searchParams);
      if (["POST", "PATCH"].includes(request.method())) {
        const body = request.postDataJSON();
        if (request.method() === "POST") { const inserted = Array.isArray(body) ? body : [body]; tables[table].push(...inserted); rows = inserted; }
        else rows.forEach(row => Object.assign(row, body));
      }
      const one = request.headers().accept?.includes("application/vnd.pgrst.object+json");
      return route.fulfill({ json: one ? rows[0] || null : rows, headers: { ...headers, "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" } });
    });
    await page.goto(origin); await page.getByText("Bem-vindo de volta!", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "web-login.png") });
    const draftKey = `@treino-familia:rascunho:v1:${uid}:${pid}`;
    await context.addInitScript(({ key, auth, draftKey, uid, pid, sid, eid, start }) => {
      localStorage.setItem(key, JSON.stringify(auth));
      if (!localStorage.getItem(draftKey)) localStorage.setItem(draftKey, JSON.stringify({ versao: 1, usuarioId: uid, planId: pid, planName: "Plano teste", sessao: { id: sid, plan_id: pid, started_at: start }, exercicios: [{ id: eid, name: "Agachamento teste", sets_goal: 2, reps_goal: "8-12" }], series: [1, 2].map(set_number => ({ chave: `${eid}:${set_number}`, exercise_id: eid, exercise_name: "Agachamento teste", set_number, reps: "10", weight_kg: "20", concluida: false })), intensidade: "moderada", esforco: "adequado", salvoEm: start, descanso: { fimEm: Date.now() + 90000, pausado: false, segundosPausados: 0, duracao: 90 } }));
    }, { key: storageKey, auth: session, draftKey, uid, pid, sid, eid, start: active.started_at });
    await page.reload(); await page.getByText("Olá, Conta de!", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).click();
    const reps = page.getByRole("textbox", { name: "Agachamento teste, série 1, repetições realizadas", exact: true });
    await reps.waitFor(); await page.getByRole("button", { name: /Usar última sessão de Agachamento teste/ }).click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Agachamento teste, série 1, repetições realizadas"]')?.value === "8");
    await reps.fill("14"); await reps.focus(); const element = await reps.elementHandle();
    await page.waitForTimeout(2100); assert.equal(await reps.inputValue(), "14"); assert.equal(await reps.evaluate((node, old) => node === old, element), true);
    await context.setOffline(true);
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
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).series[0].pendente === "salvar", draftKey);
    backendOffline = true; await context.setOffline(false); await page.reload();
    await page.getByRole("button", { name: /Continuar treino: Plano teste/ }).click();
    await page.getByRole("button", { name: "Desmarcar Remada academia viagem, série 1", exact: true }).waitFor();
    assert.equal(await page.getByRole("textbox", { name: "Remada academia viagem, série 1, carga em quilos", exact: true }).inputValue(), "20");
    await context.setOffline(true);
    const endedBefore = Date.now(); await page.getByText("Finalizar e salvar treino", { exact: true }).click();
    await page.getByRole("button", { name: "Criar novo treino", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome do novo treino", exact: true }).fill("Academia da viagem");
    await page.getByRole("textbox", { name: "Duração do treino em minutos", exact: true }).fill("35");
    await page.getByRole("button", { name: "Intensidade do treino: Intensa", exact: true }).click();
    await page.getByText(/kcal ativas estimadas/).waitFor();
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(output, "web-revisao-treino.png") });
    await page.getByRole("button", { name: "Confirmar conclusão do treino", exact: true }).click();
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key)).finalizacao, draftKey);
    const finish = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).finalizacao.finishedAt, draftKey);
    assert.ok(Date.parse(finish) >= endedBefore);
    await page.screenshot({ path: path.join(output, "web-offline-completion.png") });
    backendOffline = true; await context.setOffline(false); await page.reload();
    await page.getByText("Conclusão pendente de envio", { exact: false }).first().waitFor({ timeout: 10000 });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).finalizacao.finishedAt, draftKey), finish);
    backendOffline = false; await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForFunction(key => !localStorage.getItem(key), draftKey, { timeout: 15000 });
    assert.equal(active.finished_at, finish); assert.equal(tables.workout_sets.filter(set => set.session_id === sid).length, 2);
    assert.equal(active.duration_minutes, 35); assert.equal(active.intensity, "intensa"); assert.ok(active.active_calories > 0);
    assert.equal(tables.workout_plans.length, 2); const travel = tables.workout_plans.find(p => p.name === "Academia da viagem"); assert.ok(travel);
    assert.equal(active.plan_id, travel.id); assert.equal(tables.exercises.filter(e => e.plan_id === travel.id).length, 2);
    assert.equal(tables.exercises.filter(e => e.plan_id === pid).length, 1); assert.equal(tables.exercise_load_defaults.find(e => e.exercise_id === eid).weight_kg, 20);
    await page.getByRole("button", { name: "Abrir comunidade da família" }).click();
    await page.getByText("Ver mais publicações", { exact: true }).click();
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('div')).some(el => el.textContent === "Ver mais publicações"));
    assert.ok(feedPages >= 2);
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
    await page.getByRole("button", { name: "Marcar todas as séries deste registro", exact: true }).click();
    await page.getByText(/kcal ativas estimadas/).waitFor();
    await page.getByRole("button", { name: "Confirmar registro de musculação", exact: true }).click();
    await page.getByText(/40 min · moderada · ≈/).waitFor();
    const manual = tables.workout_sessions.find(s => s.notes?.includes("Frequência"));
    assert.ok(manual); assert.equal(manual.duration_minutes, 40); assert.equal(manual.sets_completed, 2); assert.ok(manual.active_calories > 0);
    await page.getByRole("button", { name: "Ir para treinos" }).click();
    await page.getByText("Olá, Conta de!", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("OK UI — edição durante treino, novo plano offline/reabertura/reenvio, original preservado, registro manual com calorias, retomada, comunidade e cardio");
    await context.close();
  } catch (error) {
    if (activePage) { await activePage.screenshot({ path: path.join(output, "web-failure.png") }).catch(() => {}); console.error((await activePage.locator("body").innerText()).slice(0, 2000)); }
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
