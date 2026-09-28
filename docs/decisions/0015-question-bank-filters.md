# Filtros do banco de questões antes da paginação

## Contexto

RF-047 exige combinar assunto, formato, banca, ano, situação e histórico. A busca anterior carregava até 100 questões e filtrava parte dos resultados no React; uma questão fora dessa amostra podia parecer inexistente.

## Decisão

Aplicar os critérios no SQLite antes de `LIMIT/OFFSET`, com parâmetros vinculados. O histórico usa o resultado da primeira/última tentativa em ordem de data e `rowid` para desempatar registros no mesmo segundo. O caderno manual é filtrado por vínculo persistido; filtros dinâmicos fornecem assunto, formato e resultado ao mesmo comando. A interface carrega páginas de 50 e indica quantidade carregada, sem afirmar que é o total do banco. Situações não ativas podem ser consultadas por escolha explícita, mas não aceitam novas tentativas.

## Consequências

As combinações deixam de depender da primeira página. Alterações de filtros reiniciam a paginação e respostas já registradas permanecem vinculadas aos IDs originais. A busca textual continua local, sem enviar enunciados ou histórico à internet.
