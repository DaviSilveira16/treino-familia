# Minhas famílias — versão web 1.3.0

## Criar e alternar

Na aba **Comunidade**, o cartão **Minhas famílias** aparece também quando você só participa de um grupo. A opção **Criar outra família** continua disponível depois da primeira criação.

1. Toque em **Criar outra família**, informe um nome e confirme.
2. A nova família é selecionada e recebe seu próprio código de convite.
3. Toque no nome de qualquer família da lista para trocar o painel e o feed.
4. Para participar de um grupo criado por outra pessoa, use **Entrar em outra família** com o código recebido. A entrada não remove famílias da lista pelo código do aplicativo.

A lista reúne as famílias que você criou e aquelas das quais participa. A última seleção é lembrada neste aparelho, separadamente para cada conta. Se você deixar de fazer parte do grupo, a seleção passa a uma família ainda disponível.

## Publicações separadas

O título e o botão do formulário mostram **Publicar em [nome da família]**. Texto, fotos e treinos são enviados com o identificador da família selecionada. Feed, paginação, convites e resumo semanal acompanham a seleção, descartando respostas de consultas antigas.

Enquanto uma publicação está sendo enviada, a troca/criação/entrada em grupos fica bloqueada para manter o destino visível e consistente. A exclusão confere o usuário e a família da publicação. Imagens só são solicitadas quando o caminho pertence à família do post.

Os rascunhos de texto e a seleção de treino ficam separados por família **durante a mesma abertura desta tela**. Não são backups persistentes: recarregar/fechar a tela pode descartá-los. Fotos selecionadas não acompanham a troca; o app pede confirmação antes de descartar a seleção. O seletor também ignora uma foto que retorne depois de mudar de família.

## Banco e privacidade

O aplicativo reaproveita `families`, `family_members`, `community_posts`, o bucket `community-photos` e as funções existentes `entrar_na_familia_por_codigo`/`resumo_painel_familia_por_id`. Não apaga associações anteriores para criar outro grupo e não desabilita políticas de acesso.

A privacidade no servidor continua dependendo das políticas RLS e de armazenamento existentes. Os filtros da interface não substituem essas políticas. Nesta implementação foram conferidos os campos com consultas `limit=0`; não houve leitura de registros de usuários, alteração de políticas ou gravação com uma conta real. Os testes de múltiplos grupos usam dados fictícios e não representam uma auditoria das regras do projeto Supabase.

Se o banco de uma instalação antiga tiver uma restrição de uma família por criador/usuário, a criação será recusada com uma mensagem e as famílias anteriores permanecerão intactas. Essa restrição precisa de revisão específica no Supabase; não deve ser resolvida desabilitando RLS. O código não remove índices ou políticas automaticamente sem conhecer sua definição.

Para identificar uma restrição antiga, estas consultas são somente de leitura no SQL Editor:

```sql
select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid in ('public.families'::regclass, 'public.family_members'::regclass)
order by tabela, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('families', 'family_members');
```

## Atualização e verificação

É uma atualização do site: **não precisa gerar outro APK**. Recarregue o app/site após a publicação na Vercel. No APK, na tela inicial, use Voltar → Opções → Atualizar; no iPhone, recarregue o Safari.

Os testes de unidade cobrem seleção válida, preferência isolada por usuário, assinatura restrita ao caminho da família e criação com resposta perdida. O roteiro de interface cobre criação de uma segunda família, convite para uma terceira, envio ao grupo certo, bloqueio durante envio, separação de rascunhos/fotos, troca rápida com resposta atrasada e última seleção após reabrir. Os testes anteriores de treino, cardio e navegação também continuam na verificação.

Referência: [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
