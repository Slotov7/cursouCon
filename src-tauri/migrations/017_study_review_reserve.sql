ALTER TABLE study_planning_settings
    ADD COLUMN review_reserve_percent INTEGER NOT NULL DEFAULT 20
    CHECK (review_reserve_percent BETWEEN 0 AND 80);
