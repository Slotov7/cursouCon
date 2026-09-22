ALTER TABLE questions ADD COLUMN content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_questions_content_hash
    ON questions (content_hash);
