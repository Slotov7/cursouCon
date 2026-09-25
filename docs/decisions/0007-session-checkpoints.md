# Checkpoints de sessão

## Contexto

O relógio de parede continua avançando enquanto o computador dorme ou enquanto o processo deixa de executar. Persistir somente o início da sessão faria esse intervalo parecer estudo confirmado.

## Decisão

- `active_started_at` representa o início do trecho ativo ainda não confirmado; cada heartbeat grava o acumulado e abre um novo trecho.
- O núcleo usa checkpoints a cada poucos segundos e marca a sessão como `interrupted` quando o intervalo excede o limite de recuperação.
- O tempo desde o último checkpoint não entra nas métricas automaticamente. A tela Hoje mantém a sessão visível e oferece retomar descartando o trecho ou encerrar com um tempo confirmado.
- Sessões interrompidas bloqueiam o início de outra sessão até a revisão explícita.

## Consequências

Uma pequena fração entre checkpoints pode exigir revisão, mas suspensão e encerramento inesperado não geram estudo falso. O estado continua no SQLite e sobrevive à reabertura do aplicativo.
