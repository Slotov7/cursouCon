# CursouCon

Aplicativo desktop local para transformar editais em planos de estudo, com funcionamento offline e sincronização opcional somente por revisões preparadas pelo usuário.

## Estado atual

O primeiro protótipo vertical implementa:

- shell Tauri 2 com React, TypeScript, Vite e Rust;
- criação e abertura de um espaço em uma pasta escolhida;
- lista persistente de espaços recentes e troca segura sem sessão ativa pendente;
- criação de backup local versionado com banco, blobs e revisões;
- validação e restauração de backup em um novo espaço, sem substituir o original;
- preparação de revisões portáteis com snapshot SQLite e referências verificadas aos blobs;
- detecção de revisões divergentes sem descartar automaticamente nenhum pacote;
- recuperação manual de uma revisão preservada na abertura de um espaço;
- publicação explícita de uma cópia portátil em pasta externa, sem sincronização automática;
- configuração persistente, por espaço e fora da pasta portátil, do destino externo, desativada por padrão;
- manifesto versionado em `workspace.json`;
- validação de formato, estrutura e permissão de escrita;
- banco SQLite de trabalho fora da pasta portátil, em `appDataDir`;
- migrações SQLite versionadas para preparações, assuntos, tarefas, sessões, estudo manual, correções de duração, materiais, links, etiquetas, notas, questões, tentativas, hashes de importação, Caderno de Erros, concursos manuais e planejamento;
- migrações SQLite 032/033 para discursivas e simulados, com respostas abertas, rubricas, autoavaliação, snapshots de questões, pausa, tempo, pesos, penalidades e diagnósticos;
- migração SQLite 034 para oportunidades online, histórico de alterações, favoritos e estado da fonte;
- cadastro persistente de preparações com banca opcional, troca transacional da preparação principal e árvore inicial de disciplinas/assuntos;
- criação, edição, movimentação, ordenação e arquivamento de assuntos em árvore, mantendo tarefas e sessões históricas;
- estado de estudo independente de domínio e cálculo da cobertura por preparação;
- disponibilidade semanal, prioridades por assunto, reserva de revisão e ciclo local editável em blocos de 30 minutos;
- documento de referência, regras em Markdown e pesos oficiais editáveis por preparação, separados da prioridade de estudo;
- classificação explícita do documento da preparação como referência pré-edital ou edital vigente confirmado;
- preferências de tema, contraste, movimento, fuso do plano diário/revisões e visibilidade do painel de gamificação salvas no computador, fora das revisões portáteis;
- tela de diagnóstico com versão e contagens agregadas, exportável em JSON sem conteúdo de materiais, notas ou caminhos locais;
- guia de primeiros passos na tela Hoje, que leva diretamente a criar um concurso, adicionar uma disciplina e agendar o estudo de hoje; o ciclo pode ser configurado depois e o guia desaparece ao concluir essas ações;
- banner de sessão interrompida na tela Hoje, com retomada em um clique ou revisão explícita do tempo incerto;
- flashcards de texto por espaço, com assunto opcional, avaliações transacionais no SQLite e agendamento determinístico versionado; cartões antigos do armazenamento da interface podem ser importados manualmente para o espaço escolhido, preservando o agendamento; imagens em cartões ainda não são suportadas;
- importação assistida de questões de PDFs previamente importados: extrai texto de até 100 páginas, sugere separação por número, permite revisar enunciados e gabarito e confirma o lote em uma transação; PDFs digitalizados precisam de OCR externo;
- retenção opcional no backup manual (em branco não remove nada), com destino, limite e histórico das últimas execuções salvos neste computador fora da pasta portátil; somente backups íntegros do mesmo espaço e já registrados no histórico são candidatos à limpeza após criar a nova cópia, e falhas na limpeza aparecem como aviso;
- criação de tarefas para uma data com material opcional importado ou link, e plano diário local;
- material e notas do assunto/tarefa acessíveis em Hoje, com leitor PDF e página salva entre aberturas;
- sugestão explícita da próxima ação do ciclo em Hoje, com criação transacional de tarefa e avanço idempotente;
- cadastro, edição, acompanhamento de situação e favoritos de concursos manuais no SQLite local;
- edital em PDF importado e vinculado ao concurso manual, com cópia offline independente do arquivo original;
- reagendamento, pulo e conclusão parcial de tarefas sem apagar seus registros;
- importação de materiais para `blobs/<sha256>`, registro de links externos, deduplicação e vínculos opcionais a vários assuntos;
- PDFs abertos no leitor integrado e outros formatos encaminhados ao aplicativo padrão do sistema;
- etiquetas de materiais persistidas localmente, com busca e edição na biblioteca;
- criação e edição de notas Markdown vinculadas a material ou assunto;
- exportação geral legível em `exports/`, com `data.json`, notas Markdown e anexos referenciados verificados por SHA-256;
- início, pausa, retomada e encerramento idempotentes de sessões, com resultado parcial ou concluído;
- checkpoints locais de sessão e recuperação após suspensão/encerramento inesperado, sem somar o trecho incerto automaticamente;
- registro de estudo manual e correção auditável da duração, com recálculo determinístico do XP diário;
- resumos Markdown, dificuldade percebida e próximos passos ligados à sessão e ao assunto;
- agendamento opcional de revisão ao concluir uma sessão, com fila vencida, reagendamento e conclusão idempotente;
- conclusão de revisão com 5 XP por ocorrência, teto de 30 XP/dia e concessão idempotente;
- Pomodoro local configurável, com pausas que suspendem a sessão e não entram no tempo estudado;
- concessão idempotente de XP por sessão, com teto diário e regras versionadas;
- concessão de 2 XP pela primeira tentativa diária de cada questão, limitada a 60 XP/dia nessa categoria;
- cadastro manual de questões de múltipla escolha e certo/errado;
- cadastro separado de questões discursivas e estudos de caso, com resposta, referência, rubrica e autoavaliação fora da nota objetiva;
- filtros paginados no SQLite por assunto, formato, banca, ano, situação, histórico de resolução e busca textual, com resolução offline e tentativas imutáveis;
- registro de lotes de questões resolvidos fora do app, com indicadores separados de primeiras tentativas e repetições, sem XP adicional;
- núcleo e ponte IPC para importação JSON versionada de questões, com prévia, diagnóstico de inválidas/duplicadas e gravação transacional;
- núcleo e ponte IPC para exportação das questões ativas em pacotes locais de `exports/`, preservando referências e hashes de anexos;
- renderização local e restrita de Markdown de questões, com código, tabelas, fórmulas legíveis e imagens de anexos autorizados;
- simulados locais por preparação e distribuição de assuntos, com modo treino/prova, relógio de prova, gabarito oculto até finalizar, pontuação reproduzível e tarefas de recuperação por assunto;
- Caderno de Erros local persistente, com relação questão–caderno idempotente;
- criação de cadernos manuais e vínculo persistente de questões a múltiplos cadernos;
- criação de cadernos dinâmicos por estado da tentativa, matéria e formato;
- tela Evolução com métricas locais, histórico recente e sequência nos dias com tarefas planejadas;
- telas Hoje, Plano, Discursivas, Simulados e Explorar, com navegação inicial sem criar dados fictícios;
- alertas locais para favoritos com prazos próximos, calculados no fuso configurado e marcados como incompletos quando o edital não informa horário;
- consulta explícita ao Ache Concursos com cache local, origem, última consulta, evidência da situação, filtros estruturados, download sob demanda de editais, conversão revisável em preparação e preservação do cache quando a fonte falha;
- interface responsiva estilizada com Tailwind CSS 4 e tokens visuais locais.

