-- Existing references have no verified publication status; never label them as current implicitly.
ALTER TABLE preparations ADD COLUMN reference_document_status TEXT NOT NULL DEFAULT 'reference'
    CHECK (
        reference_document_status IN ('reference', 'current')
        AND (reference_document_status != 'current' OR reference_material_id IS NOT NULL)
    );
