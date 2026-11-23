const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function montarWorker(arquivos, versao) {
  return `/* Somente arquivos públicos da aplicação; nenhum dado de conta. */
const CACHE='tf-app-${versao}', PREFIX='tf-app-';
const FILES=${JSON.stringify(arquivos)};
const allowed=new Set(FILES);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try { const cache=await caches.open(CACHE); await cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'}))); }
  catch(error) { await caches.delete(CACHE); throw error; }
})()));
// Sem skipWaiting: a atualização aguarda TODAS as janelas antigas fecharem.
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()) if(key.startsWith(PREFIX)&&key!==CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin) return;
  // Callbacks de autenticação continuam na rede; nunca guardar códigos/tokens.
  if(url.pathname.startsWith('/auth/')||url.search||url.hash) return;
  if(event.request.mode==='navigate' && (url.pathname==='/'||url.pathname==='/index.html')) {
    event.respondWith(caches.open(CACHE).then(c=>c.match('/index.html')).then(r=>r||fetch(event.request))); return;
  }
  if(allowed.has(url.pathname)) event.respondWith(caches.open(CACHE).then(c=>c.match(url.pathname)).then(r=>r||fetch(event.request)));
});
`;
}

function gerarOffline(dist) {
  const html = path.join(dist,'index.html');
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(/<meta name="tf-build"[^>]*>/g,''));
  const arquivos = [];
  function visitar(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const arquivo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) visitar(arquivo);
      else if (/\.(js|css|png|jpg|webp|svg|ico|woff2?|ttf|json|html)$/.test(entrada.name) && !['sw.js','offline-build.json'].includes(entrada.name) && !arquivo.includes('.well-known')) arquivos.push('/' + path.relative(dist,arquivo).split(path.sep).join('/'));
    }
  }
  visitar(dist); arquivos.sort();
  // O código do worker também identifica o cache. A versão neutra evita uma
  // dependência circular e dispensa incrementar uma revisão manual a cada mudança.
  const hash = crypto.createHash('sha256').update(montarWorker(arquivos, '__TF_BUILD__'));
  for (const a of arquivos) hash.update(a).update(fs.readFileSync(path.join(dist,a.slice(1))));
  const versao = hash.digest('hex').slice(0,20);
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('</head>',`<meta name="tf-build" content="${versao}"></head>`));
  fs.writeFileSync(path.join(dist,'sw.js'), montarWorker(arquivos, versao));
  fs.writeFileSync(path.join(dist,'offline-build.json'),JSON.stringify({versao}));
  return versao;
}
module.exports = { gerarOffline };
