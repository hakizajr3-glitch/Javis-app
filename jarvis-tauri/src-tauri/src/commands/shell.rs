use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
}

/// Execute a shell command and return its output.
/// On macOS/Linux this uses /bin/sh -c; on Windows it uses cmd /C.
#[tauri::command]
pub fn execute_shell(command: String) -> Result<ShellResult, String> {
    let (program, args) = if cfg!(target_os = "windows") {
        ("cmd", vec!["/C", &command])
    } else {
        ("/bin/sh", vec!["-c", &command])
    };

    let output = Command::new(program)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(ShellResult {
        stdout,
        stderr,
        exit_code,
        success: output.status.success(),
    })
}

/// Execute a shell command in a specific working directory.
#[tauri::command]
pub fn execute_shell_in_dir(command: String, cwd: String) -> Result<ShellResult, String> {
    let (program, args) = if cfg!(target_os = "windows") {
        ("cmd", vec!["/C", &command])
    } else {
        ("/bin/sh", vec!["-c", &command])
    };

    let output = Command::new(program)
        .args(&args)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(ShellResult {
        stdout,
        stderr,
        exit_code,
        success: output.status.success(),
    })
}
