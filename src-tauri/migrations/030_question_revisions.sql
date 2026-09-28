CREATE TABLE question_revisions (
    id TEXT PRIMARY KEY NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    previous_answer_key TEXT,
    current_answer_key TEXT,
    previous_status TEXT NOT NULL CHECK (previous_status IN ('active', 'annulled', 'outdated', 'answer_changed')),
    current_status TEXT NOT NULL CHECK (current_status IN ('active', 'annulled', 'outdated', 'answer_changed')),
    reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_question_revisions_question ON question_revisions(question_id, changed_at DESC);
