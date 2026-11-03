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
