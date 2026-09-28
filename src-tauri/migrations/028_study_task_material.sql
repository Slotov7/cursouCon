ALTER TABLE study_tasks ADD COLUMN material_id TEXT REFERENCES materials(id) ON DELETE SET NULL;

CREATE INDEX idx_study_tasks_material ON study_tasks(material_id);
