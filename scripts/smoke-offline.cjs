const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {chromium,webkit}=require('playwright');
const {gerarOffline}=require('./gerar-offline.cjs');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const output=path.join(root,'.test-results',`offline-${process.env.SMOKE_BROWSER||'chromium'}-${Date.now()}`);
  const a=path.join(output,'a'), b=path.join(output,'b'), c=path.join(output,'c');
  fs.mkdirSync(output,{recursive:true}); fs.cpSync(path.join(root,'dist'),a,{recursive:true}); fs.cpSync(a,b,{recursive:true});
  // Segunda revisão do pacote exportado, com bundle de nome diferente.
  let html=fs.readFileSync(path.join(b,'index.html'),'utf8').replace(/<meta name="tf-build"[^>]*>/g,'');
  const script=html.match(/src="([^"]+\.js)"/)[1];
  const novo=script.replace(/\.js$/,'.revisao-b.js');
  fs.copyFileSync(path.join(b,script),path.join(b,novo));
  fs.appendFileSync(path.join(b,novo),'\n/* segunda revisão de teste */\n');
  html=html.replace(script,novo); fs.writeFileSync(path.join(b,'index.html'),html);
  const vb=gerarOffline(b);
  const va=JSON.parse(fs.readFileSync(path.join(a,'offline-build.json'))).versao;
  assert.notEqual(va,vb);
  // Terceira revisão: só a implementação do worker muda; os assets são os de B.
  fs.cpSync(b,c,{recursive:true});
  const codigoGerador=fs.readFileSync(require.resolve('./gerar-offline.cjs'),'utf8');
  const outroCodigo=codigoGerador.replace("cache:'reload'","cache:'no-store'");
  assert.notEqual(outroCodigo,codigoGerador);
  const modulo={exports:{}};
  vm.runInNewContext(outroCodigo,{require,module:modulo,exports:modulo.exports});
  const vc=modulo.exports.gerarOffline(c);
  assert.notEqual(vc,vb,'Uma alteração exclusiva no worker precisa criar outro cache');
  const normalizarHtml=valor=>valor.replace(/<meta name="tf-build"[^>]*>/g,'');
  assert.equal(normalizarHtml(fs.readFileSync(path.join(c,'index.html'),'utf8')),normalizarHtml(fs.readFileSync(path.join(b,'index.html'),'utf8')));
  assert.deepEqual(fs.readFileSync(path.join(c,novo)),fs.readFileSync(path.join(b,novo)));
  let falhaWorkerObservada;
  const pedidoWorkerComFalha=new Promise(resolve=>{falhaWorkerObservada=resolve;});
  let dir=a, quebrar=false, indisponivel=false;
  const server=http.createServer((req,res)=>{
    if(indisponivel){req.socket.destroy();return;}
    const url=new URL(req.url,'http://localhost');
    if(quebrar && url.pathname===novo){
      if(dir===c) falhaWorkerObservada();
      res.writeHead(503).end();return;
    }
    const file=path.resolve(dir,`.${url.pathname==='/'?'/index.html':url.pathname}`);
    if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){console.error('Arquivo de teste ausente:',url.pathname);res.writeHead(404).end();return;}
    const type={'.js':'text/javascript','.json':'application/json','.html':'text/html','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await (process.env.SMOKE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const setOffline=async value=>{
      // O WebKit do Playwright falha internamente no reload com setOffline.
      // Cortamos o transporte HTTP local; nenhum arquivo pode vir da rede.
      indisponivel=value;
      if(process.env.SMOKE_BROWSER!=='webkit') await context.setOffline(value);
    };
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    let page=await context.newPage();page.on('pageerror',e=>console.error('Erro na página:',e.message));await page.goto(origin);
    await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:30000}).catch(async e=>{console.error(await page.evaluate(async()=>({meta:document.querySelector('meta[name="tf-build"]')?.content,registros:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,installing:r.installing?.state,waiting:r.waiting?.state,active:r.active?.state}))})));throw e;});
    const chave='@treino-familia:rascunho:v1:fixture:plano';
    const pendente=JSON.stringify({versao:1,finalizacao:{finishedAt:'2026-11-16T10:00:00Z'},series:[{pendente:'salvar'}]});
    await page.evaluate(({chave,pendente})=>localStorage.setItem(chave,pendente),{chave,pendente});
    await setOffline(true);await page.reload();
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),va);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),chave),pendente);
    await setOffline(false);
    const outraJanela=await context.newPage();await outraJanela.goto(origin);
    dir=b;quebrar=true;
    await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
    await page.waitForFunction(async()=>!(await navigator.serviceWorker.ready).installing);
    assert.equal(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting)),false,'Instalação incompleta não deve ficar pronta');
    quebrar=false;
    await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
    await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.ready).waiting),{timeout:30000});
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),va);
    await page.getByText(/Atualização pronta/).waitFor();
    await page.getByRole('button',{name:'Continuar e lembrar na próxima abertura'}).click();
    await setOffline(true);await page.reload();
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),va,'A sessão aberta conserva a revisão anterior');
    await setOffline(false);await page.close();
    page=await context.newPage();await page.goto(origin);
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),va,'Outra janela aberta impede ativação da nova versão');
    await page.close();await outraJanela.close();
    page=await context.newPage();await page.goto(origin);
    await page.waitForFunction(v=>document.querySelector('meta[name="tf-build"]')?.content===v,vb,{timeout:30000});
    await setOffline(true);await page.reload();
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),vb);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),chave),pendente);
    assert.ok((await page.evaluate(()=>performance.getEntriesByType('resource').map(x=>x.name))).some(n=>n.endsWith('.revisao-b.js')));
    // Uma instalação incompleta só do novo worker não pode apagar o cache ativo.
    await setOffline(false);dir=c;quebrar=true;
    await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;await r.update();});
    let limitePedido;
    try {
      await Promise.race([pedidoWorkerComFalha,new Promise((_,reject)=>{
        limitePedido=setTimeout(()=>reject(new Error('A instalação C não buscou o asset com falha')),30000);
      })]);
    } finally {clearTimeout(limitePedido);}
    // A recuperação de rede também pode disparar update() pelo aplicativo.
    // Aguarde a limpeza da instalação falha, além da referência installing.
    await page.waitForFunction(async versao=>{
      const registro=await navigator.serviceWorker.ready;
      return !registro.installing && !(await caches.keys()).includes(`tf-app-${versao}`);
    },vc,{timeout:30000});
    assert.equal(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting)),false);
    const cachesAposFalha=await page.evaluate(()=>caches.keys());
    assert.ok(cachesAposFalha.includes(`tf-app-${vb}`),'A atualização exclusiva do worker preserva o cache ativo');
    assert.equal(cachesAposFalha.includes(`tf-app-${vc}`),false,'A instalação incompleta remove somente seu próprio cache');
    await setOffline(true);await page.reload();
    assert.equal(await page.locator('meta[name="tf-build"]').getAttribute('content'),vb);
    assert.equal(await page.evaluate(k=>localStorage.getItem(k),chave),pendente);
    await page.screenshot({path:path.join(output,'reabertura-offline.png'),fullPage:true});
    const cache=await page.evaluate(async()=>{const r={};for(const k of await caches.keys())r[k]=(await (await caches.open(k)).keys()).map(x=>x.url);return r;});
    assert.equal(Object.keys(cache).filter(k=>k.startsWith('tf-app-')).length,1);
    assert.ok(Object.values(cache).flat().every(u=>new URL(u).origin===origin&&!u.includes('auth/v1')));
    console.log('OK offline: pacote exportado, A/B, atualização exclusiva do worker com falha, adiamento, reabertura e pendência preservada');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
