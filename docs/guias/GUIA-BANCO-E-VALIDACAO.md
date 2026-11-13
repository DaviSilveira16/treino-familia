# Banco de dados, publicação e validação

## Banco novo

As migrações iniciais criam as tabelas de treino, medidas, cardio e comunidade a partir do DDL fornecido para o projeto. As migrações seguintes criam Nutrição e Acompanhamento. A base acrescenta as restrições exigidas pelo app para referências de carga e registro idempotente de cardio. Preserva as séries quando um exercício é excluído e permite remover a sessão inteira com suas séries.

As políticas de proprietário, as funções de família e os buckets iniciais representam o contrato validado localmente. O export recebido descrevia tabelas e chaves, então compare funções, permissões, índices, visibilidade e configuração dos buckets com o ambiente hospedado antes de adotá-los em um projeto existente.

## Banco já em uso

Preserve o histórico de migrações do Supabase. Pule os arquivos `20261027000000` e `20261027153000` ao atualizar pelo SQL Editor. A base inicial aborta com `P0001` se `workout_plans` já existe. O arquivo de famílias pode abortar com `42723` se já existe uma função como `tf_resumo_semanal`. Mantenha as funções e políticas atuais de famílias. Em um fluxo pela CLI, compare a estrutura sanitizada com a base antes de registrar essas versões como aplicadas.

Antes de publicar o front-end, confirme que `202610290001_ultimas_cargas_treino.sql` e `202611120001_operacoes_atomicas_treino.sql` já foram aplicadas. Em seguida, execute `202611130001_ordem_cargas_ultima_sessao.sql` e `202611130002_exclusao_atomica_exercicio.sql`, nessa ordem. A primeira preserva as cargas já gravadas e corrige as próximas atualizações. A segunda complementa as operações atômicas e trata as chaves estrangeiras sem cascata do banco existente.

## Verificação local

Use o Node indicado em `.nvmrc` e copie `.env.example` para `.env`, preenchendo a URL e a chave publicável do projeto. Execute `npm ci`, `npm run check`, `npm run test:sql` e `npm run build:web`. Os testes SQL usam PostgreSQL isolado e nunca conectam ao banco ativo.

## Medição no navegador

No console, use `treinoFamiliaPerf.limpar()` antes de cada cenário e `treinoFamiliaPerf.relatorio()` para comparar quantidade de amostras, mediana e p95. Registre as mesmas condições de rede, aparelho, exercícios e séries. Compare conclusão simples, criação de plano, adição ao original e recuperação offline. Os rótulos `treino.confirmarConclusao.*` medem a confirmação remota, `treino.prepararModelo` mede o preparo do modelo e `treino.sincronizacao` mede a fila. Os rótulos `nutricao.armazenamento.*` medem a leitura, interpretação e gravação locais. Use uma conta de teste com histórico de vários meses para avaliar quando separar cache descartável da fila persistente.

## Validação em aparelhos

1. No Android, abra a galeria e a câmera em Meus treinos, no cronômetro e na Comunidade. Teste cancelar o seletor e repetir o envio.
2. No iPhone, volte com o gesto de borda em Meus treinos, no treino ativo e no diário de Nutrição. Confirme que o rascunho permanece disponível.
3. Conclua um treino com a rede desligada, feche o app e volte à mesma conta. Religue a rede, confirme a conclusão e confira a sessão no histórico.
4. Com uma foto pendente, troque de conta e confirme que a pendência aparece apenas na conta original. Volte para ela, use **Tentar enviar fotos** e confirme a imagem no treino salvo.
