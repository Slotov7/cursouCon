ALTER TABLE questions
    ADD COLUMN is_discursive INTEGER NOT NULL DEFAULT 0 CHECK (is_discursive IN (0, 1));

CREATE TABLE discursive_question_details (
    question_id TEXT PRIMARY KEY NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    reference_markdown TEXT,
    rubric_markdown TEXT
);

CREATE TABLE discursive_attempts (
    attempt_id TEXT PRIMARY KEY NOT NULL REFERENCES question_attempts(id) ON DELETE CASCADE,
    response_markdown TEXT NOT NULL CHECK (length(trim(response_markdown)) BETWEEN 1 AND 50000),
    self_assessment TEXT NOT NULL CHECK (
        self_assessment IN ('weak', 'partial', 'strong')
    )
);

CREATE INDEX idx_discursive_attempts_assessment
    ON discursive_attempts (self_assessment, attempt_id);
