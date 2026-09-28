# Movimentação e arquivamento da árvore de assuntos

## Contexto

RF-013 exige organizar assuntos sem apagar histórico. IDs de assunto são referenciados por tarefas, sessões, notas, questões e blocos do ciclo. Arquivar um pai sem tratar os filhos esconderia a hierarquia e deixaria blocos futuros apontando para assuntos arquivados.

## Decisão

Movimentação e ordenação alteram `parent_id` e `position` sem recriar assuntos. A aplicação valida a mesma preparação e rejeita ciclos na árvore. Arquivar marca o assunto e todos os descendentes como inativos em uma transação; se houver sessão aberta na subárvore, a operação falha. Blocos de ciclo de assuntos arquivados são removidos e os blocos restantes mantêm a ordem, com a próxima posição ajustada para o próximo bloco sobrevivente.

## Consequências

Tarefas, tentativas, notas e sessões antigas mantêm os IDs originais e não são apagadas. Tarefas futuras existentes não são descartadas pelo arquivamento; a área Hoje ainda pode exibi-las, e novos vínculos a assuntos arquivados são recusados pelas operações que exigem assunto ativo.
