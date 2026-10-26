# Treino reaparecendo depois da exclusão

A exclusão anterior aceitava `error: null` como prova de remoção. No Supabase, um DELETE que não afetou linhas pode retornar sem erro, inclusive quando uma política não permite excluir a linha. Além disso, a fila local podia manter `criacaoPendente` depois de a sessão já existir no servidor. Se a linha desaparecesse, um envio posterior podia criá-la novamente.

A correção cria um pedido persistente por usuário e ID da sessão antes da exclusão. Preserva uma cópia das alterações locais e impede reenvios desse ID, inclusive a partir de snapshots antigos. Aguarda envios já em andamento antes do DELETE, de forma que a exclusão ocorra depois de um INSERT que já tivesse começado. O pedido continua guardado se a conexão falhar; o processamento em segundo plano pode retomá-lo, sem reativar o treino.

O DELETE pede os IDs afetados e é seguido por uma consulta do mesmo ID e usuário. A interface só anuncia sucesso depois de confirmar que a sessão não está mais disponível no servidor. Se ela continuar lá, apresenta o erro e mantém o registro visível para nova tentativa. Uma resposta perdida depois da exclusão é reconhecida pela releitura. O mesmo critério de confirmação foi aplicado aos cardios.

A Frequência cancela consultas anteriores e invalida sua geração antes da operação. Depois da confirmação, retira apenas o ID selecionado, invalida o cache e recarrega os dados. Outros treinos e cardios do dia, os planos e os dados de outras contas permanecem intactos. A sincronização também passa a desmarcar `criacaoPendente` assim que comprova a existência da sessão; uma sessão já conhecida que desaparecer não é tratada como uma criação offline nova.

Os testes cobrem exclusão recusada sem erro, resposta perdida, falha na conferência, falta de espaço para a cópia, usuário diferente, preservação de outra sessão no mesmo plano, INSERT em voo seguido de exclusão, cópia antiga gravada por outra aba e uma sessão removida em outro fluxo. O teste de interface exclui pela Frequência, sai e retorna, reabre o app e tenta sincronizar um snapshot antigo, conferindo o banco fictício e os demais registros.

O cancelamento das consultas também foi preservado até a leitura do corpo da resposta. A combinação anterior de sinais desligava o sinal do chamador assim que chegavam os cabeçalhos, permitindo que uma leitura antiga continuasse após sair da tela ou começar a excluir. Usa composição nativa com prazo quando disponível; em ambientes antigos, mantém o sinal original do chamador.

A integração contínua usa `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:43119` durante build e testes de interface, com um servidor fictício na mesma origem. Isso isola o backend de testes e não modifica a configuração de produção. Para reproduzir, definir essa variável e a chave pública fictícia antes de `npm run build:web`, executar `npm run test:ui` e depois repetir com `SMOKE_BROWSER=webkit`. Executar os navegadores em sequência, pois usam a mesma porta. `npm run check` valida tipos, lint e os 12 arquivos de testes.

Não houve consulta autenticada nem alteração dos registros reais do usuário. A investigação da conta específica depende da conexão do Supabase; os testes não comprovam quais políticas ou duplicatas existem nessa conta. Não foi criada ou aplicada uma migração SQL.
