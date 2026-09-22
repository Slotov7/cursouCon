# Transferência de questões e XP diário

## Contexto

O banco local precisa trocar questões sem transformar o frontend em responsável por SQL ou escrita arbitrária de arquivos. A primeira tentativa diária também precisa sobreviver a repetição da chamada e a reabertura do aplicativo.

## Decisão

- O formato portátil usa `schemaVersion: 1`, `kind: "cursoucon.questions"`, `collectionId`, `source`, `attachments` e `questions`.
- A prévia valida cada item, referencia anexos somente por caminhos relativos ao arquivo JSON e confere SHA-256 antes da gravação.
- Duplicatas exatas usam hash normalizado do conteúdo; a importação ignora inválidas e duplicadas e grava as válidas em uma única transação.
- A exportação cria um diretório único em `exports/`, com `questions.json` e os blobs referenciados, para manter o JSON autocontido.
- A primeira tentativa de cada questão no dia UTC gera 2 XP, até 60 XP na categoria. O `source_id` determinístico combina questão e data, e a restrição única de `xp_events` mantém a concessão idempotente.

## Consequências

O arquivo pode ser revisado antes da confirmação e não depende do caminho original dos anexos. A política de dia usa UTC explicitamente até que o espaço tenha uma preferência de fuso persistida. Tentativas não são exportadas nesta primeira versão; elas continuam autoritativas no banco local.
