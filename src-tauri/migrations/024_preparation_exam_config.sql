ALTER TABLE preparations ADD COLUMN reference_material_id TEXT REFERENCES materials(id) ON DELETE SET NULL;
ALTER TABLE preparations ADD COLUMN exam_rules_markdown TEXT;
ALTER TABLE subjects ADD COLUMN exam_weight REAL CHECK (exam_weight IS NULL OR exam_weight > 0);

CREATE INDEX IF NOT EXISTS idx_preparations_reference_material
    ON preparations (reference_material_id);
