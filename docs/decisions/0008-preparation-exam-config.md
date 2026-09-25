# Configuração do edital por preparação

## Contexto

RF-014 exige que cada preparação preserve seu documento de referência e pesos/regras editáveis. A prioridade atual dos assuntos controla apenas a distribuição do ciclo e não representa o peso oficial da prova.

## Decisão

Reutilizar a biblioteca local de materiais para apontar um edital por `reference_material_id`, guardar as regras em Markdown e adicionar `subjects.exam_weight` como valor decimal opcional. O salvamento dos três grupos ocorre em uma única transação e valida novamente a preparação, o material e os assuntos no núcleo Rust.

## Consequências

O documento continua portátil e deduplicado pelo armazenamento de materiais. A fatia não tenta extrair PDF, calcular nota ou comparar versões de edital; esses fluxos podem consumir os dados estruturados posteriormente sem confundir peso da prova com prioridade de estudo.
