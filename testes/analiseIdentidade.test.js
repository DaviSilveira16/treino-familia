const assert = require('node:assert/strict');
const { carregar } = require('./suporte.cjs');
const { analisarHistorico } = carregar('servicos/analiseTreinos.ts');
const sessoes = [1,2,3].map(i => ({id: `s${i}`, started_at: `2026-11-${10+i}T12:00:00Z`, status:'concluido'}));
const serie = (s,id,nome,peso) => ({session_id:s,exercise_id:id,exercise_name:nome,set_number:1,reps:10,weight_kg:peso});
const r = analisarHistorico(sessoes,[serie('s1','a','Remada',10),serie('s2','b','Remada',90),serie('s3','a','Remada nova',20),serie('s1',null,'Remada',5),serie('s2',null,'Remada',7)]);
assert.equal(Object.keys(r.porExercicio).length,4);
assert.equal(r.porExercicio['exercicio:a'].pontos.length,2);
assert.equal(r.porExercicio['exercicio:a'].pontos[0].nome,'Remada');
assert.equal(r.porExercicio['exercicio:a'].nome,'Remada nova');
assert.equal(r.recordes.filter(x=>x.chave==='exercicio:b').length,0);
assert.equal(r.porExercicio['legado:s1:remada'].pontos.length,1);
assert.match(r.porExercicio['legado:s1:remada'].nome,/sem vínculo/);
// Um ID que já não está no cadastro ainda mantém seu histórico.
assert.equal(r.porExercicio['exercicio:b'].pontos[0].cargaMaxima,90);
const iguais=analisarHistorico(sessoes,[serie('s1','a','Remada',10),serie('s2','b','Remada',90)]);
assert.notEqual(iguais.porExercicio['exercicio:a'].nome,iguais.porExercicio['exercicio:b'].nome);
assert.match(iguais.porExercicio['exercicio:a'].nome,/cadastro/);
console.log('OK identidade dos exercícios, snapshots e legado isolado');
