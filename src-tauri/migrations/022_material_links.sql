ALTER TABLE materials ADD COLUMN source_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_source_url
    ON materials (source_url)
    WHERE source_url IS NOT NULL;
