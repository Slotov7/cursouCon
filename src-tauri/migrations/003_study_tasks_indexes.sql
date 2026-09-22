CREATE INDEX IF NOT EXISTS idx_tasks_daily_status
    ON study_tasks (scheduled_for, status, preparation_id);

CREATE INDEX IF NOT EXISTS idx_sessions_open
    ON study_sessions (status, started_at);
