# Treino adaptável — versão web 1.2.0

## Usar em outra academia

1. Abra um plano em **Meus treinos** e inicie a sessão normalmente. O cronômetro continua enquanto você adapta o treino.
2. Use **Adicionar exercício** para registrar o aparelho disponível, séries, repetições e carga inicial.
3. No cartão, use **Editar exercício**, **Retirar da sessão**, **Adicionar série** ou **Retirar esta série**. Cargas/repetições das séries abertas continuam editáveis.
4. Para corrigir valores de uma série concluída, desmarque-a, edite e marque novamente. Ao retirar uma série/exercício já realizado, o app pede confirmação e retira esses registros somente da sessão atual.
5. Ao terminar, toque **Finalizar e salvar treino**. A tela de revisão mostra tempo, intensidade, esforço opcional, séries, repetições, volume e calorias ativas estimadas.

### Escolha ao concluir

- **Criar novo treino**: informe outro nome. Cria um plano com os exercícios visíveis e as referências de carga/repetições desta sessão. A conclusão fica vinculada ao novo plano; o original permanece preservado.
- **Adicionar novos exercícios ao original**: acrescenta somente os exercícios criados na sessão. Mantém os exercícios e as cargas de referência que já existiam no plano original. Retirar um exercício da sessão não o exclui do plano.
- **Usar só nesta sessão**: guarda o que foi realizado no histórico, sem modificar planos. É a opção inicialmente selecionada.

Exercícios avulsos ficam guardados com seu nome e valores no histórico. Para trocar o nome/aparelho depois de registrar séries, adicione outro exercício: isso preserva a identificação do que já foi realizado.

## Registrar musculação pela Frequência

Selecione a data e o plano. Confira as cargas sugeridas e marque as séries que realmente fez. É possível usar **Marcar todas as séries do plano como realizadas**, ou selecionar individualmente. Para editar valores já marcados, desmarque a série antes.

Use também **Adicionar série** ou **Retirar esta série** se a quantidade realizada foi diferente do plano. Esses ajustes pertencem ao registro do calendário, preservando o plano salvo.

Informe **duração em minutos**, **intensidade** e, se desejar, como se sentiu. A estimativa aparece antes da confirmação e fica salva com a sessão; a Frequência também exibe tempo, intensidade e calorias dos registros novos.

Esse registro usa meio-dia como referência do calendário e a duração informada; não inventa uma leitura de cronômetro. Não altera as referências do plano. O app conserva a regra existente de um treino de musculação por dia e confere duplicidade antes do envio.

## Calorias e perfil

O mesmo motor de estimativa é usado no treino ativo e no registro da Frequência. Ele utiliza peso, altura, idade, sexo, duração e intensidade. A cópia desses dados fica na sessão; alterar o perfil depois não recalcula o histórico.

Exercícios, séries, repetições e cargas descrevem o treino e seu volume. A carga de uma máquina, por si só, não informa o gasto energético nem equivale à de outro aparelho. A estimativa usa intensidade/MET e tempo, com desconto aproximado do gasto de repouso. Não é uma medição nem um cálculo de calorias por quilo levantado.

O motor anterior de MET foi preservado: leve 2,5, moderada 3,5 e intensa 6. O [Compêndio de Atividades Físicas](https://pacompendium.com/conditioning-exercise/) apresenta 3,5 para musculação com vários exercícios e 6 para esforço vigoroso; a categoria leve é uma aproximação conservadora do aplicativo. A intensidade declarada e os descansos afetam a interpretação da estimativa.

Se o perfil estiver incompleto, ainda é possível salvar o treino. As calorias ficam sem estimativa, em vez de inventar um valor.

## Sem internet e reenvio

As adaptações, a conclusão e a escolha de criar/adicionar um modelo ficam no rascunho do aparelho. A sincronização usa IDs estáveis e confere o que já chegou ao servidor, inclusive se uma resposta se perder. O rascunho permanece enquanto faltarem séries, métricas ou o modelo escolhido.

Mantenha o app aberto quando recuperar a conexão. Não desinstale nem limpe os dados enquanto houver pendências. O novo modelo pode aparecer parcialmente enquanto os itens ainda estão sendo enviados; aguarde a pendência desaparecer antes de editá-lo em outra tela/aparelho. Conflitos preservam o registro local para revisão.

O registro manual também é guardado antes do envio. Se já existir outro treino ou rascunho pendente, conclua/sincronize-o primeiro. Se outro aparelho registrar um treino na mesma data, o app informa o conflito e preserva o rascunho.

## Publicação e testes

Esta atualização é do site: chega pela Vercel ao recarregar/reabrir no APK existente e no Safari. **Não precisa gerar outro APK.** Não há migração de tabelas ou alteração de políticas Supabase nesta entrega.

```sh
npm run check
npm run build:web
npm run test:ui
```

Os testes cobrem exercícios avulsos e remoções, numeração de séries sem reutilizar itens pendentes, criação/reenvio de modelo sem duplicar, preservação do plano original, registro manual com duração/métricas e respostas perdidas. O roteiro de interface usa dados fictícios e testa edição, adaptação offline, recuperação, criação de plano, Frequência com calorias e os fluxos anteriores. Não foram realizadas gravações com uma conta real durante a implementação.
