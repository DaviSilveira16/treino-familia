# Treinador, aluno e edição do nome dos treinos

## Ativação no Supabase

Execute `supabase/migrations/202611050001_acompanhamento.sql` no SQL Editor do mesmo projeto Supabase usado pelo aplicativo e publique a versão atualizada do app/site. A migração é transacional e reaplicável. Ela depende das tabelas de treinos já existentes; não substitui suas políticas de acesso nem altera registros antigos.

Em seguida, execute `supabase/migrations/202611060001_edicao_treinos_aluno.sql` para habilitar a edição direta e as fotos dos exercícios. Se a primeira migração já foi aplicada, basta esta segunda. Ela depende também do bucket privado `exercise-photos` e da coluna `exercises.photo_path`, já usados pelo editor normal.

Os testes usam um PostgreSQL isolado com tabelas representativas do aplicativo. Não aplicam a migração ao projeto remoto. O ambiente desta implementação não tem uma conexão administrativa com esse projeto.

A edição do nome de um treino usa a permissão de atualização do proprietário já existente e funciona independentemente da migração de acompanhamento.

## Usar

1. Abra **Perfil** ou **Meus treinos → Meu treinador e pessoas que acompanho**.
2. Em **Pessoas que acompanho**, gere um convite e compartilhe o código. Cada código tem validade de sete dias, permite um aceite e pode ser cancelado.
3. O aluno cola o código em **Meu treinador**, confere o nome de quem convidou e aceita explicitamente o compartilhamento.
4. O treinador atualiza a lista e abre **Acompanhar [nome]**. A área da pessoa mostra seu nome e os blocos **Treinos**, **Histórico** e **Frequência**, no padrão da tela inicial do aplicativo. Cada bloco abre sua própria área; Voltar retorna aos blocos antes de sair do acompanhamento.
5. **Treinos** abre o próprio componente de **Meus treinos**, identificado com o nome do aluno: criar/remover treinos, renomear, adicionar/editar/remover exercícios, mudar a ordem, definir cargas por série e escolher fotos. Os formulários e cartões são os mesmos, sem o botão de iniciar cronômetro. As alterações são salvas diretamente nos treinos do aluno.
6. Para preparar uma entrega separada, use **Fichas em rascunho** na área do aluno. É possível copiar modelos próprios ou usar um treino do aluno como base. **Salvar rascunho** guarda a ficha sem entregá-la; **Disponibilizar treino ao aluno** cria uma nova cópia versionada. A cópia usa a primeira carga por exercício: revise antes de entregar.
7. O aluno usa o registro e cronômetro habituais. As orientações originais ficam disponíveis no treino e na sessão ativa, com uma cópia local para leitura sem conexão depois da primeira consulta.
8. Em **Minhas observações de treino**, o aluno pode comentar uma sessão concluída. As observações também podem ser editadas na área de acompanhamento com seu treinador. O treinador vê esses comentários, as séries realizadas e a contagem de treinos dos últimos 30 dias.
9. **Editar nome** em cada cartão de Meus treinos permite renomear uma ficha própria ou recebida sem recriar o plano nem perder exercícios, cargas ou sessões. **Atualizar meus treinos** consulta novas entregas; fechar o painel de acompanhamento também atualiza a lista.

Uma conta pode ser aluno e treinador simultaneamente, inclusive manter mais de um vínculo. Cada pessoa precisa aceitar o próprio convite. A consulta e edição de acompanhamento exigem conexão: dados de alunos não ficam em um cache offline do treinador.

O bloco **Frequência** mostra um calendário mensal de musculação, dias treinados, quantidade de sessões e tempo registrado. Tocar em um dia mostra os treinos e observações daquela data. A consulta considera todas as páginas necessárias do histórico, sem limitar o calendário às primeiras 20 sessões. As datas seguem o fuso horário do aparelho que consulta. Essa reorganização usa a RPC já existente e não requer uma nova migração SQL.

## O que acontece ao separar

Qualquer uma das partes pode usar **Sobre o vínculo → Encerrar vínculo**. A operação grava somente a data de encerramento do vínculo. Não exclui nem modifica planos, exercícios, referências de carga, sessões, séries, orientações entregues ou observações.

Todos os treinos entregues pertencem ao aluno desde a publicação, usando seu `user_id`. Depois da separação, o aluno continua podendo abrir, executar, adaptar e renomear esses treinos; as observações permanecem editáveis. O antigo treinador perde a autorização para consultar treinos/histórico, preparar fichas ou publicar novas versões naquele vínculo.

Rascunhos não publicados permanecem arquivados no vínculo encerrado e não são entregues automaticamente. Um novo convite aceito cria um novo vínculo; não reabre os rascunhos anteriores. Os modelos próprios do treinador não são modificados.

Encerrar o vínculo não equivale a excluir a conta. O aluno ainda pode remover voluntariamente os seus próprios registros pelos controles já existentes.

## Versões e histórico

Cada revisão publicada gera um novo plano do aluno, identificado por `Nome · vN`. Em caso de nome já utilizado, recebe um sufixo numérico. As versões anteriores continuam disponíveis. O aluno escolhe quando começar a usar a nova ficha; nenhuma atualização troca o plano de uma sessão em andamento ou de um rascunho offline.

