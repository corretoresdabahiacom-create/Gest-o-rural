# Decisões de arquitetura

## Sem backend próprio
O Firebase Auth e o Firestore cobrem autenticação, dados e autorização. Toda validação de permissão e de dados acontece nas **Security Rules**, que funcionam como o backend. O frontend apenas repete parte das validações para dar feedback ao usuário.

Cloudflare Workers não foi usado porque nenhuma funcionalidade do MVP exige código no servidor. Ele passa a fazer sentido se houver notificações por e-mail ou push agendadas, ou integrações de pagamento.

## Modelo de dados (multifazenda)
Todos os dados de negócio ficam em subcoleções da fazenda:

```
users/{uid}                          perfil (só o próprio usuário)
farms/{farmId}                       nome, dono, prazos de aviso, logotipo
  members/{uid}                      papel: owner | admin | viewer
  invites/{email}                    convites pendentes
  laborTypes/{id}                    tipos de mão de obra (inativáveis)
  expenseCategories/{id}             categorias de despesa (inativáveis)
  collaborators/{id}                 colaboradores (inativáveis, nunca excluídos)
  expenseBatches/{batchId}           registro imutável de cada salvamento da planilha
  expenseEntries/{id}                cada lançamento (mão de obra ou outra despesa)
  obligations/{id}                   férias, 13º e outros pagamentos periódicos
  logs/{id}                          auditoria somente de inserção
```

Usar subcoleções em vez de coleções soltas com um campo `farmId` faz o isolamento depender de uma única verificação, `exists(farms/{farmId}/members/{uid})`. Assim, não é possível esquecer um filtro e expor dados de outra fazenda. A lista de fazendas do usuário vem de uma consulta `collectionGroup('members')` filtrada pelo próprio `uid`.

O item "reminders" da especificação não virou coleção. Os lembretes são derivados das obrigações e dos prazos configurados na fazenda, o que evita estados duplicados e inconsistentes.

## Papéis
- **owner:** tudo, incluindo alterar papéis e remover membros.
- **admin:** cadastra, lança, edita e convida (apenas como admin ou leitor).
- **viewer:** somente leitura.

Para aceitar um convite, o e-mail precisa estar verificado (`email_verified`). Isso impede que alguém crie uma conta com o e-mail de outra pessoa para tomar o convite dela.

## Dinheiro e datas
- Valores são armazenados como **inteiros em centavos**, o que evita erros de arredondamento. As regras rejeitam valores não inteiros e negativos.
- Datas de negócio são strings `YYYY-MM-DD`, calculadas no fuso **America/Bahia**. Isso permite consultas por intervalo sem problemas de fuso. A exibição é sempre DD/MM/AAAA.

## Planilha: consistência e duplicidade
- Um salvamento é um único `writeBatch` (atômico: grava tudo ou nada) com até 450 linhas, abaixo do limite de 500 operações.
- O `batchId` é gerado no cliente quando a planilha é aberta e guardado no rascunho local. Antes de gravar, o app consulta o servidor. Se o lote já existir (reenvio após uma queda de rede), o salvamento é tratado como concluído. As regras proíbem recriar um lote, então mesmo uma corrida entre dois cliques não duplica lançamentos. Além disso, o botão fica travado durante o envio.
- O rascunho fica no `localStorage` e só é apagado depois que o servidor confirma. O `commit()` do Firestore só resolve com a confirmação do servidor. Há um timeout de 25 s com mensagem clara, e nada é apresentado como salvo antes disso.
- Os campos de nome (colaborador, tipo, categoria) são copiados para o lançamento. Assim, os relatórios históricos continuam corretos mesmo após renomear ou inativar um cadastro.

## Obrigações
- O status salvo é apenas `pendente` ou `pago`. "Vencido" é calculado a partir da data prevista, então não fica desatualizado.
- Pagar é sempre uma ação explícita do usuário. Num único lote, o app marca a obrigação como paga, opcionalmente lança a despesa de mão de obra (com id `obl-{id}`, determinístico, sem duplicar) e cria a próxima ocorrência anual como **pendente**.
- O app não calcula nenhum direito trabalhista. Quando o vínculo não é CLT, ele exibe um aviso.

