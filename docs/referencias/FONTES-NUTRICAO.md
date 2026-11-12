# Fontes e modelo de estimativa

## Alimentos

O catálogo inicial contém **544 alimentos com os quatro valores numéricos disponíveis**, extraídos da planilha oficial da TACO, 4ª edição revisada e ampliada, NEPA/UNICAMP, Campinas, 2011. A [publicação oficial](https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf) permite reprodução com atribuição. A fonte e o número do alimento acompanham cada snapshot.

Planilha oficial: https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/

O script `scripts/importar_taco.py` lê a primeira planilha: D=energia em kcal, F=proteína, G=lipídeos e I=carboidratos, todos por 100 g. Preserva o nome/preparação original e arredonda as células numéricas a quatro casas. As 53 linhas com `Tr`, `NA`, ausência ou valor inválido em algum desses quatro campos são omitidas; nenhum valor desconhecido é convertido em zero. O SHA-256 da planilha está no cabeçalho da migração de catálogo. Para reproduzir:

```powershell
python scripts/importar_taco.py
```

A migração é carregada no servidor; os alimentos não integram o bundle JavaScript. Alimentos próprios usam os valores fornecidos pelo usuário e a origem indicada no cadastro. Valores por porção exigem peso de referência conhecido. As calorias publicadas são preservadas; não são substituídas automaticamente por `4/4/9`, que pode diferir por arredondamento, fibras e convenções da fonte.

## Repouso e gasto da rotina

A equação de Mifflin–St Jeor estima gasto em repouso: `10 × peso(kg) + 6,25 × altura(cm) − 5 × idade(anos) + 5` para masculino, ou `−161` para feminino. [Estudo original](https://pubmed.ncbi.nlm.nih.gov/2305711/), DOI 10.1093/ajcn/51.2.241. O resultado não é uma medição individual do metabolismo basal. O serviço compartilhado preserva o cálculo previamente usado por treino/cardio.

O gasto base diário pode ser informado manualmente. A sugestão opcional usa `repouso × fator de rotina fora dos treinos`, que a pessoa revisa e aceita antes de guardar. O fator inicial **1,2 é uma hipótese de planejamento configurável do produto para rotina predominantemente sentada**, não um coeficiente derivado do estudo Mifflin, uma medição ou precisão validada individualmente. O app não escolhe um fator a partir da frequência semanal de treinos. O gasto em repouso já faz parte dessa base; não é somado novamente. Não há uma parcela adicional automática de efeito térmico da alimentação.

O gasto total diário é `base sem treinos + calorias ativas das sessões`. A meta alimentar permanece fixa. A pessoa pode copiar a base aceita como referência de manutenção ou informar metas orientadas por profissional. O módulo não aplica déficit ou superávit alimentar automático nem converte saldo em quilos. A sugestão é desativada quando o perfil não é adulto válido ou o usuário sinaliza necessidade de orientação individual; o registro e as metas manuais continuam disponíveis. O [NIDDK](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner) também delimita o uso de seu planejador para adultos e exclui gestação/amamentação.

## Sessões e balanço

Só entram sessões concluídas de musculação e os registros efetivos de cardio. Cada atividade é identificada por tipo e UUID. Usamos `active_calories`; o campo legado `calories` não é presumido ativo, pois pode guardar outra semântica. Valores ausentes permanecem desconhecidos. Treinos localmente finalizados entram uma vez como pendentes e não fecham o saldo até confirmação. Pedidos locais de exclusão retiram a sessão do cálculo.

Saldo estimado = consumo confirmado − gasto total estimado. Negativo indica déficit; positivo, superávit. Consumo − meta é mostrado separadamente. A faixa inicial de ±100 kcal/dia é uma convenção configurável da interface, não uma margem de confiança do modelo.

A semana começa na segunda-feira e termina no domingo do calendário local do usuário. O saldo usa somente dias concluídos, com alimentação confirmada, base conhecida e atividades suficientemente conferidas. A soma líquida mantém os sinais; déficits e superávits também são apresentados separadamente. Dias futuros são excluídos. Dias parciais não são extrapolados. Uma falha de atualização das atividades impede apresentar o saldo semanal como fechado.

Cada diário guarda refeições e parâmetros de estimativa próprios. Mudanças no perfil, alimento ou dieta padrão não recalculam silenciosamente snapshots passados. Uma nova versão de dieta do mesmo grupo pode ter vigência futura; para trocar o padrão por outro grupo de dieta futura, a interface mantém o padrão atual e informa que a seleção deve ser feita na vigência.

## Verificação

`npm run check` executa TypeScript, lint e testes de domínio/persistência. `npm run build:web` prepara a versão web. `npm run test:nutricao:ui` executa o cenário de navegador com backend fictício e intercepta todas as chamadas externas. `SMOKE_BROWSER_CHANNEL=chrome` permite usar o Chrome instalado; `SMOKE_BROWSER=webkit` seleciona o WebKit do Playwright quando disponível.

O script `scripts/verificar-nutricao-sql.cjs` executa as migrações em PostgreSQL via PGlite instalado fora do app; verifica RLS, dois usuários, CAS, idempotência, estrutura JSON e catálogo. As verificações locais não aplicam as migrações ao projeto remoto nem publicam a versão web.
