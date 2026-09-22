CREATE TABLE IF NOT EXISTS workspace_metadata (
    workspace_id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    format_version INTEGER NOT NULL CHECK (format_version > 0)
);

CREATE TABLE IF NOT EXISTS preparations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    organization TEXT,
    role TEXT,
    exam_date TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    archived_at TEXT
);

CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY NOT NULL,
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    parent_id TEXT REFERENCES subjects(id),
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
);

CREATE TABLE IF NOT EXISTS study_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    subject_id TEXT REFERENCES subjects(id),
    title TEXT NOT NULL,
    objective TEXT,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
    scheduled_for TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed', 'skipped'))
);

CREATE TABLE IF NOT EXISTS study_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT REFERENCES study_tasks(id),
    subject_id TEXT REFERENCES subjects(id),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    effective_seconds INTEGER NOT NULL DEFAULT 0 CHECK (effective_seconds >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'interrupted')),
    notes_markdown TEXT
);

CREATE TABLE IF NOT EXISTS xp_events (
    id TEXT PRIMARY KEY NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    rules_version INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_subjects_preparation ON subjects (preparation_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule ON study_tasks (scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_sessions_subject ON study_sessions (subject_id, started_at);
