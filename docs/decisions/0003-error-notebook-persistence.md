# Persistência do Caderno de Erros

## Contexto

A tela de questões permitia marcar uma questão para revisão, mas o estado existia
somente na memória do componente. Fechar a tela ou reabrir o espaço apagava a
marcação, o que contrariava o comportamento esperado de um caderno local.

## Decisão

Criar um caderno de sistema com identificador estável (`notebook-errors`) e uma
relação muitos-para-muitos `notebook_questions`. A operação de inclusão e remoção
é transacional e idempotente. A relação já reserva campos para motivo e observação
sem inventar valores quando o usuário ainda não os informou.

## Consequências

As marcações sobrevivem à troca de tela e à reabertura do espaço. A mesma relação
também suporta cadernos manuais criados pelo usuário. Cadernos dinâmicos guardam
filtros de estado, matéria e formato e são avaliados sobre as tentativas atuais,
sem duplicar o conteúdo das questões.
