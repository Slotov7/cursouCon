use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::workspace_service::WorkspaceError;
use crate::domain::flashcard::{next_schedule, Flashcard, Rating};
use crate::domain::study_plan::normalize_date;
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

fn row_to_card(row: &Row<'_>) -> rusqlite::Result<Flashcard> {
    Ok(Flashcard {
        id: row.get(0)?,
        subject_id: row.get(1)?,
        front: row.get(2)?,
        back: row.get(3)?,
        interval_days: row.get(4)?,
        ease: row.get(5)?,
        repetitions: row.get(6)?,
        due_date: row.get(7)?,
        algorithm_version: row.get(8)?,
    })
}

const COLUMNS: &str =
    "id, subject_id, front, back, interval_days, ease, repetitions, due_date, algorithm_version";

fn load_card(connection: &Connection, id: &str) -> Result<Flashcard, WorkspaceError> {
    connection
        .query_row(
            &format!("SELECT {COLUMNS} FROM flashcards WHERE id = ?1 AND archived_at IS NULL"),
            params![id],
            row_to_card,
        )
        .optional()
        .map_err(|error| map_database_error("ler flashcard", error))?
        .ok_or_else(|| WorkspaceError::InvalidInput("Flashcard não encontrado.".into()))
}

impl LocalWorkspaceStore {
    pub(crate) fn list_flashcards(
        &self,
        as_of: &str,
        offset: i64,
    ) -> Result<Vec<Flashcard>, WorkspaceError> {
        let as_of = normalize_date(as_of).map_err(WorkspaceError::InvalidInput)?;
        if !(0..=1_000_000).contains(&offset) {
            return Err(WorkspaceError::InvalidInput("Página inválida.".into()));
        }
        let connection = self.active_database()?;
        let mut statement = connection
            .prepare(&format!(
                "SELECT {COLUMNS} FROM flashcards WHERE archived_at IS NULL
             ORDER BY (due_date <= ?1) DESC, due_date, id LIMIT 100 OFFSET ?2"
            ))
            .map_err(|error| map_database_error("preparar flashcards", error))?;
        let rows = statement
            .query_map(params![as_of, offset], row_to_card)
            .map_err(|error| map_database_error("consultar flashcards", error))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| map_database_error("ler flashcards", error))
    }

    pub(crate) fn create_flashcard(
        &self,
        front: &str,
        back: &str,
        subject_id: Option<&str>,
        today: &str,
        legacy_schedule: Option<(i64, i64, i64, &str)>,
    ) -> Result<Flashcard, WorkspaceError> {
        let today = normalize_date(today).map_err(WorkspaceError::InvalidInput)?;
        if front.trim().is_empty()
            || front.chars().count() > 5000
            || back.trim().is_empty()
            || back.chars().count() > 10000
        {
            return Err(WorkspaceError::InvalidInput(
                "Informe frente e verso dentro dos limites permitidos.".into(),
            ));
        }
        let (interval, ease, repetitions, due_date) =
            if let Some((interval, ease, repetitions, due)) = legacy_schedule {
                if !(0..=36500).contains(&interval)
                    || !(130..=300).contains(&ease)
                    || repetitions < 0
                {
                    return Err(WorkspaceError::InvalidInput(
                        "Agendamento antigo inválido.".into(),
                    ));
                }
                (
                    interval,
                    ease,
                    repetitions,
                    normalize_date(due).map_err(WorkspaceError::InvalidInput)?,
                )
            } else {
                (0, 250, 0, today.clone())
            };
        let connection = self.active_database()?;
        if let Some(id) = subject_id {
            let exists: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM subjects WHERE id = ?1 AND archived_at IS NULL",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|error| map_database_error("verificar assunto", error))?;
            if exists != 1 {
                return Err(WorkspaceError::InvalidInput("Assunto inválido.".into()));
            }
        }
        let id = Uuid::new_v4().to_string();
        connection.execute(
            "INSERT INTO flashcards (id, subject_id, front, back, due_date, interval_days, ease, repetitions) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, subject_id, front.trim(), back.trim(), due_date, interval, ease, repetitions],
        ).map_err(|error| map_database_error("criar flashcard", error))?;
        load_card(&connection, &id)
    }

    pub(crate) fn review_flashcard(
        &self,
        id: &str,
        rating: Rating,
        today: &str,
        operation_id: &str,
    ) -> Result<Flashcard, WorkspaceError> {
        let today = normalize_date(today).map_err(WorkspaceError::InvalidInput)?;
        let operation_id = Uuid::parse_str(operation_id).map_err(|_| {
            WorkspaceError::InvalidInput("Identificador da avaliação inválido.".into())
        })?;
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar avaliação", error))?;
        let previous: Option<String> = transaction
            .query_row(
                "SELECT flashcard_id FROM flashcard_reviews WHERE id = ?1",
                params![operation_id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| map_database_error("verificar avaliação", error))?;
        if let Some(previous) = previous {
            if previous != id {
                return Err(WorkspaceError::InvalidInput(
                    "Avaliação pertence a outro cartão.".into(),
                ));
            }
            return load_card(&transaction, id);
        }
        let card = load_card(&transaction, id)?;
        if card.due_date > today {
            return Err(WorkspaceError::InvalidInput(
                "Este cartão ainda não está vencido.".into(),
            ));
        }
        let (interval, ease, repetitions) = next_schedule(&card, rating);
        let due: String = transaction
            .query_row(
                "SELECT date(?1, '+' || ?2 || ' days')",
                params![today, interval],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("calcular próxima revisão", error))?;
        transaction.execute(
            "UPDATE flashcards SET interval_days=?1, ease=?2, repetitions=?3, due_date=?4 WHERE id=?5",
            params![interval, ease, repetitions, due, id],
        ).map_err(|error| map_database_error("agendar flashcard", error))?;
        transaction.execute(
            "INSERT INTO flashcard_reviews (id, flashcard_id, rating, reviewed_on, due_date, algorithm_version)
             VALUES (?1, ?2, ?3, ?4, ?5, 1)",
            params![operation_id.to_string(), id, rating.as_str(), today, due],
        ).map_err(|error| map_database_error("gravar avaliação", error))?;
        let updated = load_card(&transaction, id)?;
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar avaliação", error))?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::workspace_service::WorkspaceStore;
    use std::fs;

    #[test]
    fn persists_reviews_across_reopening_and_retries_without_duplicates() {
        let portable = std::env::temp_dir().join(format!("flashcard-{}", Uuid::new_v4()));
        let app_data = std::env::temp_dir().join(format!("flashcard-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data.clone());
        store
            .create_workspace(&portable, "Teste")
            .expect("workspace temporário");
        let card = store
            .create_flashcard("Frente", "Verso", None, "2032-01-01", None)
            .expect("criar");
        let imported = store
            .create_flashcard(
                "Frente antiga",
                "Verso antigo",
                None,
                "2032-01-01",
                Some((7, 245, 4, "2032-01-08")),
            )
            .expect("importar agendamento antigo");
        assert_eq!(
            (
                imported.interval_days,
                imported.ease,
                imported.repetitions,
                imported.due_date.as_str()
            ),
            (7, 245, 4, "2032-01-08")
        );
        let operation = Uuid::new_v4().to_string();
        let first = store
            .review_flashcard(&card.id, Rating::Good, "2032-01-01", &operation)
            .expect("avaliar");
        let repeated = store
            .review_flashcard(&card.id, Rating::Good, "2032-01-01", &operation)
            .expect("repetir");
        assert_eq!(first.due_date, "2032-01-02");
        assert_eq!(repeated.due_date, first.due_date);
        assert!(store
            .review_flashcard(
                &card.id,
                Rating::Good,
                "2032-01-01",
                &Uuid::new_v4().to_string()
            )
            .is_err());
        store.open_workspace(&portable).expect("reabrir");
        let connection = store.active_database().expect("banco");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM flashcard_reviews", [], |row| {
                row.get(0)
            })
            .expect("histórico");
        assert_eq!(count, 1);
        assert_eq!(
            store.list_flashcards("2032-01-01", 0).expect("lista")[0].due_date,
            "2032-01-02"
        );
        drop(connection);
        let _ = fs::remove_dir_all(portable);
        let _ = fs::remove_dir_all(app_data);
    }
}
