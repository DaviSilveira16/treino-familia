# Plano de implementação

1. Identidade por exercício nos gráficos e regressões de homônimos/legado.
2. Zoom, foco e componentes compartilhados acessíveis.
3. Diagnóstico local com campos permitidos, no Perfil e limite de erro.
4. Detalhes das filas existentes e reenvio sem duplicação.
5. Curtidas, comentários e moderação com autorização no servidor.
6. Backup versionado e restauração com prévia, recibos e preservação.
7. Cache da aplicação exportada e atualização explícita, sem recarga automática.
8. Extrações de componentes durante as etapas, preservando rotas e cronômetros.

Critérios: typecheck/lint, testes de serviços/SQL e interface Chromium/WebKit,
sem gravações em contas reais, migrações ou publicação de produção.
Os resultados e limites serão registrados no guia da entrega.

## Resultado local

As oito etapas foram implementadas. As extrações incluem os controles comuns,
interações por publicação, diagnóstico, sincronização, restauração e o serviço
de exportação. Os cronômetros e as rotas existentes foram preservados.

- TypeScript e build web aprovados.
- Lint sem erros; permanecem 58 avisos preexistentes.
- 32 arquivos de testes de serviços e cache offline aprovados.
- Verificações SQL existentes e novas aprovadas em PostgreSQL isolado.
- Regressão geral de treinos aprovada em Chromium e WebKit.
- Novos fluxos, nutrição, fotos e foco de modal aprovados nos dois navegadores.
- Abertura offline e atualização A/B aprovadas nos dois navegadores,
  incluindo instalação incompleta, múltiplas janelas e pendência preservada.

Nenhuma migração remota ou publicação executada. Sem validação em aparelho físico.
Leia [o guia de implantação e limites](guias/GUIA-MELHORIAS-COMUNIDADE-OFFLINE.md)
antes de habilitar os recursos no ambiente publicado.

## Correções da revisão

- Atualizar a comunidade renova contagens e também a lista de comentários aberta.
- A nutrição persiste a última tentativa de envio, inclusive quando há falha de
  autenticação ou rede, e preserva esse horário em reinícios e leituras remotas.
- O hash do cache inclui a implementação do service worker. Há regressão para
  alteração exclusiva do worker com falha na instalação, preservando o cache ativo.

As migrações foram verificadas em PostgreSQL isolado. Não existe projeto Supabase
de homologação disponível; essa etapa e os testes em Android/iPhone físicos
permanecem pendentes.