A prescrição original fica em um snapshot independente das cargas reais e das adaptações do aluno. Renomear o plano não altera esse snapshot. Publicações repetidas da mesma revisão retornam a entrega existente, sem duplicar planos ou exercícios. Um treino removido pelo próprio aluno não é recriado ao repetir uma publicação antiga.

## Permissões e confiabilidade

- O aceite compartilha treinos cadastrados, histórico de musculação, frequência, séries, cargas e observações. Nutrição, medidas, e-mail e credenciais não são expostos pelo módulo.
- A edição direta inclui as fotos dos exercícios; fotos de perfil e medidas continuam privadas. O texto do convite informa os controles de criação, edição e remoção.
- O código de convite é gerado aleatoriamente pelo PostgreSQL e separado do identificador de reenvio enviado pelo aplicativo.
- Tabelas `coaching_*` têm RLS e nenhum acesso direto concedido a `anon`/`authenticated`. As operações passam pela RPC `tf_coaching`, que verifica `auth.uid()`, participantes, vínculo ativo e propriedade em cada ação.
- O treinador não recebe permissão direta de escrita nas tabelas privadas do aluno e não pode registrar séries/conclusões em seu lugar. A publicação cria uma nova cópia exclusivamente para o aluno daquele vínculo.
- Encerramento e operações protegidas usam o mesmo bloqueio de linha. Novas requisições do treinador são recusadas após a confirmação da revogação. Uma leitura já concluída não pode ser desfeita; a interface revalida o vínculo a cada 30 segundos e ao voltar ao aplicativo, e oculta o histórico se a consulta falhar.
- Salvamentos verificam a revisão esperada para evitar sobrescrever edições concorrentes. Reenvio idêntico após resposta perdida é reconhecido. A publicação grava plano, exercícios, cargas e recibo na mesma transação; uma falha reverte tudo.
- A RPC `tf_coaching_workouts` deriva o aluno pelo vínculo, verifica a conta em cada chamada e mantém as tabelas de treinos protegidas por suas políticas atuais. O editor compartilhado não troca a sessão autenticada nem persiste dados privados do aluno no cache do treinador.
- Edições diretas conferem a versão completa do treino e bloqueiam alterações quando há uma sessão em andamento. Recibos e snapshots anteriores ficam em `coaching_workout_edits`, sem acesso direto pelos clientes. Exclusões explícitas preservam nomes, cargas e séries já realizadas; encerrar o vínculo não exclui nada.
- Fotos usam políticas restritas ao bucket `exercise-photos` e ao caminho do exercício do aluno vinculado. O treinador pode enviar e consultar, mas não apagar arquivos. URLs assinadas para o treinador duram 60 segundos; uma URL já emitida pode permanecer válida até expirar após o encerramento.
- Ao abrir Meus treinos, referências já existentes são preservadas; recuperar cargas do histórico só preenche exercícios sem referência. Assim, abrir a tela não desfaz ajustes do treinador.
- Histórico e consulta de modelos usam páginas de 20; o editor carrega a lista de planos como Meus treinos. Não há chat, cobrança ou prescrição automática.

## Verificação local

```powershell
npm run check
npm run build:web
$coachingQaDir = Join-Path $env:TEMP 'treino-familia-coaching-sql-check'
npm.cmd install --prefix $coachingQaDir @electric-sql/pglite --no-audit --no-fund
node scripts/verificar-acompanhamento-sql.cjs (Join-Path $coachingQaDir 'node_modules/@electric-sql/pglite')
$env:SMOKE_BROWSER_CHANNEL = 'chrome'
node scripts/smoke-acompanhamento.cjs (Join-Path $coachingQaDir 'node_modules/@electric-sql/pglite')
Remove-Item Env:SMOKE_BROWSER_CHANNEL
$env:SMOKE_BROWSER = 'webkit'
node scripts/smoke-acompanhamento.cjs (Join-Path $coachingQaDir 'node_modules/@electric-sql/pglite')
Remove-Item Env:SMOKE_BROWSER
```

O teste de interface intercepta todas as requisições externas e usa duas contas fictícias com PostgreSQL isolado. Cobre consentimento, edição, publicação, versões, consulta dos treinos do aluno, orientações, renomeação persistente, séries realizadas, observações e separação com dados preservados. As capturas ficam em `.test-results/acompanhamento-*`. Os testes de navegador não substituem a validação em aparelhos físicos.

## Validação

- `npm run check`: TypeScript, lint e testes de serviços, incluindo isolamento de conta e reenvio do editor do aluno.
- `npm run build:web`: aprovado.
- PostgreSQL isolado: migração reaplicável, convites, aceite, isolamento entre contas, validação, publicação atômica, reenvios, revisões, paginação e preservação após separação aprovados.
- Fluxo de acompanhamento em viewport móvel: os três blocos, editor compartilhado sem cronômetro, alterações persistidas na conta do aluno, histórico preservado e calendário com mais de 20 sessões no mesmo mês.
- Regressão geral `npm run test:ui` em Chrome: aprovada. A preparação do registro manual agora informa explicitamente as cargas das séries iniciais, sem depender de referências alteradas por cenários anteriores.
- Corrigidas as incompatibilidades de tipo do alerta nativo e da medição do ScrollView; os testes anteriores receberam a simulação explícita da instrumentação de desempenho já usada pelos serviços.
- Nenhuma publicação, migração remota ou teste em aparelho físico foi executado.
