mod commands;

use commands::shell;
use commands::files;
use commands::desktop;
use commands::capture;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Shell commands
            shell::execute_shell,
            shell::execute_shell_in_dir,
            // File commands
            files::read_file,
            files::write_file,
            files::append_file,
            files::delete_path,
            files::copy_file,
            files::move_path,
            files::list_dir,
            files::path_exists,
            files::create_dir,
            files::file_info,
            // Desktop automation commands
            desktop::mouse_move,
            desktop::mouse_click,
            desktop::mouse_double_click,
            desktop::mouse_scroll,
            desktop::mouse_drag,
            desktop::keyboard_type,
            desktop::keyboard_press,
            desktop::keyboard_hotkey,
            desktop::get_cursor_position,
            // Screen capture commands
            capture::capture_screen,
            capture::capture_screen_by_index,
            capture::capture_region,
            capture::list_screens,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
