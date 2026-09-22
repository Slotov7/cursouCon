# CursouCon

Aplicativo desktop local para transformar editais em planos de estudo, com funcionamento offline e sincronização opcional somente por revisões preparadas pelo usuário.

## Estado atual

O primeiro protótipo vertical implementa:

- shell Tauri 2 com React, TypeScript, Vite e Rust;
- criação e abertura de um espaço em uma pasta escolhida;
- manifesto versionado em `workspace.json`;
- validação de formato, estrutura e permissão de escrita;
- banco SQLite de trabalho fora da pasta portátil, em `appDataDir`;
- migrações SQLite versionadas para preparações, assuntos, tarefas, sessões, materiais, notas, questões, tentativas e hashes de importação;
- cadastro persistente de preparações e árvore inicial de disciplinas/assuntos;
- criação de tarefas para uma data e plano diário local;
- reagendamento, pulo e conclusão parcial de tarefas sem apagar seus registros;
- importação de materiais para `blobs/<sha256>`, deduplicação e vínculo opcional a assunto;
- criação e edição de notas Markdown vinculadas a material ou assunto;
- início, pausa, retomada e encerramento idempotentes de sessões, com resultado parcial ou concluído;
- concessão idempotente de XP por sessão, com teto diário e regras versionadas;
- concessão de 2 XP pela primeira tentativa diária de cada questão, limitada a 60 XP/dia nessa categoria;
- cadastro manual de questões de múltipla escolha e certo/errado;
- filtros locais por assunto e tipo, resolução offline e tentativas imutáveis com confiança, tempo e resultado;
- núcleo e ponte IPC para importação JSON versionada de questões, com prévia, diagnóstico de inválidas/duplicadas e gravação transacional;
- núcleo e ponte IPC para exportação das questões ativas em pacotes locais de `exports/`, preservando referências e hashes de anexos;
- tela Evolução com métricas locais e histórico recente de sessões;
- tela Hoje, tela Plano e navegação inicial sem criar dados fictícios;
- interface responsiva estilizada com Tailwind CSS 4 e tokens visuais locais.

Leitura integrada de PDFs com retomada de página, notas Markdown, questões manuais e tentativas já estão disponíveis. Os controles visuais da troca JSON, cadernos, revisões agendadas, sequência de dias e as áreas de exploração entram em fatias seguintes.

## Desenvolvimento

Pré-requisitos: Node.js, npm e Rust com as dependências do Tauri 2 para a plataforma alvo.

```bash
npm install
npm run typecheck
npm run build
npm run tauri dev
```

`npm run dev` abre apenas a interface Vite. A criação e abertura de espaços dependem do shell Tauri e do comando Rust.

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
