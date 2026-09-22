# Handoff entre agentes

**Última atualização:** 2026-09-22 por Gemini / Antigravity CLI
**Workspace compartilhado:** `/mnt/e/MyProjects/cursouCon`

Este arquivo é a fonte de verdade entre o OpenCode e o Gemini executado pelo Antigravity CLI. Antes de editar, cada agente deve ler este arquivo e `git status --short`. Não usar `git reset`, `git checkout --`, limpeza destrutiva ou reverter alterações do outro agente.

## Ownership atual

### OpenCode

- Núcleo Rust, SQLite, migrações e contratos IPC.
- Responsável pela revisão do diff conjunto e execução de checks/testes no Rust.

### Gemini / Antigravity

- Frontend React, UI/UX, componentes visuais e integração com comandos IPC.
- Tarefas concluídas com sucesso:
  1. Integração completa dos comandos de importação/exportação (`pickQuestionImportFile`, `previewQuestionImport`, `importQuestions`, `exportQuestions`) em `src/features/practice/PracticeView.tsx`, com modal de prévia de lote antes da confirmação.
  2. Adição do seletor de confiança (`certain` / `doubt` / `guess`), navegação anterior/próxima (`X de Y`), ação "Tentar Novamente", sincronização com Caderno de Erros e busca textual em `PracticeView.tsx`.
  3. Correção do erro em `src/features/plan/PlanView.tsx` (`buttonOutlineLightClass`, tratamento de `error`, `onRetry`, `isLoading` e seletor multi-concursos).
  4. Execução e validação de `npm run typecheck` (0 erros) e `npm run build` (sucesso).

## Contratos disponíveis e integrados

Em `src/shared/desktop/commands.ts`:

- `pickQuestionImportFile(): Promise<string | null>`
- `previewQuestionImport(sourcePath)`
- `importQuestions(sourcePath, expectedFileHash)`
- `exportQuestions()`

Em `src/shared/desktop/contracts.ts`:

- `QuestionImportPreview`: `schemaVersion`, `total`, `valid`, `invalid`, `duplicates`, `fileHash`, `issues` (`issue.index`, `issue.message`).
- `QuestionImportResult`: `imported`, `skippedInvalid`, `skippedDuplicates`.
- `QuestionExportResult`: `path`, `exported`, `schemaVersion`.
- `AnswerQuestionResult.xpGranted` informa o XP concedido à tentativa.

## Backend implementado (OpenCode)

- JSON de questões `schemaVersion: 1`, `kind: "cursoucon.questions"`.
- Prévia diferencia válidas, inválidas e duplicadas.
- Duplicatas usam hash normalizado; a confirmação grava válidas em transação.
- Anexos usam caminhos relativos e SHA-256; exportação cria pacote em `exports/questions-<id>/`.
- Migrações atuais: `009_question_content_hash.sql` e `010_question_attachments.sql`; schema atual 10.
- Primeira tentativa diária de cada questão concede 2 XP, com limite de 60 XP/dia, usando `source_type = 'question_first_attempt'` e data UTC.

## Sequência e Status

1. [CONCLUÍDO - Gemini] Integrar os comandos na `PracticeView`, exibindo a prévia antes de confirmar o lote.
2. [CONCLUÍDO - Gemini] Corrigir `buttonOutlineLightClass` e estados de erro/carregamento na `PlanView`.
3. [CONCLUÍDO - Gemini] Executar `npm run typecheck` (0 erros) e `npm run build` (sucesso).
4. [AÇÃO ATUAL - OpenCode] Revisar o diff conjunto e repetir `cargo fmt --check` e `cargo check --tests` no alvo Windows.

## Verificações realizadas

- `npm run typecheck` (`tsc -b --pretty false`): **Passou (Exit Code 0)**.
- `npm run build` (`tsc -b && vite build`): **Passou (Exit Code 0, dist gerado)**.
- `.agents/skills/impeccable/scripts/bin/linux-x64/impeccable detect src`: **Passou (0 defeitos de craft/design)**.
- `cargo fmt --manifest-path "src-tauri/Cargo.toml" --check`: passou anteriormente.
- `git diff --check`: passou.
- Bloqueio no WSL: `cargo test` nativo no WSL requer biblioteca de sistema `dbus-1` do Linux; para testes do executável desktop final e WebView2, executar no Windows nativo.
