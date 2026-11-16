# Painel web, dados da conta e publicação

## Atualizar um banco existente

1. Em homologação, confirme a presença de `weekly_workout_schedule` e compare as políticas e os buckets com os do banco ativo. Aplique `202611160001_painel_semanal.sql` e, em seguida, `202611160002_exclusao_conta.sql`. As migrações de instalação inicial servem para bancos novos.
2. No Supabase Auth, inclua `{{ .Token }}` no e-mail usado por `signInWithOtp`. Preserve o link já usado pelos demais fluxos. Publique a Edge Function com `supabase functions deploy excluir-conta --project-ref <homologacao>` e confirme as credenciais internas padrão do Supabase. A chave de serviço fica na função.
3. Use duas contas descartáveis. Confira que a conta A não lista, altera nem exporta dados da B. Teste o acesso aos objetos por caminho e URL assinada, a saída de uma família e a revogação de um vínculo de acompanhamento. Verifique as políticas de `public` e `storage.objects` e se cada bucket privado continua privado.
4. Teste código errado, família compartilhada, retentativa após falha e exclusão completa. Confira os objetos, as tabelas e o usuário no Auth após cada rodada. Repita com conta criada via Google. A titularidade de família compartilhada requer solução com a administração antes da exclusão. A rotina preserva os dados de outros membros e o histórico do aluno quando o treinador exclui a conta.
5. A remoção de arquivos, a transação de dados e a exclusão no Auth são etapas separadas. Se a última falhar, solicite outro código e repita. Se o Auth informar que a conta ainda é proprietária de objetos, revise a titularidade desses arquivos e preserve as fotos que pertencem a outras contas.

## Lembretes

O painel usa o horário local e guarda configurações e avisos lidos na conta deste navegador. A programação semanal sincroniza via Supabase. Envio em segundo plano depende de Service Worker, armazenamento de inscrições por conta e aparelho, chaves VAPID no servidor, agendamento e revogação no logout. Só então peça permissão em resposta à escolha do usuário. No iPhone, valide o pedido de permissão pelo app instalado na tela inicial. Use texto genérico nos avisos familiares.

## Publicação e validação

- Depois do push para `main`, o GitHub Actions publica automaticamente na Vercel se o job `verificar` passar e a revisão ainda for a mais recente da branch. O workflow também pode ser repetido manualmente em `main` com `publicar` ativado.
- No ambiente `Production` do GitHub, adicione `VERCEL_TOKEN` em Secrets e os IDs `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID` em Variables. A integração Git direta da Vercel para `main` fica desativada em `vercel.json` para que a publicação passe pelos testes.
- Em homologação, provoque uma falha de teste e confira que o trabalho de publicação fica bloqueado e que o alias não muda. Depois valide a revisão aprovada. Confira os cabeçalhos do HTML e de um asset versionado.
- Em Android e iPhone, reabra o app instalado após trocar a versão de homologação. Faça isso com treino ativo, atualização de Nutrição ainda pendente e foto em fila. Verifique retorno, rolagem, teclado e área segura com a barra do navegador expandida e recolhida.
- Use `treinoFamiliaPerf.relatorio()` antes e depois, em sessão simples, criação de ficha e recuperação offline. Registre chamadas, mediana e p95 para abrir painel, abrir Meus treinos e finalizar. Compare amostras no mesmo dispositivo e condições de rede.

## Medição local com dados fictícios

Comparação entre a revisão base `6d39f98` e a implementação, em Chromium móvel emulado. Os tempos incluem a espera do teste pelo estado visível. As chamadas concluídas foram contadas pelos rótulos `supabase.*` de `treinoFamiliaPerf.relatorio()`. Cinco execuções por tela e uma execução por tipo de conclusão.

| Cenário | Chamadas antes → depois | Mediana antes → depois | p95 antes → depois |
| --- | ---: | ---: | ---: |
| Abrir painel | 5 → 8 | 302 → 263 ms | 311 → 336 ms |
| Abrir Meus treinos e selecionar ficha | 5 → 5 | 496 → 475 ms | 940 → 939 ms |
| Confirmar sessão simples | 6 → 6 | 124 → 101 ms | — |
| Confirmar criando ficha com fotos | 13 → 16 | 152 → 135 ms | — |
| Retomar envio de detalhes após liberar a rede simulada | 1 → 1 | 13 → 31 ms | — |

As medições de uma única execução servem para verificar o fluxo. Repita com contas e rede de homologação antes de avaliar desempenho real. Para a versão pública atual, a inspeção HTTP confirmou revalidação do HTML e cache imutável de um ano num arquivo versionado.

[Configuração Git da Vercel](https://vercel.com/docs/project-configuration/git-configuration) · [Web Push no iPhone](https://webkit.org/blog/13878/) · [Autenticação por e-mail com Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless)
