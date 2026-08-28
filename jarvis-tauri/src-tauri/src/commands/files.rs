use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileResult {
    pub success: bool,
    pub error: Option<String>,
    pub data: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
}

/// Read a file's contents as a UTF-8 string.
#[tauri::command]
pub fn read_file(path: String) -> Result<FileResult, String> {
    match fs::read_to_string(&path) {
        Ok(content) => Ok(FileResult {
            success: true,
            error: None,
            data: Some(content),
        }),
        Err(e) => Ok(FileResult {
            success: false,
            error: Some(format!("Failed to read file: {}", e)),
            data: None,
        }),
    }
}

/// Write content to a file (creates or overwrites).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<FileResult, String> {
    // Ensure parent directory exists
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    match fs::write(&path, &content) {
        Ok(_) => Ok(FileResult {
            success: true,
            error: None,
            data: None,
        }),
        Err(e) => Ok(FileResult {
            success: false,
            error: Some(format!("Failed to write file: {}", e)),
            data: None,
        }),
    }
}

/// Append content to a file.
#[tauri::command]
pub fn append_file(path: String, content: String) -> Result<FileResult, String> {
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Failed to open file for append: {}", e))?;

    match file.write_all(content.as_bytes()) {
        Ok(_) => Ok(FileResult {
            success: true,
            error: None,
            data: None,
        }),
        Err(e) => Ok(FileResult {
            success: false,
            error: Some(format!("Failed to append to file: {}", e)),
            data: None,
        }),
    }
}

/// Delete a file or directory (recursively for directories).
#[tauri::command]
pub fn delete_path(path: String) -> Result<FileResult, String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        match fs::remove_dir_all(&p) {
            Ok(_) => Ok(FileResult { success: true, error: None, data: None }),
            Err(e) => Ok(FileResult { success: false, error: Some(format!("Failed to delete directory: {}", e)), data: None }),
        }
    } else {
        match fs::remove_file(&p) {
            Ok(_) => Ok(FileResult { success: true, error: None, data: None }),
            Err(e) => Ok(FileResult { success: false, error: Some(format!("Failed to delete file: {}", e)), data: None }),
        }
    }
}

/// Copy a file from source to destination.
#[tauri::command]
pub fn copy_file(source: String, destination: String) -> Result<FileResult, String> {
    match fs::copy(&source, &destination) {
        Ok(_) => Ok(FileResult { success: true, error: None, data: None }),
        Err(e) => Ok(FileResult { success: false, error: Some(format!("Failed to copy file: {}", e)), data: None }),
    }
}

/// Move/rename a file or directory.
#[tauri::command]
pub fn move_path(source: String, destination: String) -> Result<FileResult, String> {
    match fs::rename(&source, &destination) {
        Ok(_) => Ok(FileResult { success: true, error: None, data: None }),
        Err(e) => Ok(FileResult { success: false, error: Some(format!("Failed to move: {}", e)), data: None }),
    }
}

/// List directory contents.
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut result = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
            result.push(DirEntry {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                is_file: metadata.is_file(),
                size: metadata.len(),
            });
        }
    }
    Ok(result)
}

/// Check if a path exists.
#[tauri::command]
pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

/// Create a directory (and all parent directories).
#[tauri::command]
pub fn create_dir(path: String) -> Result<FileResult, String> {
    match fs::create_dir_all(&path) {
        Ok(_) => Ok(FileResult { success: true, error: None, data: None }),
        Err(e) => Ok(FileResult { success: false, error: Some(format!("Failed to create directory: {}", e)), data: None }),
    }
}

/// Get file metadata (size, modified time, etc.).
#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub exists: bool,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
    pub readonly: bool,
}

#[tauri::command]
pub fn file_info(path: String) -> Result<FileMetadata, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(FileMetadata {
            exists: false,
            is_file: false,
            is_dir: false,
            size: 0,
            readonly: false,
        });
    }
    let metadata = fs::metadata(&p)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    Ok(FileMetadata {
        exists: true,
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        size: metadata.len(),
        readonly: metadata.permissions().readonly(),
    })
}
