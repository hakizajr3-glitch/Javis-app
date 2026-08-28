/**
 * tauriCommands — TypeScript bridge to the Rust #[tauri::command] functions.
 *
 * When JARVIS says "open Terminal and run npm test", the conversation runtime
 * parses the intent, calls these functions, and the Rust backend executes
 * real shell commands, file operations, mouse/keyboard, and screen capture
 * on the user's actual computer.
 *
 * In the browser (no Tauri), all calls throw gracefully so the UI still works
 * for development/testing.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface FileResult {
  success: boolean;
  error: string | null;
  data: string | null;
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
}

export interface FileMetadata {
  exists: boolean;
  isFile: boolean;
  isDir: boolean;
  size: number;
  readonly: boolean;
}

export interface ActionResult {
  success: boolean;
  error: string | null;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface ScreenshotResult {
  success: boolean;
  base64: string | null;
  width: number;
  height: number;
  error: string | null;
}

export interface ScreenInfo {
  index: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

// ─── Tauri invoke helper ─────────────────────────────────────────────────────

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Dynamic import — in Tauri this resolves to @tauri-apps/api/core
  // In browser it throws, which we catch
  try {
    const tauri = await import('@tauri-apps/api/core');
    return await tauri.invoke<T>(cmd, args);
  } catch (e: any) {
    if (e?.message?.includes('window.__TAURI_INTERNALS__')) {
      throw new Error(`Tauri command "${cmd}" not available — running in browser mode`);
    }
    throw e;
  }
}

// ─── Shell commands ──────────────────────────────────────────────────────────

export async function executeShell(command: string): Promise<ShellResult> {
  return invoke<ShellResult>('execute_shell', { command });
}

export async function executeShellInDir(command: string, cwd: string): Promise<ShellResult> {
  return invoke<ShellResult>('execute_shell_in_dir', { command, cwd });
}

// ─── File commands ───────────────────────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  const result = await invoke<FileResult>('read_file', { path });
  if (!result.success) throw new Error(result.error || 'Read failed');
  return result.data || '';
}

export async function writeFile(path: string, content: string): Promise<void> {
  const result = await invoke<FileResult>('write_file', { path, content });
  if (!result.success) throw new Error(result.error || 'Write failed');
}

export async function appendFile(path: string, content: string): Promise<void> {
  const result = await invoke<FileResult>('append_file', { path, content });
  if (!result.success) throw new Error(result.error || 'Append failed');
}

export async function deletePath(path: string): Promise<void> {
  const result = await invoke<FileResult>('delete_path', { path });
  if (!result.success) throw new Error(result.error || 'Delete failed');
}

export async function copyFile(source: string, destination: string): Promise<void> {
  const result = await invoke<FileResult>('copy_file', { source, destination });
  if (!result.success) throw new Error(result.error || 'Copy failed');
}

export async function movePath(source: string, destination: string): Promise<void> {
  const result = await invoke<FileResult>('move_path', { source, destination });
  if (!result.success) throw new Error(result.error || 'Move failed');
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('list_dir', { path });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>('path_exists', { path });
}

export async function createDir(path: string): Promise<void> {
  const result = await invoke<FileResult>('create_dir', { path });
  if (!result.success) throw new Error(result.error || 'Create dir failed');
}

export async function fileInfo(path: string): Promise<FileMetadata> {
  return invoke<FileMetadata>('file_info', { path });
}

// ─── Desktop automation (mouse/keyboard) ─────────────────────────────────────

export async function mouseMove(x: number, y: number): Promise<void> {
  const result = await invoke<ActionResult>('mouse_move', { x, y });
  if (!result.success) throw new Error(result.error || 'Mouse move failed');
}

export async function mouseClick(button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
  const result = await invoke<ActionResult>('mouse_click', { button });
  if (!result.success) throw new Error(result.error || 'Mouse click failed');
}

export async function mouseDoubleClick(): Promise<void> {
  const result = await invoke<ActionResult>('mouse_double_click');
  if (!result.success) throw new Error(result.error || 'Double click failed');
}

export async function mouseScroll(amount: number): Promise<void> {
  const result = await invoke<ActionResult>('mouse_scroll', { amount });
  if (!result.success) throw new Error(result.error || 'Scroll failed');
}

export async function mouseDrag(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  const result = await invoke<ActionResult>('mouse_drag', {
    startX, startY, endX, endY,
  });
  if (!result.success) throw new Error(result.error || 'Drag failed');
}

export async function keyboardType(text: string): Promise<void> {
  const result = await invoke<ActionResult>('keyboard_type', { text });
  if (!result.success) throw new Error(result.error || 'Type failed');
}

export async function keyboardPress(key: string): Promise<void> {
  const result = await invoke<ActionResult>('keyboard_press', { key });
  if (!result.success) throw new Error(result.error || 'Key press failed');
}

export async function keyboardHotkey(keys: string[]): Promise<void> {
  const result = await invoke<ActionResult>('keyboard_hotkey', { keys });
  if (!result.success) throw new Error(result.error || 'Hotkey failed');
}

export async function getCursorPosition(): Promise<CursorPosition> {
  return invoke<CursorPosition>('get_cursor_position');
}

// ─── Screen capture ──────────────────────────────────────────────────────────

export async function captureScreen(): Promise<ScreenshotResult> {
  return invoke<ScreenshotResult>('capture_screen');
}

export async function captureScreenByIndex(index: number): Promise<ScreenshotResult> {
  return invoke<ScreenshotResult>('capture_screen_by_index', { index });
}

export async function captureRegion(x: number, y: number, width: number, height: number): Promise<ScreenshotResult> {
  return invoke<ScreenshotResult>('capture_region', { x, y, width, height });
}

export async function listScreens(): Promise<ScreenInfo[]> {
  return invoke<ScreenInfo[]>('list_screens');
}

// ─── Check if we're running in Tauri ──────────────────────────────────────────

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}