## PWA
- `vite-plugin-pwa` com `registerType: 'prompt'`: quando sai uma nova versão, aparece o aviso "Atualizar". O app verifica atualizações a cada hora.
- O app shell fica em pré-cache, então abre mesmo sem conexão. As bibliotecas de exportação (Excel e PDF) são baixadas só no primeiro uso.
- Os dados do Firestore usam o cache persistente do SDK para leitura em conexões instáveis. A gravação da planilha exige confirmação do servidor. Sem conexão, uma faixa avisa o usuário e o rascunho é mantido.

## Dependências
`react-router-dom` (rotas), `lucide-react` (ícones), `exceljs` (.xlsx), `jspdf` e `jspdf-autotable` (PDF). Os gráficos são componentes próprios, sem biblioteca. O `.npmrc` usa `legacy-peer-deps` porque `@firebase/rules-unit-testing`, usado só nos testes, ainda declara compatibilidade com o firebase 12.

---

# Fase 2 — Rebanho

## Fonte da verdade: movimentações
`farms/{farmId}/herdMovements` é o livro-razão do rebanho. Cada documento é imutável e registra o tipo, a data, o lote, uma ou duas chaves de saldo (`categoria|sexo`) com as quantidades, o total e a referência à operação de origem.

| Tipo | Efeito no lote |
|---|---|
| inicial, compra, nascimento, transf_entrada | soma |
| venda, morte, transf_saida | subtrai |
| ajuste | ± (conferência física confirmada) |
| troca_categoria | −n numa chave e +n em outra, sem mudar o total |

O lote (`herdLots`) guarda o saldo agregado em três campos: `count`, `balances` (por categoria e sexo) e `lastMovementId`. Esse saldo serve para as telas ficarem rápidas e **é verificado pelas Security Rules**:
- toda alteração de saldo exige uma movimentação nova, criada no mesmo envio e apontada por `lastMovementId`;
- a movimentação, por sua vez, só pode ser criada se o lote apontar para ela;
- o novo saldo de cada chave é igual ao saldo anterior mais a quantidade da movimentação, e nunca fica negativo;
- apenas as chaves da movimentação mudam, e `count` acompanha o total.

Por isso, nenhuma edição consegue mudar quantidades sem deixar rastro, e o saldo é sempre reconciliável. A tela Inventário → Reconciliação compara o saldo guardado com o histórico.

Cada operação roda numa **transação** (`runTransaction`) que lê o saldo, valida e grava tudo junto. O id da operação é gerado quando o formulário abre, então um reenvio encontra o registro existente e não duplica nada. Uma transação nunca grava duas movimentações no mesmo lote, porque o par `lastMovementId` ↔ movimentação é único.

## Operações
| Coleção | Uso |
|---|---|
| `purchases` | compras: vendedor, comprador, unidade e fator de kg, preço, valor calculado ou manual, custo por cabeça, `integrationId`. Pesos individuais criam animais. |
| `births` | nascimentos |
| `sales` | vendas, com as despesas embutidas no próprio documento (em vez de uma coleção `saleExpenses`): bruto, despesas e líquido, além do `integrationId` |
| `mortalityRecords` | mortes |
| `herdTransfers` | transferências internas (duas movimentações, total inalterado) ou entre fazendas (saída numa, entrada na outra, mesmo id nas duas e animais copiados com `transferRef`). Nunca contadas como compra ou venda. |
| `categoryChanges` | mudanças de categoria |
| `herdInventories` / `inventoryAdjustments` | conferência física: o saldo só muda após confirmação explícita, com antes, depois, responsável e justificativa |
| `vaccinations` | aplicadas ou programadas, com reforço. Cada uma tem `stockItemId`, reservado para a baixa de estoque futura. |

Esses registros são somente inserção nas regras, com três exceções controladas: o status da conferência física, a baixa de reforço vacinal e a marcação de correção de pesagem.

## Animais individuais e lotes
O controle por lote funciona sem cadastro individual. Animais identificados (`animals`) pertencem a um lote e fazem parte do seu saldo. Na saída, o usuário escolhe os animais exatos e/ou uma quantidade sem identificação, limitada ao saldo que não está identificado. Lote, categoria e sexo de um animal só mudam por movimentação, nunca por edição.

## Unidade comercial
A arroba de peso vivo e a de carcaça têm fatores próprios, configurados em Configurações (padrão de 30 e 15 kg). Cada compra e venda grava a unidade e o fator usados. Não há conversão automática entre as duas, e o valor total pode ser informado manualmente.

