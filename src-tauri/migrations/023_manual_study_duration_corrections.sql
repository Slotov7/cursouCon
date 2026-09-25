ALTER TABLE study_sessions
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'timer'
    CHECK (origin IN ('timer', 'manual'));

CREATE TABLE IF NOT EXISTS study_session_duration_corrections (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    previous_effective_seconds INTEGER NOT NULL CHECK (previous_effective_seconds >= 0),
    corrected_effective_seconds INTEGER NOT NULL CHECK (corrected_effective_seconds >= 0),
    previous_xp INTEGER NOT NULL CHECK (previous_xp >= 0),
    corrected_xp INTEGER NOT NULL CHECK (corrected_xp >= 0),
    reason TEXT NOT NULL,
    corrected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_duration_corrections_session
    ON study_session_duration_corrections (session_id, corrected_at DESC);
