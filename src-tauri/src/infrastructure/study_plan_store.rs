use super::{map_database_error, workspace_store::LocalWorkspaceStore};
use crate::application::study_plan_service::StudyPlanStore;
use crate::application::workspace_service::WorkspaceError;
use crate::domain::study_plan::{
    CreatePreparationInput, CreateSubjectInput, PreparationSummary, StudyPlan, SubjectSummary,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl StudyPlanStore for LocalWorkspaceStore {
    fn study_plan(&self) -> Result<StudyPlan, WorkspaceError> {
        let connection = self.active_database()?;
        let preparations = load_preparations(&connection)?;
        let subjects = load_subjects(&connection)?;

        Ok(StudyPlan {
            preparations,
            subjects,
        })
    }

    fn create_preparation(
        &self,
        input: &CreatePreparationInput,
    ) -> Result<PreparationSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação da preparação", error))?;
        let primary_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM preparations WHERE archived_at IS NULL AND is_primary = 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("verificar preparação principal", error))?;
        let is_primary = primary_count == 0 || input.make_primary;

        if is_primary {
            transaction
                .execute(
                    "UPDATE preparations SET is_primary = 0 WHERE archived_at IS NULL",
                    [],
                )
                .map_err(|error| map_database_error("alternar preparação principal", error))?;
        }

        let id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO preparations
                    (id, name, organization, role, exam_date, is_primary)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id.as_str(),
                    &input.name,
                    input.organization.as_deref(),
                    input.role.as_deref(),
                    input.exam_date.as_deref(),
                    if is_primary { 1_i64 } else { 0_i64 },
                ],
            )
            .map_err(|error| map_database_error("gravar preparação", error))?;

        let summary = PreparationSummary {
            id,
            name: input.name.clone(),
            organization: input.organization.clone(),
            role: input.role.clone(),
            exam_date: input.exam_date.clone(),
            is_primary,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar preparação", error))?;

        Ok(summary)
    }

    fn create_subject(&self, input: &CreateSubjectInput) -> Result<SubjectSummary, WorkspaceError> {
        let mut connection = self.active_database()?;
        let transaction = connection
            .transaction()
            .map_err(|error| map_database_error("iniciar criação do assunto", error))?;
        ensure_preparation_exists(&transaction, &input.preparation_id)?;

        if let Some(parent_id) = input.parent_id.as_deref() {
            ensure_parent_exists(&transaction, &input.preparation_id, parent_id)?;
        }

        let position: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1
                 FROM subjects
                 WHERE preparation_id = ?1 AND parent_id IS ?2 AND archived_at IS NULL",
                params![input.preparation_id.as_str(), input.parent_id.as_deref()],
                |row| row.get(0),
            )
            .map_err(|error| map_database_error("calcular posição do assunto", error))?;
        let id = Uuid::new_v4().to_string();

        transaction
            .execute(
                "INSERT INTO subjects (id, preparation_id, parent_id, name, position)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id.as_str(),
                    input.preparation_id.as_str(),
                    input.parent_id.as_deref(),
                    &input.name,
                    position,
                ],
            )
            .map_err(|error| map_database_error("gravar assunto", error))?;

        let summary = SubjectSummary {
            id,
            preparation_id: input.preparation_id.clone(),
            parent_id: input.parent_id.clone(),
            name: input.name.clone(),
            position,
        };
        transaction
            .commit()
            .map_err(|error| map_database_error("confirmar assunto", error))?;

        Ok(summary)
    }
}

fn load_preparations(
    connection: &rusqlite::Connection,
) -> Result<Vec<PreparationSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, organization, role, exam_date, is_primary
             FROM preparations
             WHERE archived_at IS NULL
             ORDER BY is_primary DESC, name COLLATE NOCASE",
        )
        .map_err(|error| map_database_error("preparar leitura das preparações", error))?;
    let rows = statement
        .query_map([], |row| {
            let is_primary: i64 = row.get(5)?;
            Ok(PreparationSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                organization: row.get(2)?,
                role: row.get(3)?,
                exam_date: row.get(4)?,
                is_primary: is_primary == 1,
            })
        })
        .map_err(|error| map_database_error("consultar as preparações", error))?;

    rows.map(|row| row.map_err(|error| map_database_error("ler uma preparação", error)))
        .collect()
}

