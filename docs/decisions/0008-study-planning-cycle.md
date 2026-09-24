# Ciclo de estudo baseado em disponibilidade

## Contexto

O plano precisava representar disponibilidade semanal, prioridade de assuntos e uma sequência que pudesse continuar após fechar o aplicativo, sem transformar tarefas agendadas ou histórico em dados descartáveis.

## Decisão

Guardar a disponibilidade por preparação e dia da semana, de domingo (`0`) a sábado (`6`). A prioridade do assunto usa valores de `1` a `5`, em que `1` recebe maior peso. Uma reserva percentual para revisões é descontada antes da distribuição. Ao salvar a configuração, o núcleo regenera posições de 30 minutos até a capacidade semanal disponível e zera a posição atual. O usuário pode reordenar os blocos, trocar assuntos e ajustar sua duração; a versão editada precisa continuar dentro da capacidade. Avançar o ciclo é uma ação explícita e persistida. O passo monotônico separado da posição impede repetição de aceite mesmo em ciclos de uma única posição.

## Alternativas consideradas

- Gerar tarefas automaticamente: rejeitado porque misturaria planejamento com agenda e poderia criar registros sem confirmação do usuário.
- Inferir disponibilidade do histórico: rejeitado porque histórico não representa disponibilidade futura.
- Guardar a configuração apenas no frontend: rejeitado porque não sobreviveria ao fechamento do app nem serviria como fonte local oficial.
- Tratar a reserva de revisão como tarefa comum: rejeitado porque reduziria a capacidade do ciclo sem deixar explícita a finalidade do tempo protegido.

## Consequências

O ciclo não ultrapassa a capacidade configurada e pode indicar quando não há tempo para incluir todos os assuntos. A posição do ciclo só pode apontar para um assunto da mesma preparação, inclusive no SQLite. Alterar disponibilidade ou prioridades regenera a sequência; tarefas, sessões, revisões e XP existentes não são alterados.
