# Nutrição do Treino Família

O módulo registra a alimentação por data, mantém a dieta padrão separada do consumo confirmado e relaciona o diário aos treinos e cardios existentes. Os dados pessoais de nutrição são privados e não são publicados na Comunidade.

## Organização em blocos

A aba Nutrição abre um painel no mesmo padrão de cartões da área de Treinos:

- **Minha dieta**: criar modelos, organizar refeições e configurar a repetição diária.
- **Alimentação de hoje**: confirmar o consumo, ajustar quantidades e concluir o diário.
- **Análise**: comparar alimentação e exercícios no dia e na semana.
- **Histórico alimentar**: consultar semanas e abrir os registros de cada data para corrigir.
- **Minhas metas**: revisar os dados e configurar metas e gasto base.

Cada cartão abre sua área com botão de retorno. Ao abrir um diário pelo histórico, voltar retorna à lista de datas. O botão do Android e o gesto no iPhone em modo app seguem esse mesmo retorno interno, sem criar entradas de histórico do Safari.

## Instalação no Supabase

1. Faça uma cópia de segurança do banco do projeto.
2. No SQL Editor do **mesmo projeto Supabase usado pelo app**, execute [202610280001_nutricao.sql](supabase/migrations/202610280001_nutricao.sql).
3. Execute depois a migração de catálogo `202610280002_catalogo_taco.sql`, entregue separadamente, para disponibilizar os alimentos da TACO.
4. Recarregue o aplicativo e use “Sincronizar” em Nutrição. Cadastros feitos antes da migração permanecem na fila deste aparelho.

A implementação de código não aplica SQL ao banco remoto. O catálogo depende da segunda migração; o cadastro de alimentos pelo rótulo continua disponível quando a fonte externa está indisponível. Se a primeira migração ainda não tiver sido aplicada, o app informa o nome do arquivo necessário e mantém as alterações locais pendentes, sem apresentá-las como confirmação do servidor.

As migrações são aditivas: criam tabelas e funções de nutrição. Elas não alteram as tabelas de treinos, cargas, cardio, frequência ou autenticação existentes.

## Tabelas e permissões

| Tabela | Conteúdo | Leitura no cliente |
| --- | --- | --- |
| `nutrition_days` | Um documento de diário por usuário e data local | Somente o proprietário |
| `nutrition_templates` | Versões dos modelos de dieta e suas refeições | Somente o proprietário |
| `nutrition_goals` | Metas, vigência e parâmetros de estimativa | Somente o proprietário |
| `nutrition_preferences` | Repetição diária, modelo padrão, favoritos e recentes | Somente o proprietário |
| `nutrition_foods` | Alimentos públicos e alimentos cadastrados pelo usuário | Catálogo público e próprios |
| `nutrition_operations` | Recibos de operações para reenvio idempotente | Sem acesso direto pelo cliente |

As tabelas usam RLS. O cliente autenticado pode consultar as linhas permitidas, mas não pode inserir, atualizar ou apagar diretamente essas tabelas. As gravações passam por `nutrition_save_document`, que confirma `auth.uid()`, propriedade, identidade, data, estrutura das refeições, quantidades e nutrientes. A função usa um caminho de pesquisa fixo e uma lista fechada de tabelas. Não recebe nomes de tabela livres do cliente.

A migração substitui as políticas existentes **somente nas tabelas `nutrition_*` deste módulo** e revoga grants de `PUBLIC`, `anon` e `authenticated` antes de conceder as leituras. Isso impede que uma política permissiva esquecida se combine por `OR` com a regra de propriedade. Não a use para manter políticas personalizadas dessas tabelas sem revisar o contrato.

Alimentos com `user_id = null` são o catálogo compartilhado. Sua manutenção exige uma migração ou ambiente administrativo; usuários autenticados não podem editar esse catálogo.

Quantidades, calorias e macronutrientes ficam em valores numéricos JSON, preservando frações. Revisões são inteiras. Os snapshots guardam os nutrientes usados no momento do registro, por isso uma atualização do catálogo não recalcula silenciosamente a alimentação passada.

## Sincronização e conflitos

O repositório (`servicos/nutricaoRepositorio.ts`) guarda as mudanças no AsyncStorage antes de retornar ao formulário. A chave local é separada pelo ID do usuário. As escritas locais da mesma conta são serializadas.

Cada recurso possui uma revisão remota e uma fila de operações com UUIDs persistidos. O servidor só aceita uma alteração se a revisão esperada corresponde à revisão atual. A gravação do documento inteiro e seu recibo acontecem na mesma transação do PostgreSQL.

Se uma resposta se perder depois da gravação, o reenvio usa o mesmo UUID. O recibo faz o servidor reconhecer que a operação já foi concluída. Uma edição feita enquanto o envio anterior está em andamento permanece na fila e será enviada depois da confirmação anterior. Uma consulta remota não substitui documentos com alterações locais pendentes.

Refeições e alimentos removidos do diário são retirados do snapshot completo daquele dia. A confirmação de um snapshot anterior não remove uma edição mais recente da fila e não deve ressuscitar o item removido.

