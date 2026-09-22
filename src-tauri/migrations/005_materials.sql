CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY NOT NULL,
    original_name TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    mime_type TEXT,
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_subjects (
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (material_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_materials_imported_at
    ON materials (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_subjects_subject
    ON material_subjects (subject_id, material_id);
