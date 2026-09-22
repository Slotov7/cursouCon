CREATE TABLE IF NOT EXISTS question_attachments (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    PRIMARY KEY (question_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_question_attachments_hash
    ON question_attachments (sha256);
