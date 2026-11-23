# Comunidade, backup, diagnóstico e abertura offline

## Arquivos criados

- Componentes: `componentes/ControlesAcessiveis.tsx`, `InteracoesPublicacao.tsx`,
  `Diagnostico.tsx`, `Sincronizacao.tsx`, `RestaurarBackup.tsx` e
  `AtualizacaoAplicativo.tsx`.
- Serviços: `servicos/backup.ts`, `exportarBackup.ts`, `diagnostico.ts`,
  `estadoSincronizacao.ts` e `useFocoModalWeb.ts`.
- Verificação/build: `scripts/gerar-offline.cjs`, `smoke-offline.cjs`,
  `cenarios-melhorias.cjs` e `verificar-melhorias-sql.cjs`.
- Testes: `testes/analiseIdentidade.test.js`, `backupDiagnostico.test.js` e
  `exportarBackup.test.js`.
- Migrações: os dois arquivos listados na preparação abaixo.
- Planejamento e resultados: `docs/IMPLEMENTACAO-MELHORIAS.md` e este guia.

Os pontos de integração existentes foram atualizados em `App.tsx`, Perfil,
Comunidade, gráficos, controles de fotos, barra e serviços de sincronização,
HTML, pós-build e workflow de validação.

## Preparação para publicação

Esta entrega não aplica alterações ao Supabase nem publica o site.
Em homologação, com as migrações anteriores já instaladas, aplique nesta ordem:

1. `supabase/migrations/202611160003_comunidade_interacoes.sql`.
2. `supabase/migrations/202611160004_backup_restauracao.sql`.

Não há projeto Supabase de homologação disponível no momento. As migrações foram
verificadas em PostgreSQL isolado (PGlite); a aplicação em homologação permanece
pendente até esse ambiente existir. A validação em Android/iPhone físicos também
permanece pendente, pois não há aparelhos acessíveis pelo ambiente de execução.

As duas migrações são transacionais e reaplicáveis. Não substituem políticas
existentes de treinos, famílias ou armazenamento. Depois, publique o pacote
gerado por `npm run build:web`, com as variáveis públicas do Supabase configuradas
no ambiente de publicação. Os pacotes usados nos testes locais usam backend
fictício e não devem ser enviados para produção.

## Permissões da Comunidade

As interações aparecem em controles compactos: coração com a contagem de curtidas
e balão com a contagem de comentários. O coração fica preenchido em vermelho
quando a publicação está curtida; tocar novamente desfaz a curtida. O balão abre
ou fecha os comentários. Os controles têm nomes para leitores de tela e área de
toque mínima de 44 px. Atualizar o feed também renova as contagens.
Se os comentários estiverem abertos, a atualização renova também a lista exibida.

| Operação | Quem pode executar |
| --- | --- |
| Consultar reações/comentários | Membros atuais da família da publicação |
| Curtir/descurtir | Membro atual, somente a própria reação |
| Comentar | Membro atual, com texto entre 1 e 1.000 caracteres |
| Excluir comentário | Autor ainda membro ou proprietário da família |
| Excluir/moderar publicação | Autor ainda membro ou proprietário da família |

A RPC `tf_community_interaction` verifica autenticação, participação atual,
publicação e família no servidor. O proprietário é o `owner_user_id` existente;
não foi criado outro sistema de administradores. As novas tabelas têm RLS e
nenhum acesso direto para clientes. Repetir a mesma curtida ou comentário não
cria duplicatas. O ID de um comentário não pode ser reutilizado com outro texto.
As consultas carregam páginas de 20 comentários, com uma linha adicional para
informar a próxima página. Excluir uma publicação remove suas interações por FK.

A moderação da publicação não apaga arquivos físicos do Storage de outro autor.
Arquivos órfãos devem ser tratados pela manutenção administrativa de armazenamento.
URLs assinadas já emitidas permanecem sujeitas à sua expiração; a remoção de uma
publicação não revoga uma URL previamente copiada.

## Identidade e acessibilidade

Os gráficos agrupam por `exercise_id`, preservando o nome de cada sessão no
histórico detalhado. Exercícios homônimos são identificados como cadastros
distintos. Registros sem FK ficam separados por sessão e nome, com rótulo
“sem vínculo”; não é possível reconstruir com certeza a identidade de exercícios
excluídos apenas pelo texto. Não houve alteração retroativa dos registros.

O zoom da página foi liberado, inclusive nos contêineres que usavam `pan-y`.
Há foco visível e retorno ao acionador no modal de foto. As novas ferramentas
usam controles compartilhados com alvos mínimos de 44 px e textos que podem
quebrar linha. A nova interface foi verificada em 320, 390 e 430 px, com
ampliação de texto de 50%. Esses testes não substituem TalkBack/VoiceOver reais.

## Diagnóstico e sincronização

No Perfil, “Copiar diagnóstico” gera somente versão, compilação, plataforma,
navegador, data, conexão, contagens de pendências e eventos de operações/códigos
predefinidos. O histórico de diagnóstico tem limite de 40 eventos em memória.
Não contém conteúdo de treinos, nomes, IDs, e-mails, respostas do servidor ou
tokens. Não é enviado a um serviço externo. Na tela de erro, as contagens não
consultadas são indicadas explicitamente. Se a área de transferência não estiver
disponível, o texto é apresentado para seleção manual.

“Ver detalhes da sincronização” lista as filas locais de treinos/conclusões,
exclusões de sessões, nutrição e fotos. Não cria uma fila paralela. As últimas
tentativas são registradas quando disponíveis; registros antigos ou exclusões
sem esse metadado mostram “não registrada”. Gravar o horário de tentativa de
treino não notifica a interface de uma edição da sessão.

