# Cargas do treino após concluir uma sessão

Execute no SQL Editor do projeto Supabase a migração `supabase/migrations/202610290001_ultimas_cargas_treino.sql`. A instalação é aditiva e reaplicável. Ela não reprocessa sessões antigas nem altera as referências existentes ao instalar. A nova versão do site e esta migração são necessárias para a experiência completa.

Uma nova conclusão feita no modo com cronômetro atualiza, na mesma transação, as referências de cada exercício realizado: quantidade de séries, repetições e cargas. Pesos menores também são guardados. Exercícios sem séries realizadas permanecem cadastrados com suas referências anteriores. Não há criação automática de exercícios avulsos quando a pessoa escolhe usá-los apenas na sessão.

As séries concluídas ficam ordenadas e numeradas de 1 a N nas referências. Se foram realizadas apenas as séries 1 e 3, o próximo treino terá duas séries, com os valores delas. O histórico conserva os números, valores e snapshots originais. O texto geral de repetições passa a refletir o valor comum ou a faixa entre o mínimo e máximo realizados; cada série conserva sua repetição individual em `exercise_load_defaults`.

Ao salvar como novo treino, a sessão já aponta para os novos exercícios e plano quando a transação conclui; somente esse destino recebe as referências. Ao adicionar exercícios ao original, as referências são atualizadas para os exercícios antigos e novos que realmente foram realizados. O registro manual pela Frequência mantém o comportamento anterior e não atualiza automaticamente as cargas do modo ativo.

O banco compara a data real de início da sessão, depois a conclusão e o UUID para desempatar. O horário do reenvio não participa dessa ordem. Um envio offline antigo não substitui uma sessão mais recente. Uma tabela privada de origem conserva essa ordem mesmo se o último registro for posteriormente apagado do histórico. Repetir a confirmação não reaplica valores e não desfaz uma edição manual posterior nas cargas de Meus treinos. Só uma nova sessão mais recente volta a atualizá-los.

A função do trigger verifica a identidade autenticada e o proprietário da sessão, plano, exercício e séries. Ela usa caminho de pesquisa fixo, bloqueia os exercícios em ordem estável e não concede acesso direto à tabela privada de origem. Uma falha ao gravar as referências desfaz a conclusão na mesma transação; o mecanismo existente mantém o rascunho para reenvio. Não há uma segunda requisição de atualização de cargas que possa se perder após a confirmação.

A segunda fase de `salvarModeloDoTreino` não reinsere o planejamento antigo após a confirmação, pois as referências podem ter sido reduzidas às séries concluídas. A primeira fase mantém as conferências de valores; a segunda preserva as conferências de identidade, proprietário, nome e vínculos.

O cenário PostgreSQL pode ser executado com PGlite fora das dependências do app:

```powershell
$qaWorkoutDir = Join-Path $env:TEMP 'treino-familia-nutrition-sql-check'
npm.cmd install --prefix $qaWorkoutDir @electric-sql/pglite --no-audit --no-fund
node scripts/verificar-cargas-sql.cjs (Join-Path $qaWorkoutDir 'node_modules/@electric-sql/pglite')
```

Esse teste verifica reaplicação sem backfill, valores decimais e menores, séries não realizadas, idempotência, reenvio antigo, exclusão do histórico, destino novo/adicionar, registro manual preservado, rollback atômico e isolamento entre contas/anon. Ele não aplica SQL ao banco remoto.

## Maior carga por série

O cartão antes chamado Última sessão agora mostra **Maior carga por série**. Para o mesmo exercício cadastrado, cada número de série concorre separadamente entre as sessões concluídas do histórico. A primeira série pode ter ocorrido num dia e a segunda em outro. As repetições e a data exibidas pertencem ao registro vencedor; em empate de peso, usamos o registro mais recente.

**Usar maiores cargas nas séries abertas** copia cada recorde para o número correspondente da sessão atual. Séries já concluídas ficam preservadas. A cópia não adiciona séries automaticamente; use Adicionar série quando necessário. Exercícios com nomes iguais e identificadores diferentes não são confundidos.

A consulta usa paginação e um cache separado por conta/exercício. Sem conexão, os valores disponíveis aparecem como provenientes da última consulta. Exclusões locais são respeitadas também no cache. O histórico é conferido ao abrir/retornar à tela ou recuperar a conexão, evitando reconsultá-lo a cada série em andamento.

## Rolagens e verificação de interface

Selecionar um treino em Meus treinos leva ao botão Iniciar treino com cronômetro. Adicionar exercício leva ao início do formulário daquele treino. A medição usa a posição real dos elementos na janela, e a rolagem só ocorre em resposta à seleção explícita. Cancelar mantém o retorno à posição de origem.

Os cenários de navegador usam backend fictício, sem acesso aos dados reais. Foram verificados em Chrome e WebKit com tela móvel: 31 treinos para validar os destinos de rolagem; recordes de 60 kg na primeira série e 50 kg na segunda, originados de dias diferentes; repetições preservadas e cópia sem alterar uma série concluída. Execute:

```powershell
$env:SMOKE_BROWSER_CHANNEL = 'chrome'
$env:SMOKE_RECORDS_ONLY = '1'
npm.cmd run test:ui
Remove-Item Env:SMOKE_RECORDS_ONLY
$env:SMOKE_SCROLLS_ONLY = '1'
npm.cmd run test:ui
Remove-Item Env:SMOKE_SCROLLS_ONLY
```

Para WebKit, remova `SMOKE_BROWSER_CHANNEL` e defina `SMOKE_BROWSER=webkit`. Os testes móveis simulados não substituem uma validação em aparelhos físicos. Esta entrega não publica a versão web nem aplica a migração ao projeto remoto.

## Resultado e limitação da regressão

`npm run check` passou com 21 arquivos de testes, TypeScript sem erros e lint sem erros (42 avisos preexistentes). A exportação web e a verificação PostgreSQL passaram. A regressão completa dos treinos passou em Chrome. Os cenários específicos de Nutrição, recordes por série e rolagens passaram em Chrome e WebKit.

Na regressão completa do WebKit, as verificações funcionais de edição, finalização, histórico, famílias, frequência, exclusões e cardio passaram. A asserção final de diagnóstico de rede continuou falhando por erros nativos `TypeError` em `auth/v1/user` e `rpc/tf_resumo_semanal`, durante as fases de queda/retomada simulada da conexão. A instrumentação não os classificou como offline ou cancelados. Essa rodada não é apresentada como totalmente aprovada, e a asserção não foi enfraquecida. O relatório local fica em `.test-results/webkit/diagnostico-final.txt`; o comportamento em uma sessão real ainda precisa ser conferido.
