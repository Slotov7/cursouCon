ALTER TABLE study_sessions
    ADD COLUMN difficulty TEXT
    CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard'));

ALTER TABLE study_sessions
    ADD COLUMN next_steps TEXT
    CHECK (next_steps IS NULL OR length(next_steps) <= 5000);
