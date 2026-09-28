# Material da tarefa no estudo diário

## Contexto

RF-022 exige uma tarefa com material e RF-030 pede abrir material e notas no contexto da tarefa. A biblioteca já guarda materiais por ID portátil, notas vinculadas e a página atual dos PDFs.

## Decisão

Guardar `material_id` opcional na tarefa com FK para `materials`. A criação valida o ID na mesma transação que insere a tarefa. Em Hoje, o material é carregado sob demanda; PDFs locais usam o leitor existente, links e outros formatos usam a abertura externa. Notas vinculadas ao material ou ao assunto aparecem no painel da tarefa. O plano diário também devolve a tarefa da sessão aberta quando ela foi agendada para outra data.

## Consequências

Tarefas anteriores continuam sem material. Remover um registro de material limpa o vínculo pela FK sem apagar a tarefa. A posição de leitura permanece no registro do material, compartilhada quando o mesmo arquivo é usado por mais de uma tarefa. Notas e arquivos continuam no espaço local mesmo após encerrar a sessão.
