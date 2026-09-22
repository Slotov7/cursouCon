# Armazenamento inicial do espaço

## Contexto

O produto precisa funcionar offline e também permitir transporte manual ou sincronização opcional. A visão define que um banco SQLite ativo não deve ser colocado em uma pasta sincronizada, porque seus arquivos auxiliares e a ordem de chegada não fornecem uma transação entre computadores.

## Decisão

O protótipo mantém o SQLite de trabalho em `appDataDir/workspaces/<workspace-id>/workspace.sqlite3`. A pasta escolhida pelo usuário contém `workspace.json` e as áreas `revisions/`, `blobs/` e `exports/`. Um ponteiro local em `appDataDir/active-workspace.json` identifica o espaço aberto na próxima inicialização.

O manifesto é gravado por arquivo temporário e publicação final. A abertura valida versão, identidade, diretórios obrigatórios e permissão de escrita antes de atualizar o ponteiro ativo.

## Consequências

- O espaço pode ser copiado sem transportar um banco aberto.
- A primeira fatia já separa “salvo localmente” de qualquer futura publicação externa.
- Ainda falta implementar a criação de revisões consistentes, hashes de anexos e resolução de divergências.
- A seleção de uma pasta existente é explícita; o núcleo não acessa caminhos genéricos a partir da interface.
