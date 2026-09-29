CREATE TABLE online_contest_opportunities (
    id TEXT PRIMARY KEY NOT NULL,
    source_name TEXT NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 120),
    source_key TEXT NOT NULL CHECK (length(trim(source_key)) BETWEEN 1 AND 2048),
    source_url TEXT NOT NULL CHECK (length(trim(source_url)) BETWEEN 1 AND 2048),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
    organization TEXT CHECK (organization IS NULL OR length(organization) <= 160),
    role TEXT CHECK (role IS NULL OR length(role) <= 240),
    board TEXT CHECK (board IS NULL OR length(board) <= 160),
    area TEXT CHECK (area IS NULL OR length(area) <= 160),
    location TEXT CHECK (location IS NULL OR length(location) <= 160),
    education TEXT CHECK (education IS NULL OR length(education) <= 500),
    salary_text TEXT CHECK (salary_text IS NULL OR length(salary_text) <= 120),
    salary_max REAL CHECK (salary_max IS NULL OR salary_max >= 0),
    vacancies_text TEXT CHECK (vacancies_text IS NULL OR length(vacancies_text) <= 120),
    vacancies INTEGER CHECK (vacancies IS NULL OR vacancies >= 0),
    status TEXT NOT NULL CHECK (status IN (
        'expected',
        'authorized',
        'notice_published',
        'registration_open',
        'registration_closed',
        'completed'
    )),
    status_evidence TEXT NOT NULL CHECK (length(trim(status_evidence)) BETWEEN 1 AND 500),
    registration_starts_on TEXT,
    registration_ends_on TEXT,
    fee_deadline TEXT,
    exam_date TEXT,
    source_checked_at TEXT NOT NULL,
    data_hash TEXT NOT NULL CHECK (length(data_hash) = 64),
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    notice_material_id TEXT REFERENCES materials(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_name, source_key)
);

CREATE TABLE online_contest_history (
    id TEXT PRIMARY KEY NOT NULL,
    opportunity_id TEXT NOT NULL REFERENCES online_contest_opportunities(id) ON DELETE CASCADE,
    source_checked_at TEXT NOT NULL,
    data_hash TEXT NOT NULL CHECK (length(data_hash) = 64),
    change_kind TEXT NOT NULL CHECK (change_kind IN ('initial', 'changed')),
    snapshot_json TEXT NOT NULL CHECK (length(snapshot_json) BETWEEN 2 AND 500000)
);

CREATE TABLE online_contest_source_state (
    source_name TEXT PRIMARY KEY NOT NULL,
    source_url TEXT NOT NULL,
    last_attempted_at TEXT,
    last_successful_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_online_contests_filter
    ON online_contest_opportunities (is_favorite DESC, registration_ends_on, source_checked_at DESC);

CREATE INDEX idx_online_contest_history_opportunity
    ON online_contest_history (opportunity_id, source_checked_at DESC);
