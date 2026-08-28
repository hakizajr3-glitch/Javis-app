use enigo::{Button, Coordinate, Direction, Enigo, Key, Axis, Settings, Keyboard, Mouse};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionResult {
    pub success: bool,
    pub error: Option<String>,
}

fn new_enigo() -> Result<Enigo, String> {
    Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo: {:?}", e))
}

// ─── Mouse commands ───────────────────────────────────────────────────────────

/// Move the mouse to (x, y) screen coordinates.
#[tauri::command]
pub fn mouse_move(x: i32, y: i32) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    enigo.move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Click a mouse button at the current position.
#[tauri::command]
pub fn mouse_click(button: String) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    let btn = match button.as_str() {
        "left" => Button::Left,
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => return Ok(ActionResult { success: false, error: Some(format!("Unknown button: {}", button)) }),
    };
    enigo.button(btn, Direction::Click)
        .map_err(|e| format!("Failed to click: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Double-click the left mouse button.
#[tauri::command]
pub fn mouse_double_click() -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    enigo.button(Button::Left, Direction::Click)
        .map_err(|e| format!("Failed to click: {:?}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    enigo.button(Button::Left, Direction::Click)
        .map_err(|e| format!("Failed to click: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Scroll the mouse wheel (positive = down, negative = up).
#[tauri::command]
pub fn mouse_scroll(amount: i32) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    enigo.scroll(amount, Axis::Vertical)
        .map_err(|e| format!("Failed to scroll: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Drag the mouse from (start_x, start_y) to (end_x, end_y).
#[tauri::command]
pub fn mouse_drag(start_x: i32, start_y: i32, end_x: i32, end_y: i32) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    enigo.move_mouse(start_x, start_y, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {:?}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    enigo.button(Button::Left, Direction::Press)
        .map_err(|e| format!("Failed to press: {:?}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    enigo.move_mouse(end_x, end_y, Coordinate::Abs)
        .map_err(|e| format!("Failed to move mouse: {:?}", e))?;
    std::thread::sleep(std::time::Duration::from_millis(50));
    enigo.button(Button::Left, Direction::Release)
        .map_err(|e| format!("Failed to release: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

// ─── Keyboard commands ────────────────────────────────────────────────────────

/// Type a string of text.
#[tauri::command]
pub fn keyboard_type(text: String) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    enigo.text(&text)
        .map_err(|e| format!("Failed to type text: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Press a single key (e.g., "enter", "escape", "tab", "space").
#[tauri::command]
pub fn keyboard_press(key: String) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    let key_enum = parse_key(&key)
        .ok_or_else(|| format!("Unknown key: {}", key))?;
    enigo.key(key_enum, Direction::Click)
        .map_err(|e| format!("Failed to press key: {:?}", e))?;
    Ok(ActionResult { success: true, error: None })
}

/// Press a key combination (e.g., ["control", "c"] for Ctrl+C).
#[tauri::command]
pub fn keyboard_hotkey(keys: Vec<String>) -> Result<ActionResult, String> {
    let mut enigo = new_enigo()?;
    let key_enums: Vec<Key> = keys.iter()
        .filter_map(|k| parse_key(k))
        .collect();
    if key_enums.is_empty() {
        return Ok(ActionResult { success: false, error: Some("No valid keys provided".to_string()) });
    }
    // Press all keys down
    for key in &key_enums {
        let _ = enigo.key(*key, Direction::Press);
    }
    // Release in reverse order
    for key in key_enums.iter().rev() {
        let _ = enigo.key(*key, Direction::Release);
    }
    Ok(ActionResult { success: true, error: None })
}

/// Get the current mouse cursor position.
#[derive(Debug, Serialize, Deserialize)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
}

#[tauri::command]
pub fn get_cursor_position() -> Result<CursorPosition, String> {
    let enigo = new_enigo()?;
    let (x, y) = enigo.location()
        .map_err(|e| format!("Failed to get cursor position: {:?}", e))?;
    Ok(CursorPosition { x, y })
}

// ─── Key name parser ──────────────────────────────────────────────────────────

fn parse_key(name: &str) -> Option<Key> {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "enter" | "return" => Some(Key::Return),
        "escape" | "esc" => Some(Key::Escape),
        "tab" => Some(Key::Tab),
        "space" => Some(Key::Space),
        "backspace" => Some(Key::Backspace),
        "delete" | "del" => Some(Key::Delete),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        "up" => Some(Key::UpArrow),
        "down" => Some(Key::DownArrow),
        "left" => Some(Key::LeftArrow),
        "right" => Some(Key::RightArrow),
        "control" | "ctrl" => Some(Key::Control),
        "shift" => Some(Key::Shift),
        "alt" | "option" => Some(Key::Alt),
        "meta" | "cmd" | "command" | "super" => Some(Key::Meta),
        "capslock" => Some(Key::CapsLock),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        c if c.len() == 1 => {
            let ch = c.chars().next().unwrap();
            Some(Key::Unicode(ch))
        }
        _ => None,
    }
}
