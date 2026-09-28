ALTER TABLE preparations ADD COLUMN board TEXT CHECK (board IS NULL OR length(board) <= 120);
