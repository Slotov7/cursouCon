# Auditoria de correções de questões

## Contexto

RF-050 e RF-057 exigem preservar cada tentativa quando uma banca corrige o
gabarito ou quando a questão é anulada/desatualizada. O resultado salvo na
tentativa representa o gabarito disponível no momento da resposta.

## Decisão

Registrar cada alteração em `question_revisions`, com gabarito e situação
anteriores e atuais, motivo e data. A questão atual é atualizada na mesma
transação. Tentativas não são regravadas: a interface pode mostrar o resultado
original e a reavaliação contra o gabarito atual separadamente.

Uma mudança de gabarito exige a situação `answer_changed`; a validação ocorre
novamente no núcleo e confirma que a alternativa pertence à questão.

## Consequências

O histórico permanece auditável e filtros/métricas continuam usando o
resultado original da tentativa. Questões não ativas continuam consultáveis,
mas não aceitam novas respostas. A tabela de auditoria acompanha exportações
de dados do workspace.
