# Testes antes do push

## Fluxo com dois cliques no Windows

Abra `publicar.bat` na raiz do projeto. Ele usa a pasta do próprio arquivo,
confere Node/npm, Git e dependências e inicia o mesmo fluxo do F5:
`git add`, mensagem do commit,
confirmação do push e bateria completa de testes antes do envio.

Digite `editar` na confirmação para corrigir a mensagem antes de enviar, ou
`n` para cancelar o push. Uma falha nos testes bloqueia o envio e preserva o
commit local. A janela permanece aberta ao terminar para consultar o resultado.
A instalação inicial de dependências e navegadores abaixo é feita uma vez.

## Fluxo com F5 no VS Code

Abra esta pasta no VS Code e aperte F5. A configuração **Commit e push com testes**
abre o terminal integrado, mostra os arquivos e pede uma mensagem como
`fix: corrigir sincronização`. Todos os arquivos alterados e novos não ignorados
entram no commit. O próprio fluxo executa os testes antes do envio.

Na confirmação, digite `s` para enviar, `n` ou Enter para manter apenas o commit
local, ou `editar` para corrigir sua mensagem antes de enviar. Só o commit criado
nessa execução pode ter a mensagem corrigida automaticamente. Mensagens vazias,
tipos inválidos, títulos com mais de 100 caracteres e múltiplas linhas são
recusados; erros de sentido ou ortografia precisam da sua revisão nessa tela.

Sem alterações, o fluxo oferece enviar os commits já existentes, sem criar um
commit vazio. Conflitos, operações Git em andamento, HEAD destacado ou identidade
ausente interrompem o fluxo com orientação. Falhas de teste, rede, autenticação
ou rejeição remota preservam o commit local. Nenhum push forçado, reset ou pull
automático é feito. Após corrigir o problema, aperte F5 novamente.

O mesmo fluxo está disponível com `npm run publicar`. Se o VS Code já estiver em
outra sessão de depuração, encerre-a e selecione **Commit e push com testes** em
Executar e Depurar. A instalação inicial abaixo continua necessária por clone.

## Instalação inicial

Execute uma vez por clone, na raiz do projeto:

```sh
npm ci --ignore-scripts
npm run test:browsers
```

Use a versão de Node indicada em `.nvmrc`. No Linux, instale também as dependências
dos navegadores com `npx playwright install --with-deps chromium webkit`.

O `.bat`, F5 e `npm run publicar` executam `npm run check:ci` antes do push.
Uma falha interrompe a bateria e bloqueia o envio. Os testes completos podem
levar alguns minutos. Um `git push` manual usa o comportamento padrão do Git,
sem executar os testes locais automaticamente.

O mesmo comando é usado pelo GitHub Actions. A lista única fica em
`scripts/verificar-ci.cjs`: TypeScript, lint, testes unitários e SQL, build web,
interface geral, fotos, nutrição, painel/CSV, rolagem, comunidade, avanço dos
exercícios e offline, com os cenários Chromium/WebKit existentes na CI.

Para executar manualmente ou consultar as etapas:

```sh
npm run check:ci
npm run check:ci -- --listar
```

O runner fixa o backend fictício e limpa opções `SMOKE_*` herdadas para impedir
que uma execução parcial seja confundida com a bateria completa. Não publica o
site nem aplica migrações remotas. O `dist/` gerado usa configuração de teste.

Os testes verificam os arquivos do checkout local. Faça o commit das alterações
antes do push e mantenha a árvore limpa para testar a mesma revisão enviada.
A CI continua verificando a revisão recebida pelo GitHub.

## Validação da automação

Os testes do fluxo de commit/push cobrem validação da mensagem, edição antes do
envio, cancelamento, commits locais pendentes e preservação após falhas.
Falhas dos testes ou do processo que os inicia impedem a chamada de `git push`.

Na execução local de `npm run check:ci` em 23/11/2026, todas as 17 etapas
passaram: TypeScript, lint (sem erros, com 58 avisos existentes), os 35 arquivos
de testes, SQL, build e todos os cenários Chromium/WebKit, incluindo offline.
O log está em `.test-results/check-ci-webkit-corrigido.log`.

A falha anterior em `rpc/tf_resumo_semanal` ocorria ao recarregar a página:
o WebKit rejeitava uma requisição durante o descarregamento do documento com
`TypeError`, sem abortar o sinal nem emitir `requestfailed`. A instrumentação
agora registra `beforeunload`/`pagehide` e só aceita esse caso quando a falha
corresponde à mesma URL e acontece a menos de um segundo do aviso nativo.
Não há exceção específica para essa RPC. O teste do diagnóstico confirma que
falhas online e eventos de outra URL ou fora desse intervalo continuam
bloqueando a bateria.
