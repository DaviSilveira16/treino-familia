# Treino Família 1.1.0 — publicação e uso

## Melhorias implementadas

- Frequência recupera o perfil mesmo quando os registros vêm do cache, evitando o bloqueio incorreto do cardio ao sair e voltar.
- O botão inferior Treinos retorna ao início a partir das telas internas. Voltar do Android fecha primeiro os formulários registrados e depois retorna à tela anterior.
- Comunidade tem rodapé único, paginação por data/ID e cancelamento de respostas antigas ao trocar de família.
- Relógios e cartões do treino são separados para reduzir atualizações dos campos a cada segundo.
- Histórico busca somente a próxima página; evolução percorre sessões e séries em lotes, respeitando inclusive limites menores do servidor.
- Continuar treino no início abre o plano em andamento. A barra de retomada mostra descanso e pendências também em outras telas.
- Cada exercício mostra a última sessão concluída e permite copiar suas cargas/repetições, preservando séries concluídas ou com envio pendente.
- Descanso persistente usa o horário real de término e recalcula o tempo restante após reabrir.
- Finalização offline guarda o horário real e as alterações no aparelho. Reenvios verificam operações já aplicadas para evitar duplicação; conflitos ficam visíveis, preservando o rascunho.
- `vercel.json` foi movido para a raiz: cache longo para JavaScripts com hash, HTML revalidado e retorno de autenticação sem cache.
- APK 1.1.0 recebe Google/cadastro/recuperação por PKCE e App Links. O Safari mantém o fluxo de autenticação atual.

## 1. Publicar o site

Integre a alteração web à branch `main` no GitHub depois de conferir os testes. Se a Vercel estiver conectada a essa branch, o deploy inicia automaticamente. Aguarde **Ready**.

Na Vercel, use a raiz deste repositório, build `npm run build:web` e saída `dist` (já definidos no arquivo de configuração). Preserve as variáveis públicas Supabase já existentes. Não use chave secreta no frontend.

Abra o site no Safari e no Android. Uma tela aberta antes do deploy precisa ser recarregada/reaberta. Confira que o endereço abaixo retorna JSON, sem login:

https://treino-familia-zeta.vercel.app/.well-known/assetlinks.json

## 2. Autorizar o retorno no Supabase

No projeto existente, abra **Authentication → URL Configuration → Redirect URLs** e acrescente, mantendo as entradas anteriores:

```text
https://treino-familia-zeta.vercel.app/auth/android/callback\?android_state=*
```

A barra invertida torna `?` literal no padrão glob do Supabase. O `*` permite o identificador aleatório de cada pedido, somente neste caminho. Preserve **Site URL**, URLs do Safari, tabelas e políticas de acesso. Não há migração de banco nesta entrega.

O provedor Google deve continuar habilitado. O callback Google → Supabase existente permanece o mesmo; o novo endereço é o retorno Supabase → aplicativo. Se os emails foram personalizados, confira se respeitam `ConfirmationURL`/`RedirectTo`, sem forçar apenas o endereço inicial. Inicie cadastro/recuperação no APK e abra o link no mesmo aparelho, pois o pedido PKCE fica guardado nele.

## 3. Instalar o APK 1.1.0

Use o **release assinado** do repositório privado `treino-familia-android`. Instale por cima da 1.0.0: identificador e certificado foram mantidos. Não desinstale para atualizar, pois isso apaga a sessão e os rascunhos locais.

Em **Configurações Android → Aplicativos → Treino Família → Abrir por padrão**, confira os links compatíveis. A associação automática depende de o arquivo `assetlinks.json` já estar publicado. O debug tem outra assinatura e não serve como atualização do release.

## 4. Conferir com sua conta

1. No APK, conclua Continuar com Google no navegador e confira o retorno ao app. Feche e reabra para conferir a sessão.
2. Confira email/senha e recuperação; repita o login normal no Safari.
3. Inicie um treino, marque uma série, volte e use Continuar treino. Confira última sessão e descanso após reabrir.
4. Com o treino já carregado, desligue a internet, marque uma série e finalize. Confira Conclusão pendente de envio. Religue a internet com o app aberto e confira o histórico sem duplicação.
5. Entre e saia da Frequência e registre cardio. Confira Voltar, troca de família, Ver mais, fotos e relatórios.

## Limites do modo offline

É possível continuar e encerrar um treino já carregado neste aparelho. Não foi criado um download completo do app para iniciar sessões inéditas sem conexão. O envio acontece com o app aberto, ao retornar à tela/app, recuperar conexão e em novas tentativas periódicas. Não há serviço Android de sincronização em segundo plano.

Não limpe dados do app/navegador, desinstale ou encerre a sessão antes de sincronizar. Rascunhos são separados por usuário e plano. Um conflito exige revisão na sessão original; alterações remotas não são apagadas silenciosamente.

## Atualizações futuras

Telas, botões, rolagem, treino e otimizações web: publique no GitHub conectado à Vercel. Android e Safari recebem no próximo carregamento, sem novo APK.

Código Android, permissões, ícone, domínio ou integração nativa: gere outro APK, com a mesma chave e `versionCode` maior. O aplicativo não instala um novo binário automaticamente.

## Verificação técnica

```sh
npm ci --ignore-scripts
npm run check
npm run build:web
npx playwright install chromium
npm run test:ui
```

Os testes cobrem cache, paginação/cancelamento, origem/estado/validade do retorno Android, concorrência do rascunho, perda de resposta, reenvio sem duplicar e finalização com métricas pendentes. O teste de interface usa conta e backend fictícios e intercepta solicitações externas: retomada, última sessão, campo estável durante o relógio, finalização offline/reabertura/reenvio, comunidade, navegação e cardio com cache aquecido.

Os campos necessários no Supabase real foram conferidos com `limit=0`, sem ler registros de usuários ou modificar dados. Google e gravações com conta real dependem da configuração e conferência acima. Não foram medidos ganhos numéricos de memória/bateria em aparelho real.

Lint passa sem erros; avisos existentes de hooks/estilo permanecem. Há também avisos na cadeia de ferramentas Expo/ESLint; não foram escondidos com downgrade ou atualização forçada incompatível.

Referências: [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Android App Links](https://developer.android.com/training/app-links/verify-applinks), [Vercel vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
