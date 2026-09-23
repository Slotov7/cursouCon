ALTER TABLE subjects
ADD COLUMN study_status TEXT NOT NULL DEFAULT 'not_started'
CHECK (study_status IN ('not_started', 'in_progress', 'theory_completed'));
