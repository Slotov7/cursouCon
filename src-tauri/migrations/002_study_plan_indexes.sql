CREATE INDEX IF NOT EXISTS idx_preparations_active
    ON preparations (archived_at, is_primary, name);

CREATE INDEX IF NOT EXISTS idx_subjects_tree
    ON subjects (preparation_id, parent_id, archived_at, position);
