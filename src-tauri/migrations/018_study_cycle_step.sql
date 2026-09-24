ALTER TABLE study_planning_settings
    ADD COLUMN cycle_step INTEGER NOT NULL DEFAULT 0
    CHECK (cycle_step >= 0);
