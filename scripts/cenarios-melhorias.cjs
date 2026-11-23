const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const posts=new Map();
function interagir(p){
  const key=`${p.p_family_id}:${p.p_post_id}`;
  const e=posts.get(key)||{likes:0,liked:false,comment_count:0,can_moderate:true,comments:[]};posts.set(key,e);
  if(p.p_action==='like'){e.liked=p.p_like;e.likes=p.p_like?1:0;}
  if(p.p_action==='comment'&&!e.comments.some(c=>c.id===p.p_comment_id)){e.comments.unshift({id:p.p_comment_id,content:p.p_content,author:'Membro de teste',own:true,created_at:new Date().toISOString()});}
  if(p.p_action==='delete_comment')e.comments=e.comments.filter(c=>c.id!==p.p_comment_id);
  e.comment_count=e.comments.length;
  return e;
}
async function executar({page,output,uid}){
  assert.ok(!/user-scalable=no|maximum-scale=1/.test(await page.locator('meta[name="viewport"]').getAttribute('content')));
  await page.getByRole('button',{name:'Abrir perfil',exact:true}).click();
  await page.getByRole('button',{name:'Copiar diagnóstico',exact:true}).click();
  const diag=page.getByRole('textbox',{name:'Texto do diagnóstico'});await diag.waitFor();
  const d=JSON.parse(await diag.inputValue());assert.equal(d.versao,'1.3.0');assert.ok(d.pendencias.treinos>=0);assert.ok(!JSON.stringify(d).includes('teste@example'));
  await page.evaluate(uid=>localStorage.setItem(`@treino-familia:fotos-modelo:v1:${uid}:fixture`,JSON.stringify({sessaoId:'fixture',planId:'fixture',exercicioId:'fixture',origem:`${uid}/fixture/foto.png`,destino:`${uid}/fixture/nova.png`,ultimaTentativaEm:'2026-11-16T12:00:00Z',falha:{motivo:'conexao',etapa:'copiar',tentativas:1,tentarEm:Date.now()+3600000}})),uid);
  await page.getByRole('button',{name:'Ver detalhes da sincronização',exact:true}).click();
  await page.getByText(/Última tentativa:/).first().waitFor();
  const fixture={formato:'treino-familia-backup',versao:1,tabelas:{workout_plans:[{id:'99999999-9999-4999-8999-999999999999',name:'Importação de teste'}]}};
  await page.getByLabel('Selecionar backup JSON').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.getByText('Prévia da restauração',{exact:true}).waitFor();
  assert.equal(await page.getByText('Resultado',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Confirmar restauração nesta conta',exact:true}).click();
  await page.getByText('Resultado',{exact:true}).waitFor();
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
    await page.getByText('Restaurar backup',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`melhorias-perfil-${width}.png`)});
  }
  await page.evaluate(()=>{for(const e of document.querySelectorAll('div,span,label'))if([...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){e.style.fontSize=`${parseFloat(getComputedStyle(e).fontSize)*1.5}px`;e.style.lineHeight='1.4';}});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.getByRole('button',{name:'Abrir comunidade da fam\u00edlia',exact:true}).click();
  const like=page.getByRole('button',{name:'Curtir publicação, 0 curtidas',exact:true}).first();await like.waitFor();
  const alvo=await like.boundingBox();assert.ok(alvo.width>=44&&alvo.height>=44);
  assert.equal((await like.textContent()).trim(),'0');
  await like.click();
  const curtido=page.getByRole('button',{name:'Descurtir publicação, 1 curtida',exact:true}).first();await curtido.waitFor();
  assert.equal(await curtido.getAttribute('aria-selected'),'true');
  assert.equal((await curtido.textContent()).trim(),'1');
  await curtido.click();await like.waitFor();await like.click();await curtido.waitFor();
  await page.getByRole('button',{name:'Mostrar comentários, 0 comentários',exact:true}).first().click();
  await page.getByRole('textbox',{name:'Escrever comentário',exact:true}).fill('Comentário de interface');
  await page.getByRole('button',{name:'Enviar comentário',exact:true}).click();
  await page.getByText('Comentário de interface',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Excluir meu comentário',exact:true}).click();
  await page.getByText('Comentário de interface',{exact:true}).waitFor({state:'detached'});
  const interacaoCurtida=[...posts.values()].find(e=>e.liked);assert.ok(interacaoCurtida);interacaoCurtida.likes=4;
  interacaoCurtida.comments.unshift({id:'comentario-outro-aparelho',content:'Comentário recebido de outro aparelho',author:'Outro membro',own:false,created_at:new Date().toISOString()});
  await page.getByRole('button',{name:'Atualizar comunidade',exact:true}).click();
  const curtidaAtualizada=page.getByRole('button',{name:'Descurtir publicação, 4 curtidas',exact:true});await curtidaAtualizada.waitFor();
  await page.getByRole('button',{name:'Ocultar comentários, 1 comentário',exact:true}).waitFor();
  await page.getByText('Comentário recebido de outro aparelho',{exact:true}).waitFor();
  await curtidaAtualizada.evaluate(el=>el.scrollIntoView({block:'center'}));
  await page.screenshot({path:path.join(output,'melhorias-interacoes.png')});
  await page.getByRole('button',{name:'Moderar publicação',exact:true}).first().click();
  await page.getByRole('button',{name:'Confirmar exclusão da publicação',exact:true}).click();
  await page.getByText('Publicação de teste 1',{exact:true}).waitFor({state:'detached'});
  await page.screenshot({path:path.join(output,'melhorias-comunidade.png')});
  fs.writeFileSync(path.join(output,'melhorias-validacao.json'),JSON.stringify({diagnostico:true,sincronizacao:true,previa:true,confirmacao:true,larguras:[320,390,430],textoAmpliado:true,curtida:true,iconesAcessiveis:true,atualizacaoInteracoes:true,comentario:true,exclusao:true}));
  console.log('OK UI melhorias: diagnóstico, filas, backup, responsividade, texto ampliado e interações');
}
module.exports={interagir,executar};
