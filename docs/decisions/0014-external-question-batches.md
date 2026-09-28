# Lotes de questões resolvidos fora do aplicativo

## Contexto

RF-053 pede registrar totais de resolução externa. Inserir tentativas sintéticas no banco de questões falsificaria respostas individuais, primeira tentativa e concessões de XP.

## Decisão

Guardar cada lote em `external_question_batches` com preparação, assunto opcional, data, fonte opcional, respondidas e acertos. O núcleo valida calendário, associação do assunto e `0 ≤ acertos ≤ respondidas`; o SQLite reforça as contagens por CHECK e a associação preparação–assunto por FK composta. Nenhuma questão, tentativa ou evento de XP é criado pelo lote.

## Consequências

A tela Evolução mostra taxas e amostras separadas para primeira tentativa, repetição e lote externo. Tentativas individuais usam a data UTC de resposta, excluem questões anuladas e só entram na taxa quando foram avaliadas como acerto/erro; lotes externos usam a data informada pelo usuário. A exportação geral inclui a nova tabela; backups e revisões já incluem o banco inteiro.