fn load_subjects(connection: &rusqlite::Connection) -> Result<Vec<SubjectSummary>, WorkspaceError> {
    let mut statement = connection
        .prepare(
            "SELECT s.id, s.preparation_id, s.parent_id, s.name, s.position
             FROM subjects s
             JOIN preparations p ON p.id = s.preparation_id
             WHERE s.archived_at IS NULL AND p.archived_at IS NULL
             ORDER BY s.preparation_id, s.parent_id IS NOT NULL, s.position, s.name COLLATE NOCASE",
        )
        .map_err(|error| map_database_error("preparar leitura dos assuntos", error))?;
    let rows = statement
        .query_map([], |row| {
            Ok(SubjectSummary {
                id: row.get(0)?,
                preparation_id: row.get(1)?,
                parent_id: row.get(2)?,
                name: row.get(3)?,
                position: row.get(4)?,
            })
        })
        .map_err(|error| map_database_error("consultar os assuntos", error))?;

    rows.map(|row| row.map_err(|error| map_database_error("ler um assunto", error)))
        .collect()
}

fn ensure_preparation_exists(
    transaction: &rusqlite::Transaction<'_>,
    preparation_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM preparations WHERE id = ?1 AND archived_at IS NULL",
            params![preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar preparação", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "A preparação escolhida não existe mais.".to_string(),
        ));
    }

    Ok(())
}

fn ensure_parent_exists(
    transaction: &rusqlite::Transaction<'_>,
    preparation_id: &str,
    parent_id: &str,
) -> Result<(), WorkspaceError> {
    let exists: Option<i64> = transaction
        .query_row(
            "SELECT 1 FROM subjects
             WHERE id = ?1 AND preparation_id = ?2 AND archived_at IS NULL",
            params![parent_id, preparation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| map_database_error("verificar assunto pai", error))?;

    if exists.is_none() {
        return Err(WorkspaceError::InvalidInput(
            "O assunto pai não pertence à preparação escolhida.".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::study_plan_service::StudyPlanStore;
    use crate::application::workspace_service::WorkspaceStore;
    use std::fs;

    #[test]
    fn creates_preparation_and_nested_subjects_in_one_plan() {
        let workspace_path =
            std::env::temp_dir().join(format!("cursoucon-plan-{}", Uuid::new_v4()));
        let app_data_dir =
            std::env::temp_dir().join(format!("cursoucon-app-data-{}", Uuid::new_v4()));
        let store = LocalWorkspaceStore::new(app_data_dir.clone());
        store
            .create_workspace(&workspace_path, "Plano de teste")
            .expect("o espaço de fixture deve ser criado");

        let preparation = store
            .create_preparation(&CreatePreparationInput {
                name: "Analista de TI".to_string(),
                organization: Some("Órgão".to_string()),
                role: None,
                exam_date: None,
                make_primary: false,
            })
            .expect("a preparação deve ser criada");
        let subject = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Língua Portuguesa".to_string(),
                parent_id: None,
            })
            .expect("o assunto deve ser criado");
        let child = store
            .create_subject(&CreateSubjectInput {
                preparation_id: preparation.id.clone(),
                name: "Interpretação de texto".to_string(),
                parent_id: Some(subject.id.clone()),
            })
            .expect("o subassunto deve ser criado");
        let plan = store.study_plan().expect("o plano deve ser lido");

        assert_eq!(plan.preparations.len(), 1);
        assert_eq!(plan.subjects.len(), 2);
        assert_eq!(plan.subjects[0].parent_id, None);
        assert_eq!(child.parent_id.as_deref(), Some(subject.id.as_str()));

        let _ = fs::remove_dir_all(workspace_path);
        let _ = fs::remove_dir_all(app_data_dir);
    }
}
