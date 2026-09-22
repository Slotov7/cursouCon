mod application;
mod commands;
mod domain;
mod infrastructure;

pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace::create_workspace,
            commands::workspace::get_active_workspace,
            commands::workspace::open_workspace,
            commands::study_plan::get_study_plan,
            commands::study_plan::create_preparation,
            commands::study_plan::create_subject,
            commands::material::get_materials,
            commands::material::import_material,
            commands::material::open_material,
            commands::material::get_material_source,
            commands::material::update_material_page,
            commands::note::get_notes,
            commands::note::save_note,
            commands::question::get_questions,
            commands::question::create_question,
            commands::question::answer_question,
            commands::question::preview_question_import,
            commands::question::import_questions,
            commands::question::export_questions,
            commands::study::get_daily_plan,
            commands::study::create_study_task,
            commands::study::reschedule_study_task,
            commands::study::skip_study_task,
            commands::study::start_study_session,
            commands::study::pause_study_session,
            commands::study::resume_study_session,
            commands::study::finish_study_session,
            commands::study::get_study_progress
        ])
        .run(tauri::generate_context!())
}
