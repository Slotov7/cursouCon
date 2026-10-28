CREATE TABLE flashcards (
    id TEXT PRIMARY KEY NOT NULL,
    subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
    front TEXT NOT NULL CHECK (length(trim(front)) BETWEEN 1 AND 5000),
    back TEXT NOT NULL CHECK (length(trim(back)) BETWEEN 1 AND 10000),
    interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days BETWEEN 0 AND 36500),
    ease INTEGER NOT NULL DEFAULT 250 CHECK (ease BETWEEN 130 AND 300),
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
    due_date TEXT NOT NULL,
    algorithm_version INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE flashcard_reviews (
    id TEXT PRIMARY KEY NOT NULL,
    flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    reviewed_on TEXT NOT NULL,
    due_date TEXT NOT NULL,
    algorithm_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_flashcards_due ON flashcards (archived_at, due_date);
