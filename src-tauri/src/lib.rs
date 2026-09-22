mod application;
mod commands;
mod domain;
mod infrastructure;

pub fn run() -> Result<(), tauri::Error> {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace::create_workspace,
            commands::workspace::get_active_workspace,
            commands::workspace::open_workspace,
            commands::study_plan::get_study_plan,
            commands::study_plan::create_preparation,
            commands::study_plan::create_subject,
            commands::study::get_daily_plan,
            commands::study::create_study_task,
            commands::study::start_study_session,
            commands::study::finish_study_session
        ])
        .run(tauri::generate_context!())
}
