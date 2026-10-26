# Conclusão de treino presa — 26/10/2026

## Evidência e causa

O vídeo de 22 segundos mostra o plano “Perna top up”, 1/18 séries e tempo de 02:58. A tela informa que o treino foi encerrado neste aparelho, exibe conflito com a sessão remota e mantém o botão de conclusão em “Encerramento aguardando confirmação”. O botão “Enviar minha versão” aparece, mas não oferece saída efetiva.

A causa confirmada no código é um conflito sem recuperação: `enviar` verifica a identidade, plano, status e horário da sessão antes de aplicar `permitirSobrescrever`. Essa opção só resolve diferenças nas séries; não resolve uma sessão já encerrada com outro horário/plano. Ao mesmo tempo, `finalizacao` impede nova conclusão. O sistema preservava o rascunho, porém deixava o usuário preso nesse estado.

Também existem duas condições que agravam o problema: gravações completas da UI podem reaplicar snapshots antigos durante/depois da sincronização; requisições sem prazo mantêm os controles bloqueados. São riscos reproduzidos em testes, mas não é possível atribuir a divergência inicial do vídeo a um deles sem os registros autenticados daquela sessão. Não houve acesso administrativo ao Supabase nem alteração de dados reais.

## Correção

- A conclusão entra na fila de armazenamento como alteração atômica: conserva confirmações que chegaram durante a revisão e o primeiro horário local de encerramento.
- Depois da conclusão local, snapshots da tela não alteram mais o rascunho. Depois da confirmação/recuperação, um marcador por usuário/sessão impede recriá-lo. Uma nova sessão no mesmo plano usa outro ID e continua permitida.
- Conflitos da sessão recebem uma ação própria: “Usar conclusão do servidor e guardar cópia local”. O usuário confirma que diferenças locais não serão reenviadas ao histórico/plano. A ação autentica a conta, consulta a mesma sessão com filtro de usuário e exige status `concluido`, plano e horário válidos. Não faz escrita remota.
- O rascunho inteiro, incluindo séries, valores, horários, métricas e escolha de modelo, é arquivado antes de retirar a pendência ativa. Falha no backup mantém o original. A cópia pode ser consultada ao abrir o mesmo treino, em “Ver cópias de segurança deste treino”. Fica neste aparelho; não substitui o histórico nem representa sincronização das diferenças locais.
- “Enviar minha versão” continua restrito a conflitos de séries. Conflitos legados são reavaliados para identificar o tipo correto.
- Revisar e concluir localmente funciona durante sincronização. Requisições de dados/autenticação são canceladas após 20 segundos, preservando os sinais de cancelamento existentes. Uploads de fotos continuam sem esse limite.
- O gesto de swipe-back e o código de navegação do iPhone foram preservados. O registro de fechamento de modais passa a considerar apenas a tela em foco: um painel da tela anterior, ainda montada na pilha, não pode consumir o gesto nem o retorno automático após a conclusão. O modal de cópias usa esse mecanismo existente.

## Cache e segurança dos dados

Não há service worker no projeto. O HTML da raiz usa revalidação e os bundles Expo têm nomes por conteúdo e cache imutável. O estado exibido no vídeo vem do rascunho local e do conflito da sessão, sem evidência de falha no cache HTTP. A correção não limpa localStorage, credenciais, histórico, séries ou planos; não modifica esquema, RLS ou políticas do Supabase.

## Validação

Executados com sucesso: `npm run check` (tipos, lint sem erros e 9 arquivos de testes), `npm run build:web`, `npm run test:ui` com Chromium e com `SMOKE_BROWSER=webkit`. O lint registra 43 avisos nas áreas já existentes. A integração contínua passa a executar os dois navegadores.

Os testes de regressão cobrem conclusão com confirmação de série em voo; snapshots antigos; primeiro horário preservado; conflito com outro horário remoto; bloqueio de outra conta; sessão ausente, ativa ou sem data; falha de backup; cópia íntegra; isolamento de usuários; e nova sessão após a recuperação. O teste de rede confere aborto real, remoção do timer e cancelamento externo.

O teste de interface usa conta e backend fictícios e intercepta todas as requisições externas. Inclui conclusão com autenticação suspensa, retomada offline, conflito legado, recuperação sem nenhuma escrita remota, consulta da cópia e swipe-back fechando o modal antes de voltar de tela. WebKit desktop com viewport móvel ajuda a validar o Safari, mas não substitui validação no iPhone físico nem a investigação dos registros reais.

## Conferência após publicar

No iPhone afetado, abrir o treino pendente, usar a ação de recuperação e conferir o histórico e a cópia local. A recuperação só libera a sessão se o servidor confirmar uma conclusão válida. Se o servidor não confirmar, a cópia ativa permanece intacta e o app explica o motivo; não presume que o treino terminou.
