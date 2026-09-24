ALTER TABLE subjects
    ADD COLUMN priority INTEGER NOT NULL DEFAULT 3
    CHECK (priority BETWEEN 1 AND 5);

CREATE TABLE study_planning_settings (
    preparation_id TEXT PRIMARY KEY NOT NULL REFERENCES preparations(id),
    cycle_position INTEGER NOT NULL DEFAULT 0 CHECK (cycle_position >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_availability (
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    available_minutes INTEGER NOT NULL DEFAULT 0 CHECK (available_minutes BETWEEN 0 AND 1440),
    is_rest INTEGER NOT NULL DEFAULT 0 CHECK (is_rest IN (0, 1)),
    PRIMARY KEY (preparation_id, weekday),
    CHECK (is_rest = 0 OR available_minutes = 0)
);

CREATE TABLE study_cycle_slots (
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
    PRIMARY KEY (preparation_id, position)
);

CREATE INDEX idx_study_cycle_slots_subject
    ON study_cycle_slots (preparation_id, subject_id);
