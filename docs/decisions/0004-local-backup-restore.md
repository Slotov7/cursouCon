# Backup e restauração local

## Contexto

O banco de trabalho fica fora da pasta portátil do espaço, enquanto materiais e
revisões ficam em subpastas do espaço. Copiar somente a pasta escolhida pelo
usuário poderia produzir uma revisão sem os dados confirmados ou sem anexos.

## Decisão

O backup é publicado em uma nova pasta com `backup.json`, `workspace.json`, um
snapshot SQLite, `blobs`, `revisions` e `exports`. O snapshot é produzido pelo
SQLite com `VACUUM INTO`; antes da publicação, o núcleo verifica integridade do
banco, chaves estrangeiras, metadados do espaço e SHA-256 dos blobs referenciados.

A restauração nunca substitui uma pasta existente. Ela valida o pacote, cria um
novo espaço com novo identificador, reescreve apenas a identidade no banco
restaurado e seleciona esse novo espaço como ativo.

## Consequências

Falhas durante a criação deixam somente a pasta original utilizável; a pasta
temporária é removida quando possível. Backups são cópias independentes e não
representam sincronização automática. A limpeza de backups antigos e a
substituição explícita de um espaço ficam para uma fatia posterior.
