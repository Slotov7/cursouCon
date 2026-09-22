ALTER TABLE study_sessions ADD COLUMN active_started_at TEXT;

UPDATE study_sessions
SET active_started_at = started_at
WHERE status = 'active' AND active_started_at IS NULL;
