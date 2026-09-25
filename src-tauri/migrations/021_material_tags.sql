CREATE TABLE material_tags (
    material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0 AND position < 20),
    tag TEXT NOT NULL COLLATE NOCASE CHECK (length(tag) BETWEEN 1 AND 40),
    PRIMARY KEY (material_id, tag),
    UNIQUE (material_id, position)
);

CREATE INDEX idx_material_tags_tag
    ON material_tags (tag);
