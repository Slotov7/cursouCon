# Documento anterior no modo pré-edital

## Contexto

Uma preparação pode começar antes da publicação do edital. O campo de documento de referência já existe, mas sem identificar se o PDF/link associado corresponde ao edital vigente. Documentos existentes não têm vigência verificada.

## Decisão

Guardar `reference_document_status` por preparação com valores `reference` e `current`. A migração marca todos os documentos existentes como `reference`; anexar/substituir um arquivo na interface também volta a esse estado. Só uma escolha explícita do usuário pode marcar um documento selecionado como vigente. O núcleo recusa `current` sem documento.

## Consequências

O plano pode continuar sem data de prova ou edital atual. O documento anterior permanece vinculado e portátil como referência, sem atribuição automática de vigência; pesos e regras permanecem editáveis independentemente da classificação.