Quando dois aparelhos alteram o mesmo recurso a partir da mesma revisão, a segunda gravação produz um conflito. O app mantém a versão local e a versão remota. Antes de resolver, ambas são arquivadas neste aparelho. A API de resolução é:

```ts
resolverConflitoNutricao(usuarioId, recursoId, "local" | "remoto")
listarCopiasConflitosNutricao(usuarioId)
```

Escolher a versão local cria uma nova operação sobre a revisão remota conferida. Escolher a versão remota encerra a fila desse recurso e mantém as cópias arquivadas. Se os dois aparelhos criarem a mesma data com UUIDs diferentes, a restrição `(user_id, local_date)` mantém somente um diário remoto; a resolução passa a usar o identificador canônico.

As cópias locais de conflito e filas pendentes dependem dos dados deste navegador/aparelho. Limpar os dados do site, desinstalar o app ou apagar seu armazenamento pode removê-las antes da confirmação remota. A API não apaga essas cópias automaticamente.

Antes de cada envio remoto o repositório confere a conta autenticada. Trocar de conta impede o envio de registros pertencentes à conta anterior. Os dados locais de uma conta não são reutilizados pela outra.

## Catálogo e desempenho

As buscas usam páginas de 20 alimentos. O banco tem índices por usuário, data e nome. O catálogo não é incluído no pacote JavaScript inicial do aplicativo.

Os resultados pesquisados ficam em um cache local por conta. Alimentos próprios, favoritos e recentes são preservados; o restante do cache tem limite. Em outro aparelho, os IDs de favoritos e recentes são consultados para recuperar seus snapshots. Sem conexão, a busca informa que mostra apenas os alimentos já conhecidos naquele aparelho.

## Verificações

O teste `testes/nutricaoRepositorio.test.js` cobre:

- Resposta perdida após gravação e reenvio sem duplicação.
- Exclusão em uma revisão posterior sem ressurgimento de itens.
- Retomada da fila após recarregar o módulo.
- Nova edição enquanto a confirmação anterior está em voo.
- Consulta remota preservando mudanças offline.
- Conflitos entre aparelhos, escolha explícita e preservação das cópias.
- Identificadores diferentes para a mesma data.
- Isolamento entre contas.
- Migração ausente com alimento manual preservado.
- Consulta do catálogo com cache offline e proteção de itens públicos.
- Corrupção do arquivo local preservando seu conteúdo original.
- Falha de disco antes da gravação e após uma confirmação remota.
- Recibo antigo seguido por revisão externa, sem sobrescrever o outro aparelho.
- Valores não finitos e datas impossíveis recusados antes da serialização.

O script opcional `scripts/verificar-nutricao-sql.cjs` executa as migrações em PostgreSQL real via PGlite, instalado apenas em uma pasta temporária. Ele valida reaplicação da migração, catálogo, RLS entre duas contas e `anon`, proibição de escritas diretas, RPC, CAS, recibos, dados fracionários e rejeição de documentos malformados. Pode ser executado com:

```powershell
$qaNutritionDir = Join-Path $env:TEMP 'treino-familia-nutrition-sql-check'
npm.cmd install --prefix $qaNutritionDir @electric-sql/pglite --no-audit --no-fund
node scripts/verificar-nutricao-sql.cjs (Join-Path $qaNutritionDir 'node_modules/@electric-sql/pglite')
```

PGlite não foi adicionado às dependências do aplicativo. A execução no projeto Supabase remoto e a validação com suas sessões reais continuam dependendo da aplicação das migrações; o teste local não significa que o banco remoto foi atualizado.

## Resultado da validação desta entrega

- `npm run check`: TypeScript aprovado, 21 arquivos de testes aprovados e lint sem erros. Permanecem 42 avisos nos arquivos preexistentes do aplicativo.
- `npm run build:web`: exportação web aprovada. A tela de Nutrição é carregada sob demanda; o catálogo não integra o JavaScript do cliente.
- `npm run test:nutricao:ui`: aprovado em Chrome e WebKit com viewport móvel de 390 × 844. O cenário cobre metas, catálogo, alimento manual com vírgula/ponto decimal, porções com peso conhecido, consumo explícito, saldo diário/semanal com treino, dieta repetida, exceção de um dia, registro de uma refeição sem duplicar e exclusão offline após recarregar/sincronizar.
- `npm run test:ui`: regressão dos treinos aprovada em Chrome, incluindo conclusão offline, cópias, histórico, exclusão persistente, famílias e gesto de voltar. O seletor do teste de histórico foi ajustado para considerar o texto visível, pois a navegação mantém telas anteriores montadas.
- Migrações executadas em PostgreSQL isolado: reaplicação idempotente, 544 alimentos, RLS, duas contas, usuário anônimo, RPC, revisões concorrentes, recibos e valores decimais aprovados.

Os cenários de navegador usam contas e backend fictícios, com todas as chamadas externas interceptadas. Eles não modificam dados reais. Chrome/WebKit móveis não substituem a validação em aparelhos Android/iPhone físicos nem uma build nativa; nenhuma publicação ou migração remota foi executada nesta entrega.

O modelo de gasto, suas limitações e as fontes da TACO e da equação de repouso estão em [FONTES-NUTRICAO.md](FONTES-NUTRICAO.md).
