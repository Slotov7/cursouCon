CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    material_id TEXT REFERENCES materials(id),
    subject_id TEXT REFERENCES subjects(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (material_id IS NOT NULL OR subject_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at
    ON notes (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_material
    ON notes (material_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_subject
    ON notes (subject_id, updated_at DESC);
