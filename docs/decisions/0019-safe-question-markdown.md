# Renderização segura do conteúdo de questões

## Contexto

Questões importadas podem conter código, tabelas, fórmulas e imagens. Esse
conteúdo é dado do usuário, não código da aplicação, e não pode executar HTML,
scripts ou comandos no WebView privilegiado.

## Decisão

Usar um renderizador Markdown pequeno e explícito na interface, sem
`dangerouslySetInnerHTML`. O renderizador cobre títulos, listas, citações,
tabelas, blocos de código e fórmulas como texto matemático legível. Código é
sempre exibido em `pre`/`code` e nunca executado.

Imagens remotas e `data:` são recusadas. Imagens só são exibidas quando usam a
referência `attachment://<id>` e o núcleo Rust encontra o anexo local, confere
o blob e o autoriza no escopo do protocolo de assets do Tauri. HTML desconhecido
permanece texto literal e o conteúdo nunca fornece um caminho de arquivo para o
protocolo de assets.

## Consequências

- O conteúdo continua legível offline e preserva indentação de código.
- O conteúdo não fornece caminhos arbitrários para o protocolo de assets; cada
  arquivo é autorizado pelo comando Tauri.
- A sintaxe Markdown suportada é deliberadamente limitada e pode ser ampliada
  somente com uma biblioteca sanitizada e uma necessidade comprovada.
