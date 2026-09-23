CREATE TABLE manual_contests (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
    organization TEXT CHECK (organization IS NULL OR length(organization) <= 120),
    role TEXT CHECK (role IS NULL OR length(role) <= 120),
    board TEXT CHECK (board IS NULL OR length(board) <= 120),
    source_url TEXT CHECK (source_url IS NULL OR length(source_url) <= 2048),
    status TEXT NOT NULL CHECK (status IN (
        'expected',
        'authorized',
        'notice_published',
        'registration_open',
        'registration_closed',
        'completed'
    )),
    registration_starts_on TEXT,
    registration_ends_on TEXT,
    fee_deadline TEXT,
    exam_date TEXT,
    notes TEXT CHECK (notes IS NULL OR length(notes) <= 10000),
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_manual_contests_favorites_deadline
    ON manual_contests (is_favorite DESC, registration_ends_on, exam_date);
