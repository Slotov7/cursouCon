# XP de revisões de estudo

## Contexto

Revisões de conteúdo são ocorrências persistentes ligadas a uma sessão. Concluir
uma revisão precisa atualizar o status e conceder a recompensa na mesma operação,
sem criar XP duplicado quando a chamada for repetida.

## Decisão

Cada revisão concluída gera 5 XP, limitado a 30 XP por dia na categoria
`study_review`. A concessão é gravada em `xp_events` com `source_type` e o
identificador da revisão; a restrição única da tabela e a transação da conclusão
mantêm a origem idempotente. O evento usa a data UTC gravada pelo SQLite, como as
demais categorias de XP atuais.

## Consequências

Uma conclusão repetida retorna `xpGranted: 0` e não cria outro evento. Se o teto
diário já foi atingido, a revisão ainda é concluída e registra um evento com zero
XP para preservar a origem da atividade. O limite e a versão da regra ficam no
código de domínio e no evento persistido.
