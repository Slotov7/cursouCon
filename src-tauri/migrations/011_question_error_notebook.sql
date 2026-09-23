CREATE TABLE IF NOT EXISTS notebooks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('manual', 'error', 'dynamic')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notebook_questions (
    notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    reason TEXT CHECK (reason IS NULL OR reason IN ('content', 'interpretation', 'distraction', 'forgetfulness')),
    observation TEXT,
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notebook_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_questions_question
    ON notebook_questions (question_id, notebook_id);

CREATE INDEX IF NOT EXISTS idx_notebook_questions_notebook_updated
    ON notebook_questions (notebook_id, updated_at DESC, question_id);

INSERT OR IGNORE INTO notebooks (id, name, kind)
VALUES ('notebook-errors', 'Caderno de Erros', 'error');