## Integração financeira
- **Compra:** a opção marcável cria um lançamento de despesa com id determinístico (`herd-purchase-{id}`), então ele nunca duplica. O módulo financeiro não foi alterado.
- **Venda:** guarda o `integrationId` (`herd-sale-{id}`) e o valor líquido, mas não gera lançamento, porque o financeiro atual registra apenas despesas.

# Fase 3 — Pesagem

| Coleção | Conteúdo |
|---|---|
| `weighingSessions` | cabeçalho: data, tipo (individual ou coletiva), lote, categoria, responsável, local e indicadores |
| `weighings` | um registro por animal (individual, `qty = 1`) ou por lote (coletiva, dado agregado com método `balanca_coletiva` ou `media_informada`) |

A pesagem coletiva **nunca** cria registros individuais.

- **Peso anterior:** é a última pesagem individual válida do animal antes da data. Se não houver, vale o peso de entrada do cadastro. O histórico acompanha o animal mesmo após transferências.
- **GMD:** é calculado como (atual − anterior) ÷ dias. Fica indisponível quando não há pesagem anterior válida ou quando o intervalo é ≤ 0.
- **GMD do lote:** a partir de pesagens individuais, é a média dos GMD dos mesmos animais. Entre duas pesagens coletivas, só é apresentado se não houve movimentação no lote entre as datas e se a quantidade pesada foi a mesma. Caso contrário, o app mostra a diferença das médias com o aviso "não comparável".
- **Gravação:** tudo vai num único lote atômico, com no máximo 240 linhas por sessão por causa do limite de 500 operações. O id gerado ao abrir a planilha evita duplicidade. Além dos registros, só são atualizados `animals.lastWeighing` e o peso médio de referência do lote. **Nunca** a quantidade do lote, vendas ou o financeiro.
- **Correções:** uma correção cria um novo registro com `correctsId` e o motivo, e marca o original com `supersededBy`. O original nunca é editado nem apagado, e os relatórios usam apenas os registros vigentes.
- **Importação (.xlsx via exceljs ou CSV):** o assistente segue as etapas de mapear colunas, validar data, lote, animal pertencente ao lote e peso, detectar duplicidades (no arquivo e com o histórico) e mostrar uma prévia. Só as linhas válidas são gravadas, em sessões marcadas como `importacao`.

# Estorno de operações do rebanho
Compras, nascimentos, vendas, mortes, transferências (internas e entre fazendas) e mudanças de categoria podem ser estornadas, informando data e motivo. **Nada é apagado.** Numa única transação, o estorno faz o seguinte:
- grava movimentações inversas do tipo `estorno` em cada lote afetado, com as mesmas chaves e sinal trocado, revalidando os saldos. Por exemplo, não é possível estornar uma compra cujos animais já saíram;
- cria `reversals/rev-{operação}`, com id determinístico, então cada operação só pode ser estornada uma vez;
- marca a operação original com `reversedBy`. As regras só aceitam essa marcação se o registro de estorno existir no mesmo envio e se a operação ainda não tiver sido estornada;
- desfaz o efeito sobre os animais:
  - compra: os animais da compra passam a "estornado";
  - venda, morte ou transferência entre fazendas: os animais voltam a ativos. As regras só permitem reativar um animal com um `reversalRef` existente;
  - transferência interna: os animais voltam ao lote de origem;
  - mudança de categoria: os animais voltam à categoria original;
- remove o lançamento financeiro vinculado: a despesa da compra ou a receita da venda.

Relatórios de operações e indicadores do painel ignoram operações estornadas. Os saldos e o inventário por data usam o livro-razão completo: antes da data do estorno, o saldo histórico continua mostrando a situação original. Há também um relatório dedicado aos estornos.

# Receitas no financeiro
A coleção `revenueEntries` registra as receitas, com origem `venda_animais` ou `outra`. A venda de animais pode lançar o valor **líquido** como receita, com id determinístico `herd-sale-{venda}`, ou seja, uma única vez. Vendas antigas ganham o botão "Lançar receita". Receitas de venda só são corrigidas estornando a venda. As receitas manuais podem ser editadas e excluídas, com log.

O painel principal mostra as receitas e o resultado (receitas − despesas) do período. O "Resumo financeiro mensal" ganhou as colunas Receitas e Resultado, e foi criado o relatório "Receitas por período". As despesas continuam em `expenseEntries`, sem mudanças, e por isso os totais de despesa não foram afetados.
