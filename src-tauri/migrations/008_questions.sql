CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY NOT NULL,
    question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice', 'true_false')),
    statement_markdown TEXT NOT NULL,
    answer_key TEXT,
    explanation_markdown TEXT,
    source_name TEXT,
    board TEXT,
    organization TEXT,
    role TEXT,
    exam_year INTEGER CHECK (exam_year IS NULL OR (exam_year >= 1900 AND exam_year <= 2200)),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'annulled', 'outdated', 'answer_changed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_options (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_key TEXT NOT NULL CHECK (option_key IN ('A', 'B', 'C', 'D', 'E', 'true', 'false')),
    option_text TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (question_id, option_key),
    UNIQUE (question_id, position)
);

CREATE TABLE IF NOT EXISTS question_subjects (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    PRIMARY KEY (question_id, subject_id)
);

CREATE TABLE IF NOT EXISTS question_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    selected_key TEXT,
    confidence TEXT NOT NULL CHECK (confidence IN ('certain', 'doubt', 'guess')),
    elapsed_seconds INTEGER NOT NULL CHECK (elapsed_seconds >= 0),
    answer_key_at_attempt TEXT,
    result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect', 'blank', 'pending')),
    answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_status_type
    ON questions (status, question_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_subjects_subject
    ON question_subjects (subject_id, question_id);

CREATE INDEX IF NOT EXISTS idx_question_attempts_question_date
    ON question_attempts (question_id, answered_at DESC);
