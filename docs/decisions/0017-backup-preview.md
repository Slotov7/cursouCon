# Prévia de restauração de backup

## Contexto

RF-009 exige conferir um backup antes de restaurá-lo e proteger o espaço
atual. O fluxo já validava o pacote durante a restauração, mas a interface
permitia iniciar essa operação sem apresentar o manifesto, o hash ou as
quantidades do conteúdo.

## Decisão

Expor uma inspeção somente leitura que reutiliza a validação do restore:
manifestos compatíveis, hash do banco, integridade SQLite, chaves estrangeiras,
blobs e arquivos portáteis. A resposta mostra a identidade do espaço, versões,
data, SHA-256 e contagens de blobs, revisões e exportações.

A interface exige essa inspeção antes de habilitar "Restaurar em novo espaço".
O destino continua sendo uma pasta-pai separada e o backend mantém a criação
de uma nova identidade, sem substituir o espaço ativo.

## Consequências

O usuário pode rejeitar uma cópia inválida antes de qualquer alteração. A
validação é executada novamente durante o restore, pois o conteúdo pode mudar
entre a prévia e a confirmação.
