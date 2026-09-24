CREATE UNIQUE INDEX idx_subjects_preparation_id
    ON subjects (preparation_id, id);

CREATE TABLE study_cycle_slots_new (
    preparation_id TEXT NOT NULL REFERENCES preparations(id),
    position INTEGER NOT NULL CHECK (position >= 0),
    subject_id TEXT NOT NULL,
    planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
    PRIMARY KEY (preparation_id, position),
    FOREIGN KEY (preparation_id, subject_id)
        REFERENCES subjects(preparation_id, id)
);

INSERT INTO study_cycle_slots_new (preparation_id, position, subject_id, planned_minutes)
SELECT preparation_id, position, subject_id, planned_minutes
FROM study_cycle_slots;

DROP TABLE study_cycle_slots;

ALTER TABLE study_cycle_slots_new RENAME TO study_cycle_slots;

CREATE INDEX idx_study_cycle_slots_subject
    ON study_cycle_slots (preparation_id, subject_id);
