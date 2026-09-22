ALTER TABLE materials
    ADD COLUMN current_page INTEGER NOT NULL DEFAULT 1 CHECK (current_page >= 1);
