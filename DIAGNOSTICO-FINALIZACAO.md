# Conclusão de treino presa — 26/10/2026

## Aviso persistente depois da confirmação no Supabase

O relato seguinte informa que a sessão já aparece como concluída no servidor, mas a tela/barra/modal continua no celular. O código mantinha a atividade visual até terminar o envio das métricas e do modelo, não consultava sessões sem operações pendentes e não atualizava a tela quando outra parte do app confirmava a conclusão. Uma resposta atrasada também podia executar o retorno enquanto o usuário já estava em outra tela.

O rascunho agora distingue `encerradaNoServidor` da fila de detalhes ainda pendentes. O status concluído da mesma sessão, consultado com o usuário autenticado, encerra a atividade visual. A barra ignora esses rascunhos; o processamento dos detalhes continua em segundo plano. Se a conclusão remota pertence a outro fluxo/horário ou ainda há operações locais que não podem ser aplicadas a uma sessão já encerrada, o snapshot integral é arquivado antes de retirar a pendência. Não sobrescreve o servidor nem envia alterações para uma sessão de outro usuário.

A tela acompanha notificações do armazenamento e eventos de outra aba. Um marcador por sessão impede que uma tela antiga recrie o aviso. O editor e a revisão fecham antes da navegação, e o retorno só ocorre se a tela ainda estiver em foco. Respostas de telas ocultas não interrompem a Comunidade ou outro uso do app. O cartão inicial deixa de preservar o estado “Continuar treino” quando o rascunho local encerra, inclusive se nunca teve finalização local; uma consulta antiga também não pode restaurar um cartão de sessão já confirmada. A fila de detalhes é consultável na área de cópias enquanto estiver pendente; o cronômetro e a barra não continuam como se o treino estivesse em andamento.

Testes novos cobrem cache sem finalização/sem pendências, sessão concluída em outro fluxo, horário nulo, falha temporária dos detalhes, cópia integral das diferenças e isolamento de usuário. A interface verifica a retirada automática sem recuperação manual, fecha o editor quando o servidor conclui a sessão, e mantém a Comunidade aberta enquanto uma requisição antiga de detalhes termina. A confirmação de um exercício isolado não encerra uma sessão que o servidor ainda informa como `em_andamento`.

Consultas com sinal já cancelado não chegam mais a iniciar `fetch`. No teste WebKit, avisos nativos de rede são distinguidos de erros de JavaScript apenas quando há queda de rede forçada ou comprovação de cancelamento pelo sinal da requisição; erros de acesso online sem esse cancelamento continuam reprovando o teste.

## Correção complementar após o PR #4

A imagem enviada após o merge confirma que a atualização chegou ao iPhone, mas o fluxo anterior não resolve o envio quando não existe uma conclusão válida no servidor. A ação implementada no PR #4 apenas aceitava uma conclusão remota já existente; não restaurava uma sessão ausente nem reparava um registro incompleto. A imagem, sozinha, não distingue sessão ausente de estado/plano/horário inconsistente.

A nova ação **Enviar treino salvo neste aparelho** efetivamente retoma o envio. Autentica a conta, consulta a mesma sessão e verifica o plano. Antes de qualquer escrita remota, guarda um snapshot integral local. Se a sessão estiver ausente, prepara a criação com o mesmo UUID e horário original, verificando outros registros da data e sessões ativas para não duplicar treinos. Todas as séries concluídas são reconsultadas, inclusive aquelas sem marcador de pendência antigo; linhas iguais são reconhecidas e não são inseridas novamente. As séries abertas não são enviadas.

Se a sessão estiver ativa, o envio prossegue. Registros com status nulo ou `concluido` e `finished_at` nulo podem ser reparados por escolha explícita: a atualização final exige que plano, usuário, status anterior e horário nulo continuem iguais. Não passa o registro concluído de volta para `em_andamento`. Uma conclusão válida diferente, outro plano ou um status não reconhecido continuam protegidos contra sobrescrita. Erros simples do PostgREST agora preservam sua mensagem, em vez de serem substituídos por um aviso genérico.

Conflitos de sessão deixam de ficar bloqueados para sempre num resultado antigo em cache. Cada tentativa volta a consultar o servidor. A cópia ativa só é retirada depois de o servidor confirmar sessão, séries, métricas e eventual modelo; em falha permanece pendente. As cópias anteriores não são substituídas nas tentativas seguintes. O swipe-back e sua proteção de foco são mantidos.

O novo teste reproduz o rascunho da imagem (1/18 séries, 02:58 e 2.400 kg × repetições). Confere a criação real da sessão e da única série concluída, todos os horários, métricas, snapshot com 18 séries, respostas perdidas em cada etapa, falha de backup, divergência de séries, mudança concorrente, usuário diferente, plano ausente e prevenção de duplicatas. O teste de interface também abre o Histórico e confere o registro e a carga enviada. Todos os dados desses testes são fictícios; não se afirma que a sessão real do iPhone já foi enviada.

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

Executados com sucesso: `npm run check` (tipos, lint sem erros e 11 arquivos de testes), `npm run build:web`, `npm run test:ui` com Chromium e com `SMOKE_BROWSER=webkit`. O lint registra 43 avisos nas áreas já existentes. A integração contínua executa os dois navegadores.

Os testes de regressão cobrem conclusão com confirmação de série em voo; snapshots antigos; primeiro horário preservado; conflito com outro horário remoto; bloqueio de outra conta; sessão ausente, ativa ou sem data; falha de backup; cópia íntegra; isolamento de usuários; e nova sessão após a recuperação. O teste de rede confere aborto real, remoção do timer e cancelamento externo.

O teste de interface usa conta e backend fictícios e intercepta todas as requisições externas. Inclui conclusão com autenticação suspensa, retomada offline, conflito legado, recuperação sem nenhuma escrita remota, consulta da cópia e swipe-back fechando o modal antes de voltar de tela. WebKit desktop com viewport móvel ajuda a validar o Safari, mas não substitui validação no iPhone físico nem a investigação dos registros reais.

## Conferência após publicar

Após atualizar o app, uma sessão já concluída no Supabase é reconhecida automaticamente e deixa de manter tela/modal/barra de treino ativo. Conferir o Histórico e eventuais cópias locais. Se a sessão ainda estiver ausente/incompleta no servidor, **Enviar treino salvo neste aparelho** continua disponível para restaurar/retomar o envio. Dados reais do celular não foram acessados nem apagados nesta investigação.
