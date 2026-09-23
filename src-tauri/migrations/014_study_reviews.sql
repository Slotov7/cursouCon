CREATE TABLE study_reviews (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    source_session_id TEXT NOT NULL UNIQUE REFERENCES study_sessions(id),
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    CHECK (
        (status = 'pending' AND completed_at IS NULL) OR
        (status = 'completed' AND completed_at IS NOT NULL)
    )
);

CREATE INDEX idx_study_reviews_due
    ON study_reviews (status, due_date, subject_id);
