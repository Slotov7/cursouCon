# Preferências locais e diagnóstico

## Contexto

RF-086 precisa preservar preferências sem transformar caminhos da máquina em dados portáteis. RF-087 precisa mostrar a versão do aplicativo e oferecer um diagnóstico útil sem enviar conteúdo de materiais ou segredos.

## Decisão

Guardar tema, acessibilidade, fuso e visibilidade da gamificação em `appDataDir/app-preferences.json`, fora do espaço de estudos. O diagnóstico exportado contém somente versão, plataforma, schema e contagens agregadas; não inclui banco, nomes, caminhos, URLs, notas ou bytes de materiais.

## Consequências

As preferências permanecem neste computador e não são copiadas por revisões, backups ou exportações portáteis. O fuso define o dia do plano, o prazo de revisão e datas padrão; cronômetros continuam contando duração efetiva independentemente dele. Ocultar gamificação afeta apenas o painel visual; XP e histórico continuam íntegros para não alterar métricas confirmadas.