Na nutrição, o horário é gravado antes da autenticação e do envio de cada operação
pendente. Falhas de autenticação ou rede mantêm a tentativa registrada; leituras
remotas e reinícios preservam esse horário. Sem rede, sem fila ou com um conflito
aguardando revisão, o app não registra um envio que não aconteceu.

Os reenvios usam os bloqueios e IDs existentes. Fotos e nutrição são reenviadas
por módulo porque suas filas já têm serialização própria; a interface informa
esse alcance no botão. Conflitos não são sobrescritos: devem ser revisados no
módulo de origem. A lista atualiza ao recuperar a conexão e enquanto aberta.

## Backup e restauração

O backup v2 contém somente dados próprios: planos, exercícios, cargas de
referência, sessões/séries, cardios, medições físicas, agenda semanal e os cinco
tipos de documentos privados de nutrição. O catálogo público não é duplicado.
Dados consultados como treinador, grupos, publicações, permissões e vínculos de
acompanhamento não integram o arquivo. PDFs e CSVs anteriores continuam disponíveis.

As filas locais de treinos, nutrição e fotos são exportadas em uma seção separada,
identificada como não confirmada. Elas são cópias para recuperação assistida;
não são aplicadas automaticamente pela restauração. A exportação consulta as
tabelas e filas em momentos próximos; não promete um snapshot transacional global.

Imagens são referências de armazenamento, sem os arquivos. URLs temporárias e
credenciais não são exportadas como referências. A restauração não reanexa imagens
a exercícios novos e não restaura perfil, senha ou configurações de autenticação.

Na versão web, selecione um arquivo JSON no Perfil. A prévia informa quantos
registros são novos, já existem ou foram recusados por pertencer a sessões ainda
em andamento. Só a confirmação explícita grava dados. Arquivos v1 e v2 são aceitos,
com limites de 10 MB e 10.000 registros. Arquivos maiores precisam de recuperação
assistida; a exportação não trunca os dados para caber nesses limites.

O servidor ignora o proprietário do arquivo e exige a mesma conta autenticada
que abriu a prévia. IDs novos são derivados de forma estável por conta/tabela/ID
de origem. IDs já pertencentes à conta e conflitos naturais (dia alimentar,
dia da semana, carga por série) são preservados, sem sobrescrita. Um mesmo arquivo
reenviado retorna seu recibo; uma cópia modificada também não duplica as mesmas
identidades. Registros iguais com IDs diferentes não são mesclados por nome.

A gravação é uma transação no PostgreSQL: falhas não deixam registros parciais.
O servidor revalida permissões, tipos, referências e os documentos de nutrição na
confirmação. Uma resposta perdida pode ser recuperada reenviando o mesmo arquivo.
Não há transação com imagens, pois o processo não copia arquivos do Storage.
A seleção de arquivos de restauração nesta entrega fica na versão web; o app
nativo orienta a abrir o Perfil pelo navegador.

## Offline e atualização

O pós-build gera `sw.js`, `offline-build.json` e uma identificação da compilação.
Essa identificação inclui os arquivos do pacote e o código gerado do service
worker. Alterar somente o worker também cria um cache distinto; uma instalação
incompleta desse worker não apaga o cache da versão ativa.
O service worker guarda somente os arquivos públicos enumerados do pacote.
Supabase, requisições autenticadas, URLs com parâmetros e callbacks `/auth/`
não são colocados nesse cache. O armazenamento de dados do usuário continua
nas filas existentes, separado por conta.

Depois da primeira carga online e instalação completa do cache, a raiz do app
pode ser reaberta sem rede. A instalação incompleta é descartada, preservando a
versão ativa. O cache dos arquivos não significa que todas as consultas ou todos
os dados remotos estarão disponíveis offline.

Uma nova versão fica em espera e exibe um aviso. Não há recarga automática nem
`skipWaiting`: a ativação aguarda todas as janelas antigas fecharem. Termine e
salve as operações antes de fechar. O novo service worker remove caches antigos
quando assume o controle. Não foi implementada execução contínua em segundo plano.

## Verificação

```powershell
npm run check
npm run test:sql
# Configurar backend fictício para exportação de teste, nunca credenciais reais.
$env:EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:43119'
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_ci_placeholder'
npm run build:web
$env:SMOKE_MELHORIAS_ONLY='1'
npm run test:ui
$env:SMOKE_BROWSER='webkit'
npm run test:ui
Remove-Item Env:SMOKE_MELHORIAS_ONLY
npm run test:offline
Remove-Item Env:SMOKE_BROWSER
npm run test:offline
```

Os testes de banco usam PostgreSQL isolado (PGlite). Os testes de interface
interceptam o backend com dados fictícios e bloqueiam service workers nesse
harness; o worker é exercitado separadamente sobre cópias do pacote exportado,
servidas por HTTP local. A abertura offline é testada com versões A/B, instalação
incompleta, múltiplas janelas e preservação de uma pendência no armazenamento.
Também é testada uma atualização somente do worker, com os mesmos arquivos da
aplicação e falha de instalação, seguida de reabertura offline da versão anterior.
No Chromium, usamos o modo offline do navegador e corte de HTTP; no WebKit,
o transporte HTTP é interrompido porque `setOffline` provoca erro interno do
motor de teste ao recarregar uma página com service worker.

Capturas e logs ficam em `.test-results/`, sem integrar o controle de versão.
Não houve gravação em conta real, aplicação de migração remota, publicação ou
validação em aparelho físico nesta entrega.
