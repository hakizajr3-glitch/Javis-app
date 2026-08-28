use serde::{Deserialize, Serialize};
use screenshots::Screen;
use base64::Engine;
use image::ImageOutputFormat;
use std::io::Cursor;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub success: bool,
    pub base64: Option<String>,
    pub width: u32,
    pub height: u32,
    pub error: Option<String>,
}

fn encode_png(img: &image::RgbaImage) -> Result<String, String> {
    let mut png_buf = Cursor::new(Vec::new());
    let dyn_img = image::DynamicImage::ImageRgba8(img.clone());
    dyn_img.write_to(&mut png_buf, ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_buf.into_inner()))
}

/// Capture the primary screen and return as base64-encoded PNG.
#[tauri::command]
pub fn capture_screen() -> Result<ScreenshotResult, String> {
    let screens = Screen::all()
        .map_err(|e| format!("Failed to enumerate screens: {}", e))?;

    let screen = screens.first()
        .ok_or("No screens found")?;

    let image = screen.capture()
        .map_err(|e| format!("Failed to capture screen: {}", e))?;

    let width = image.width();
    let height = image.height();
    let b64 = encode_png(&image)?;

    Ok(ScreenshotResult {
        success: true,
        base64: Some(b64),
        width,
        height,
        error: None,
    })
}

/// Capture a specific screen by index (0 = primary).
#[tauri::command]
pub fn capture_screen_by_index(index: usize) -> Result<ScreenshotResult, String> {
    let screens = Screen::all()
        .map_err(|e| format!("Failed to enumerate screens: {}", e))?;

    let screen = screens.get(index)
        .ok_or(format!("Screen index {} not found ({} screens available)", index, screens.len()))?;

    let image = screen.capture()
        .map_err(|e| format!("Failed to capture screen {}: {}", index, e))?;

    let width = image.width();
    let height = image.height();
    let b64 = encode_png(&image)?;

    Ok(ScreenshotResult {
        success: true,
        base64: Some(b64),
        width,
        height,
        error: None,
    })
}

/// Capture a specific region of the primary screen.
#[tauri::command]
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<ScreenshotResult, String> {
    let screens = Screen::all()
        .map_err(|e| format!("Failed to enumerate screens: {}", e))?;

    let screen = screens.first()
        .ok_or("No screens found")?;

    let image = screen.capture_area(x, y, width, height)
        .map_err(|e| format!("Failed to capture region: {}", e))?;

    let w = image.width();
    let h = image.height();
    let b64 = encode_png(&image)?;

    Ok(ScreenshotResult {
        success: true,
        base64: Some(b64),
        width: w,
        height: h,
        error: None,
    })
}

/// List all available screens with their dimensions.
#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenInfo {
    pub index: usize,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[tauri::command]
pub fn list_screens() -> Result<Vec<ScreenInfo>, String> {
    let screens = Screen::all()
        .map_err(|e| format!("Failed to enumerate screens: {}", e))?;

    let mut result = Vec::new();
    for (i, screen) in screens.iter().enumerate() {
        let display_info = screen.display_info;
        result.push(ScreenInfo {
            index: i,
            width: display_info.width,
            height: display_info.height,
            is_primary: display_info.is_primary,
        });
    }
    Ok(result)
}
