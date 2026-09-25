ALTER TABLE manual_contests
    ADD COLUMN notice_material_id TEXT REFERENCES materials(id) ON DELETE SET NULL;

CREATE INDEX idx_manual_contests_notice_material
    ON manual_contests (notice_material_id);
