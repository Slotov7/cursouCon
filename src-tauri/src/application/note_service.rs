use crate::application::workspace_service::WorkspaceError;
use crate::domain::note::{normalize_save_note_input, NoteSummary, SaveNoteInput};

pub trait NoteStore {
    fn list_notes(&self) -> Result<Vec<NoteSummary>, WorkspaceError>;
    fn save_note(&self, input: &SaveNoteInput) -> Result<NoteSummary, WorkspaceError>;
}

pub struct NoteService<S> {
    store: S,
}

impl<S: NoteStore> NoteService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub fn list(&self) -> Result<Vec<NoteSummary>, WorkspaceError> {
        self.store.list_notes()
    }

    pub fn save(&self, input: SaveNoteInput) -> Result<NoteSummary, WorkspaceError> {
        let normalized = normalize_save_note_input(input).map_err(WorkspaceError::InvalidInput)?;
        self.store.save_note(&normalized)
    }
}