Leitura integrada de PDFs com retomada de página, notas Markdown, questões manuais, discursivas, simulados, tentativas, cadernos locais, cadastro manual e consulta online de concursos, revisões de conteúdo, cobertura do edital e sequência de estudo já estão disponíveis. A cobertura usa como denominador todas as disciplinas e assuntos ativos cadastrados; só “Teoria concluída” soma ao numerador e não indica domínio. A sequência considera como planejadas as datas com tarefas não puladas; datas sem tarefas não interrompem o cálculo. A consulta online é manual, usa a fonte aprovada Ache Concursos e mantém os dados coletados no SQLite local; a situação deve ser confirmada no edital oficial.

## Desenvolvimento

Pré-requisitos: Node.js, npm e Rust com as dependências do Tauri 2 para a plataforma alvo.

```bash
npm install
npm run typecheck
npm run build
npm run tauri dev
```

`npm run dev` abre apenas a interface Vite. A criação e abertura de espaços dependem do shell Tauri e do comando Rust.

No Windows, execute `npm run tauri dev` em um terminal **PowerShell** aberto em `E:\MyProjects\cursouCon`.
Um terminal WSL usa o caminho `/mnt/e/...` e compila a versão Linux. O comando `tauri` detecta a plataforma:
PowerShell usa a CLI nativa do Windows; Linux/WSL usa `scripts/tauri-dev.sh`.

No Linux/GNOME, o script `scripts/tauri-dev.sh` usa um schema GTK local com as
chaves legadas de antialiasing, além de isolar módulos GTK e usar backend de memória.
Isso evita que o WebKitGTK encerre antes de abrir a janela sem alterar schemas,
configurações ou dados do sistema.

## Linux e Debian

O bundle Debian pode ser gerado em uma distribuição Debian/Ubuntu com WebKitGTK
4.1. No Ubuntu, instale as dependências de desenvolvimento do Tauri:

```bash
sudo apt update
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Depois, gere somente o pacote `.deb`:

```bash
npm ci
npm run build:deb
```

O arquivo será criado em `src-tauri/target/release/bundle/deb/`. Para instalar o
pacote em um sistema Debian/Ubuntu compatível:

```bash
sudo apt install ./src-tauri/target/release/bundle/deb/*.deb
```

O pacote declara `libwebkit2gtk-4.1-0` e `libgtk-3-0` como dependências de
execução. Para compatibilidade com sistemas mais antigos, prefira construir em
Ubuntu 22.04 ou Debian 12, que são bases compatíveis com WebKitGTK 4.1.

## Organização

- `src/app/`: composição da interface e navegação inicial.
- `src/features/`: fluxos de workspace, Hoje, Plano, Materiais, Praticar, Discursivas, Simulados e Explorar.
- `src/shared/ui/`: primitivas visuais e tokens usados pelos componentes.
- `src/shared/desktop/`: contratos e chamadas IPC tipadas.
- `src-tauri/src/domain/`: identidade e validações do espaço.
- `src-tauri/src/application/`: caso de uso e contrato do armazenamento.
- `src-tauri/src/infrastructure/`: manifesto, ponteiro ativo, SQLite e migrações.
- `src-tauri/src/commands/`: adaptadores Tauri.
- `src-tauri/migrations/`: esquema SQL versionado.

O banco ativo não é colocado na pasta do espaço. A pasta escolhida contém a identidade e as áreas reservadas para revisões, blobs e exportações; isso evita tratar arquivos de SQLite em uso como mecanismo de sincronização.

O destino externo configurado fica em `appDataDir`, associado ao identificador do espaço. Ativá-lo exige uma pasta existente fora do espaço; desativá-lo interrompe publicações configuradas, preserva o espaço local e não remove arquivos que um cliente externo já tenha transportado.
