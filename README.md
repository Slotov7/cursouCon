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
- cadastro persistente de preparações com banca opcional, troca transacional da preparação principal e árvore inicial de disciplinas/assuntos;
- criação, edição, movimentação, ordenação e arquivamento de assuntos em árvore, mantendo tarefas e sessões históricas;
- estado de estudo independente de domínio e cálculo da cobertura por preparação;
- disponibilidade semanal, prioridades por assunto, reserva de revisão e ciclo local editável em blocos de 30 minutos;
- documento de referência, regras em Markdown e pesos oficiais editáveis por preparação, separados da prioridade de estudo;
- classificação explícita do documento da preparação como referência pré-edital ou edital vigente confirmado;
- preferências de tema, contraste, movimento, fuso do plano diário/revisões e visibilidade do painel de gamificação salvas no computador, fora das revisões portáteis;
- tela de diagnóstico com versão e contagens agregadas, exportável em JSON sem conteúdo de materiais, notas ou caminhos locais;
- criação de tarefas para uma data e plano diário local;
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
- filtros locais por assunto e tipo, resolução offline e tentativas imutáveis com confiança, tempo e resultado;
- núcleo e ponte IPC para importação JSON versionada de questões, com prévia, diagnóstico de inválidas/duplicadas e gravação transacional;
- núcleo e ponte IPC para exportação das questões ativas em pacotes locais de `exports/`, preservando referências e hashes de anexos;
- Caderno de Erros local persistente, com relação questão–caderno idempotente;
- criação de cadernos manuais e vínculo persistente de questões a múltiplos cadernos;
- criação de cadernos dinâmicos por estado da tentativa, matéria e formato;
- tela Evolução com métricas locais, histórico recente e sequência nos dias com tarefas planejadas;
- telas Hoje, Plano e Explorar, com navegação inicial sem criar dados fictícios;
- interface responsiva estilizada com Tailwind CSS 4 e tokens visuais locais.

Leitura integrada de PDFs com retomada de página, notas Markdown, questões manuais, tentativas, cadernos locais, cadastro manual de concursos, revisões de conteúdo, cobertura do edital e sequência de estudo já estão disponíveis. A cobertura usa como denominador todas as disciplinas e assuntos ativos cadastrados; só “Teoria concluída” soma ao numerador e não indica domínio. A sequência considera como planejadas as datas com tarefas não puladas; datas sem tarefas não interrompem o cálculo. A área Explorar ainda não consulta fontes online; essa integração depende de validar uma fonte aprovada.

## Desenvolvimento

Pré-requisitos: Node.js, npm e Rust com as dependências do Tauri 2 para a plataforma alvo.

```bash
npm install
npm run typecheck
npm run build
npm run tauri dev
```

`npm run dev` abre apenas a interface Vite. A criação e abertura de espaços dependem do shell Tauri e do comando Rust.

## Linux e Debian

O bundle Debian pode ser gerado em uma distribuição Debian/Ubuntu com WebKitGTK
4.1. No Ubuntu, instale as dependências de desenvolvimento do Tauri:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
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
- `src/features/`: fluxos de workspace, Hoje, Plano, Materiais e Praticar.
- `src/shared/ui/`: primitivas visuais e tokens usados pelos componentes.
- `src/shared/desktop/`: contratos e chamadas IPC tipadas.
- `src-tauri/src/domain/`: identidade e validações do espaço.
- `src-tauri/src/application/`: caso de uso e contrato do armazenamento.
- `src-tauri/src/infrastructure/`: manifesto, ponteiro ativo, SQLite e migrações.
- `src-tauri/src/commands/`: adaptadores Tauri.
- `src-tauri/migrations/`: esquema SQL versionado.

O banco ativo não é colocado na pasta do espaço. A pasta escolhida contém a identidade e as áreas reservadas para revisões, blobs e exportações; isso evita tratar arquivos de SQLite em uso como mecanismo de sincronização.

O destino externo configurado fica em `appDataDir`, associado ao identificador do espaço. Ativá-lo exige uma pasta existente fora do espaço; desativá-lo interrompe publicações configuradas, preserva o espaço local e não remove arquivos que um cliente externo já tenha transportado.
