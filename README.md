# CursouCon

Aplicativo desktop local para transformar editais em planos de estudo, com funcionamento offline e sincronização opcional somente por revisões preparadas pelo usuário.

## Estado atual

O primeiro protótipo vertical implementa:

- shell Tauri 2 com React, TypeScript, Vite e Rust;
- criação e abertura de um espaço em uma pasta escolhida;
- manifesto versionado em `workspace.json`;
- validação de formato, estrutura e permissão de escrita;
- banco SQLite de trabalho fora da pasta portátil, em `appDataDir`;
- migração inicial para preparações, assuntos, tarefas, sessões e eventos de XP;
- cadastro persistente de preparações e árvore inicial de disciplinas/assuntos;
- tela Hoje e navegação inicial sem criar dados fictícios.

O núcleo ainda não implementa ciclo de estudos, materiais, questões ou sessões. Essas áreas entram em fatias seguintes e não são simuladas pela interface.

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
- `src/shared/desktop/`: contratos e chamadas IPC tipadas.
- `src-tauri/src/domain/`: identidade e validações do espaço.
- `src-tauri/src/application/`: caso de uso e contrato do armazenamento.
- `src-tauri/src/infrastructure/`: manifesto, ponteiro ativo, SQLite e migrações.
- `src-tauri/src/commands/`: adaptadores Tauri.
- `src-tauri/migrations/`: esquema SQL versionado.

O banco ativo não é colocado na pasta do espaço. A pasta escolhida contém a identidade e as áreas reservadas para revisões, blobs e exportações; isso evita tratar arquivos de SQLite em uso como mecanismo de sincronização.
