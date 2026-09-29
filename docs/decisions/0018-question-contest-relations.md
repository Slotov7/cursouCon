# Relações explícitas entre questões e concursos

## Contexto

Uma questão pode ser a prova oficial de um concurso, uma prova anterior do
mesmo concurso ou apenas compatível com os temas estudados. Banca, órgão, ano
e texto não são evidência suficiente para inferir esse vínculo.

## Decisão

Persistir a relação muitos-para-muitos em `question_contest_relations`, com um
único tipo por par questão–concurso. Os tipos aceitos são `official_exam`,
`previous_exam` e `thematic_compatibility`. A interface exige classificação
manual e mostra "Sem vínculo" quando não há confirmação.

A relação faz parte da exportação completa do espaço e usa chaves estrangeiras
com exclusão em cascata para não deixar referências órfãs.

## Consequências

- O banco não apresenta questões semelhantes como pertencentes a um concurso.
- Alterar uma classificação é idempotente e ocorre dentro de transação.
- A confirmação do vínculo permanece separada dos metadados da questão.
