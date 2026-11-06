// Interface móvel com duas contas fictícias + PostgreSQL isolado. Sem rede externa.
// node scripts/smoke-acompanhamento.cjs <caminho-para-@electric-sql/pglite>
const { chromium, webkit } = require("playwright");
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const root = path.resolve(__dirname, ".."), db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const users = [1, 2].map(n => ({ id: uid(n), aud: "authenticated", role: "authenticated", email: `teste${n}@example.invalid`,
  created_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: { nome: n === 1 ? "Treinador teste" : "Aluno teste", tema_cor: "#35D07F" } }));
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const backend = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL || env.match(/^EXPO_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1]);
const storageKey = `sb-${backend.hostname.split(".")[0]}-auth-token`;
const output = path.join(root, ".test-results", `acompanhamento-${process.env.SMOKE_BROWSER || "chromium"}`);
fs.mkdirSync(output, { recursive: true });
const errors = [];
const server = http.createServer((req, res) => {
  const dist = path.join(root, "dist");
  let target = path.resolve(dist, `.${new URL(req.url, "http://localhost").pathname}`);
  if (!target.startsWith(dist + path.sep) && target !== dist) return res.writeHead(403).end();
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": ({ ".js": "text/javascript", ".json": "application/json", ".png": "image/png" })[path.extname(target)] || "text/html" });
  fs.createReadStream(target).pipe(res);
});
async function queryAs(userId, fn) {
  return db.transaction(async tx => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
    return fn(tx);
  });
}
let browser, pages = [];
(async () => {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table workout_plans(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users,name text,created_at timestamptz default now(),unique(user_id,name));
    create table exercises(id uuid primary key,user_id uuid references auth.users,plan_id uuid references workout_plans,name text,sets_goal integer,reps_goal text,position integer,photo_path text);
    create table exercise_load_defaults(user_id uuid,exercise_id uuid,set_number integer,reps integer,weight_kg numeric,primary key(user_id,exercise_id,set_number));
    create table workout_sessions(id uuid primary key,user_id uuid,plan_id uuid references workout_plans,started_at timestamptz,finished_at timestamptz,status text,notes text,duration_minutes numeric,intensity text,active_calories numeric);
    create table workout_sets(id uuid primary key,user_id uuid,session_id uuid references workout_sessions,exercise_id uuid,exercise_name text,set_number integer,reps integer,weight_kg numeric);
  `);
  for (const user of users) await db.query("insert into auth.users values($1,$2)", [user.id, user.user_metadata]);
  const tables = ["workout_plans", "exercises", "exercise_load_defaults", "workout_sessions", "workout_sets"];
  for (const table of tables) await db.exec(`alter table ${table} enable row level security; create policy own on ${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid()); grant select,update,insert,delete on ${table} to authenticated;`);
  await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/202611050001_acompanhamento.sql"), "utf8"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const engine = process.env.SMOKE_BROWSER === "webkit" ? webkit : chromium;
  browser = await engine.launch({ headless: true, ...(engine === chromium && process.env.SMOKE_BROWSER_CHANNEL ? { channel: process.env.SMOKE_BROWSER_CHANNEL } : {}) });
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== backend.origin) return route.abort();
      const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json" };
      const send = (json, status = 200, extra = {}) => route.fulfill({ json, status, headers: { ...headers, ...extra } });
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (url.pathname.startsWith("/auth/v1/")) return send(user);
      try {
        if (url.pathname.endsWith("/rpc/tf_coaching")) {
          const { p_action, p_data } = req.postDataJSON();
          return send(await queryAs(user.id, async tx => (await tx.query("select tf_coaching($1,$2::jsonb) as result", [p_action, JSON.stringify(p_data)])).rows[0].result));
        }
        if (url.pathname.includes("/rpc/")) return send(url.pathname.endsWith("tf_resumo_semanal") ? { treinos: 0, cardios: 0, minutos: 0, calorias: 0, caloriasDisponiveis: 0 } : []);
        const table = url.pathname.split("/").pop();
        const one = req.headers().accept?.includes("application/vnd.pgrst.object+json");
        if (!tables.includes(table)) return send(one ? null : []);
        const rows = await queryAs(user.id, async tx => {
          const params = [], where = [];
          for (const [key, value] of url.searchParams) {
            if (!/^[a-z_]+$/.test(key) || ["select", "order", "limit", "offset"].includes(key)) continue;
            const [op, ...parts] = value.split("."), raw = parts.join(".");
            if (["eq", "gte", "lt"].includes(op)) { params.push(raw); where.push(`${key} ${{ eq: "=", gte: ">=", lt: "<" }[op]} $${params.length}`); }
            if (op === "in") { params.push(raw.slice(1, -1).split(",")); where.push(`${key}::text = any($${params.length})`); }
          }
          const clause = where.length ? ` where ${where.join(" and ")}` : "";
          if (req.method() === "PATCH") {
            assert.equal(table, "workout_plans"); const body = req.postDataJSON(); assert.deepEqual(Object.keys(body), ["name"]);
            params.push(body.name); return (await tx.query(`update workout_plans set name=$${params.length}${clause} returning *`, params)).rows;
          }
          assert.ok(["GET", "HEAD"].includes(req.method()), `Unexpected mutation: ${req.method()} ${table}`);
          let result = (await tx.query(`select * from ${table}${clause}`, params)).rows;
          const order = url.searchParams.get("order");
          if (order) { const [key, direction] = order.split("."); result.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (direction === "desc" ? -1 : 1)); }
          return result.slice(Number(url.searchParams.get("offset") || 0), Number(url.searchParams.get("offset") || 0) + Number(url.searchParams.get("limit") || 1000));
        });
        return send(one ? rows[0] || null : rows, 200, { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
      } catch (error) { return send({ code: error.code || "fixture", message: error.message }, 400); }
    });
    const encode = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now })}.fixture`;
    await context.addInitScript(({ key, auth }) => localStorage.setItem(key, JSON.stringify(auth)), { key: storageKey, auth: { user, access_token: token, refresh_token: "fixture", token_type: "bearer", expires_in: 3600, expires_at: now + 3600 } });
    const page = await context.newPage(); pages.push(page);
    page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    await page.goto(origin); await page.getByText("Meus treinos", { exact: true }).click();
    await page.getByRole("button", { name: "Meu treinador e pessoas que acompanho", exact: true }).click();
    await page.getByText("Treinar com acompanhamento", { exact: true }).waitFor();
  }
  const [coach, student] = pages;
  const button = (page, name) => page.getByRole("button", { name, exact: true });
  await button(coach, "Gerar convite para aluno").click();
  await coach.getByText(/Válido até/).waitFor();
  const invitation = (await db.query("select code from coaching_invites")).rows[0].code;
  await student.getByLabel("Código recebido do treinador", { exact: true }).fill(invitation);
  await button(student, "Conferir convite").click();
  await student.getByText("Convite de Treinador teste", { exact: true }).waitFor();
  assert.equal((await db.query("select count(*)::int as n from coaching_links")).rows[0].n, 0);
  await button(student, "Aceitar e compartilhar meus treinos").click();
  await button(student, "Ver acompanhamento com Treinador teste").waitFor();
  await button(coach, "Atualizar vínculos").click();
  await button(coach, "Acompanhar Aluno teste").click();
  await button(coach, "Abrir Treinos do aluno").waitFor();
  await button(coach, "Abrir Histórico do aluno").waitFor();
  await button(coach, "Abrir Frequência do aluno").waitFor();
  assert.equal(await button(coach, "Criar ficha").count(), 0, "painel inicial não mistura formulários com os blocos");
  await coach.screenshot({ path: path.join(output, "area-aluno-blocos.png"), fullPage: true });
  await button(coach, "Abrir Treinos do aluno").click();
  await button(coach, "Criar ficha").click();
  await coach.getByLabel("Nome da ficha", { exact: true }).fill("Treino orientado");
  await coach.getByLabel("Orientações gerais", { exact: true }).fill("Mantenha a execução confortável.");
  await coach.getByLabel("Nome do exercício 1", { exact: true }).fill("Supino");
  await coach.getByLabel("Carga (kg) 1", { exact: true }).fill("12,5");
  await coach.getByLabel("Orientações do exercício 1", { exact: true }).fill("Ajustar banco.");
  assert.equal(await button(coach, "Disponibilizar treino ao aluno").isDisabled(), true);
  await button(coach, "Salvar rascunho").click();
  await button(coach, "Disponibilizar treino ao aluno").click();
  await coach.getByText("Esta revisão já foi disponibilizada ao aluno.", { exact: true }).waitFor();
  let deliveries = (await db.query("select * from coaching_deliveries order by revision")).rows;
  assert.equal(deliveries.length, 1);
  const planId = deliveries[0].plan_id;
  await coach.getByLabel("Nome da ficha", { exact: true }).fill("Treino revisado");
  await button(coach, "Salvar rascunho").click(); await button(coach, "Disponibilizar treino ao aluno").click();
  await coach.getByText("Esta revisão já foi disponibilizada ao aluno.", { exact: true }).waitFor();
  deliveries = (await db.query("select * from coaching_deliveries order by revision")).rows;
  assert.equal(deliveries.length, 2); assert.notEqual(deliveries[0].plan_id, deliveries[1].plan_id);
  await button(student, "‹ Voltar").last().click();
  const oldName = (await db.query("select name from workout_plans where id=$1", [planId])).rows[0].name;
  await button(student, `Abrir treino ${oldName}`).click();
  await button(student, "Ver orientações do treinador").click();
  await student.getByText("Mantenha a execução confortável.", { exact: true }).waitFor();
  await button(student, `Editar nome do treino ${oldName}`).click();
  await student.getByLabel("Novo nome do treino", { exact: true }).fill("Meu treino escolhido");
  await button(student, "Salvar nome").click();
  await button(student, "Abrir treino Meu treino escolhido").waitFor();
  assert.equal((await db.query("select count(*)::int as n from exercises where plan_id=$1", [planId])).rows[0].n, 1);
  // Simula uma sessão já realizada pelo aluno, para acompanhar séries e feedback.
  await db.query("insert into workout_sessions(id,user_id,plan_id,started_at,finished_at,status,duration_minutes) values($1,$2,$3,now(),now(),'concluido',40)", [uid(30), users[1].id, planId]);
  await db.query("insert into workout_sets(id,user_id,session_id,exercise_name,set_number,reps,weight_kg) values($1,$2,$3,'Supino',1,12,15)", [uid(31), users[1].id, uid(30)]);
  await button(student, "Meu treinador e pessoas que acompanho").click();
  await button(student, "Minhas observações de treino").click();
  await button(student, "Anotar sobre Meu treino escolhido").click();
  await student.getByLabel("Como foi este treino?", { exact: true }).fill("A última série foi difícil.");
  await button(student, "Salvar observação").click();
  await student.getByText("Observação: A última série foi difícil.", { exact: true }).waitFor();
  await button(coach, "‹ Voltar").last().click();
  await button(coach, "Consultar treinos do aluno").click();
  await button(coach, "Ver exercícios de Meu treino escolhido").click();
  await coach.getByText("Série 1: 8 reps × 12,5 kg", { exact: true }).waitFor();
  await button(coach, "‹ Voltar").last().click();
  await button(coach, "Abrir Histórico do aluno").click();
  await button(coach, "Atualizar acompanhamento").click();
  await coach.getByText("Observação: A última série foi difícil.", { exact: true }).waitFor();
  await button(coach, "Ver séries de Meu treino escolhido").click();
  await coach.getByText("Supino · série 1: 12 reps × 15 kg", { exact: true }).waitFor();
  await coach.screenshot({ path: path.join(output, "treinador-historico.png"), fullPage: true });
  // Mais de uma página de sessões no mesmo mês: o calendário precisa considerar todas.
  const hoje = new Date();
  for (let i = 0; i < 22; i++) await db.query("insert into workout_sessions(id,user_id,plan_id,started_at,status,duration_minutes) values($1,$2,$3,$4,'concluido',20)",
    [uid(100 + i), users[1].id, planId, new Date(hoje.getFullYear(), hoje.getMonth(), 1, 12).toISOString()]);
  await button(coach, "‹ Voltar").last().click();
  await button(coach, "Abrir Frequência do aluno").click();
  await coach.getByText("treinos no mês", { exact: true }).waitFor();
  await coach.getByText("23", { exact: true }).first().waitFor();
  const hojeTexto = hoje.toLocaleDateString("pt-BR");
  await button(coach, `${hojeTexto}, ${hoje.getDate() === 1 ? 23 : 1} treino(s)`).click();
  await coach.getByText("A última série foi difícil.", { exact: true }).waitFor();
  await coach.screenshot({ path: path.join(output, "area-aluno-frequencia.png"), fullPage: true });
  await button(coach, "Mês anterior").click();
  await coach.getByText("Nenhum treino concluído neste dia.", { exact: true }).waitFor();
  await button(coach, "Próximo mês").click();
  await coach.getByText("treinos no mês", { exact: true }).waitFor();
  await button(coach, "‹ Voltar").last().click();
  await button(coach, "Abrir Histórico do aluno").click();
  await button(student, "‹ Voltar").last().click();
  await button(student, "Ver acompanhamento com Treinador teste").click();
  await button(student, "Sobre o vínculo").click();
  await button(student, "Encerrar vínculo").click();
  await student.getByText("Vínculos encerrados", { exact: true }).waitFor();
  await button(coach, "Atualizar acompanhamento").click();
  await coach.getByText(/O vínculo foi encerrado/).waitFor();
  assert.equal((await db.query("select count(*)::int as n from workout_plans where user_id=$1", [users[1].id])).rows[0].n, 2);
  assert.equal((await db.query("select comment from coaching_feedback")).rows[0].comment, "A última série foi difícil.");
  await button(student, "‹ Voltar").last().click();
  await button(student, "Abrir treino Meu treino escolhido").click();
  await student.getByText(/Preparado por Treinador teste/).first().waitFor();
  await student.screenshot({ path: path.join(output, "aluno-treinos-preservados.png"), fullPage: true });
  await student.reload(); await student.getByText("Meus treinos", { exact: true }).click();
  await button(student, "Abrir treino Meu treino escolhido").waitFor();
  assert.deepEqual(errors, []);
  console.log("OK UI móvel: convite/consentimento entre duas contas, rascunho, duas versões, orientações, renomeação persistente, séries, observações e separação sem exclusão; PostgreSQL real isolado.");
})().catch(async error => {
  console.error(error); process.exitCode = 1;
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: path.join(output, `falha-${i}.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, `falha-${i}.txt`), await pages[i].locator("body").innerText().catch(() => ""));
  }
}).finally(async () => { await browser?.close(); server.close(); await db.close(); });
