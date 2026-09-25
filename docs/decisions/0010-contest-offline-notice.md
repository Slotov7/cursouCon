# Edital offline de um concurso salvo

## Contexto

RF-080 pede favoritos e editais disponíveis offline. Favoritos manuais já persistem, e a biblioteca de materiais já copia arquivos para o espaço por hash. A URL da fonte de um concurso não garante leitura sem internet.

## Decisão

O concurso guarda um `notice_material_id` opcional com FK para `materials`. Vincular só aceita PDF importado, sem `source_url`, cuja cópia local existe. A tela Explorar permite importar outro PDF, abrir o associado e desvincular sem apagar o material da biblioteca. A importação reutiliza a cópia deduplicada em `blobs/`.

## Consequências

Substituir o vínculo preserva o PDF anterior na biblioteca e não depende do caminho externo original. Links externos continuam identificados como fontes online; registrar um link não equivale a salvar um edital offline. Uma falha no vínculo após importação mantém o material importado para nova tentativa, sem anunciar a operação como concluída.
