CREATE TABLE external_question_batches (
    id TEXT PRIMARY KEY NOT NULL,
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    subject_id TEXT,
    source_name TEXT CHECK (source_name IS NULL OR length(source_name) <= 160),
    studied_on TEXT NOT NULL CHECK (length(studied_on) = 10),
    answered_count INTEGER NOT NULL CHECK (answered_count > 0),
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0 AND correct_count <= answered_count),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (preparation_id, subject_id)
        REFERENCES subjects(preparation_id, id)
);

CREATE INDEX idx_external_question_batches_date
    ON external_question_batches(studied_on DESC, created_at DESC);
