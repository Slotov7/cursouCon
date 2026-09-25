# Exportação portátil de dados

## Contexto

O usuário precisa ler e preservar dados locais sem abrir o aplicativo. O banco ativo continua fora da pasta portátil e as notas não podem depender de um formato proprietário.

## Decisão

- A exportação geral cria um diretório único em `exports/data-<id>/` somente depois de preparar todos os arquivos em uma pasta temporária.
- `data.json` usa `kind: "cursoucon.data"` e `schemaVersion: 1`, identifica o espaço sem incluir seu caminho local e contém as tabelas autoritativas em JSON legível.
- Cada nota também é escrita em `notes/` como Markdown, com metadados JSON em comentário HTML e referências por identificador.
- Somente blobs referenciados por materiais locais ou anexos de questões são copiados para `attachments/`; cada arquivo é conferido por SHA-256 antes da publicação.
- A tabela de anexos recebe referências relativas ao pacote, nunca o caminho original do arquivo.

## Consequências

O pacote é auditável sem o aplicativo e pode ser copiado para outra máquina. Ele não substitui o banco autoritativo nem é um mecanismo de sincronização; a restauração/importação de dados exportados fica para uma evolução separada.
