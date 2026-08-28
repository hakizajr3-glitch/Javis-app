"""
System Agent - System-level operations
"""

import logging
import platform
import subprocess
import os
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class SystemAgent:
    """
    System Agent: Handles system-level operations.

    Platform-aware: Works on Windows, macOS, and Linux.
    """

    def __init__(self, execution_engine: Any):
        self.execution_engine = execution_engine
        self.platform = platform.system().lower()

    async def execute(
        self, action: str, params: Dict[str, Any], context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a system operation.

        Args:
            action: The action to perform
            params: Action parameters
            context: Execution context

        Returns:
            Execution result
        """
        try:
            if action == "launch_application" or action == "launch_app":
                return await self._launch_app(params)
            elif action == "close_application":
                return await self._close_app(params)
            elif action == "system_info":
                return await self._system_info(params)
            elif action == "run_command":
                return await self._run_command(params)
            elif action == "identify_application":
                return await self._identify_app(params)
            elif action == "verify_launch":
                return await self._verify_launch(params)
            elif action == "clipboard":
                return await self._clipboard(params)
            elif action == "open_settings":
                return await self._open_settings(params)
            elif action == "open_facetime":
                return await self._open_facetime(params)
            elif action == "open_contacts":
                return await self._open_contacts(params)
            elif action == "make_facetime_call":
                return await self._make_facetime_call(params)
            elif action == "app_automation":
                return await self._app_automation(params)
            elif action == "type_text":
                return await self._type_text(params)
            elif action == "press_keys":
                return await self._press_keys(params)
            else:
                return {"success": False, "error": f"Unknown system action: {action}"}
        except Exception as e:
            logger.error(f"System operation error ({action}): {e}")
            return {"success": False, "error": str(e)}

    async def _launch_app(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Launch an application"""
        app_name = params.get("app_name")

        if not app_name:
            return {"success": False, "error": "No app name specified"}

        # Platform-specific launch commands
        if self.platform == "darwin":  # macOS
            # Try as app bundle name first
            cmd = ["open", "-a", app_name]
            try:
                subprocess.Popen(
                    cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
            except:
                # Try as direct path
                subprocess.Popen(["open", app_name])

        elif self.platform == "windows":
            # Try to launch
            try:
                subprocess.Popen(["start", "", app_name], shell=True)
            except:
                os.startfile(app_name)

        else:  # Linux
            subprocess.Popen(
                [app_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )

        return {
            "success": True,
            "output": {"launched": app_name, "platform": self.platform},
        }

    async def _close_app(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Close an application"""
        app_name = params.get("app_name")

        if not app_name:
            return {"success": False, "error": "No app name specified"}

        # Platform-specific close commands
        if self.platform == "darwin":
            subprocess.run(["pkill", "-f", app_name])
        elif self.platform == "windows":
            subprocess.run(
                ["taskkill", "/F", "/IM", app_name + ".exe"], capture_output=True
            )
        else:
            subprocess.run(["pkill", "-f", app_name])

        return {"success": True, "output": {"closed": app_name}}

    async def _system_info(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get system information"""
        info = {
            "platform": platform.system(),
            "platform_release": platform.release(),
            "platform_version": platform.version(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "python_version": platform.python_version(),
        }

        return {"success": True, "output": info}

    async def _run_command(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run a shell command"""
        command = params.get("command")

        if not command:
            return {"success": False, "error": "No command specified"}

        # Security: Only allow safe commands
        # In production, implement proper command whitelist

        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True, timeout=30
            )

            return {
                "success": result.returncode == 0,
                "output": {
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "returncode": result.returncode,
                },
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": "Command timed out"}

    async def _identify_app(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Identify application from user input"""
        app_candidate = params.get("app_candidate")

        # Common app mappings
        app_mappings = {
            "chrome": "Google Chrome",
            "browser": "Google Chrome",
            "firefox": "Firefox",
            "safari": "Safari",
            "edge": "Microsoft Edge",
            "code": "Visual Studio Code",
            "vscode": "Visual Studio Code",
            "terminal": "Terminal",
            "finder": "Finder",
            "explorer": "File Explorer",
            "notepad": "Notepad",
            "textedit": "TextEdit",
            "word": "Microsoft Word",
            "excel": "Microsoft Excel",
            "powerpoint": "Microsoft PowerPoint",
            "slack": "Slack",
            "discord": "Discord",
            "spotify": "Spotify",
            "music": "Spotify",
            "facetime": "FaceTime",
            "contacts": "Contacts",
            "settings": "System Settings",
            "system preferences": "System Settings",
            "mail": "Mail",
            "messages": "Messages",
            "calendar": "Calendar",
            "photos": "Photos",
            "notes": "Notes",
            "reminders": "Reminders",
            "maps": "Maps",
            "app store": "App Store",
            "appstore": "App Store",
        }

        app_name = app_mappings.get(app_candidate.lower(), app_candidate)

        return {
            "success": True,
            "output": {"identified_app": app_name, "input": app_candidate},
        }

    async def _verify_launch(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Verify an application was launched"""
        app_name = params.get("app_name")

        # Check if process is running
        is_running = False

        try:
            if self.platform == "darwin":
                result = subprocess.run(["pgrep", "-f", app_name], capture_output=True)
                is_running = result.returncode == 0
            elif self.platform == "windows":
                result = subprocess.run(["tasklist"], capture_output=True, text=True)
                is_running = app_name.lower() in result.stdout.lower()
            else:
                result = subprocess.run(["pgrep", "-f", app_name], capture_output=True)
                is_running = result.returncode == 0
        except:
            pass

        return {"success": True, "output": {"app": app_name, "is_running": is_running}}

    async def _clipboard(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Interact with clipboard"""
        operation = params.get("operation", "copy")
        text = params.get("text", "")

        try:
            if self.platform == "darwin":
                if operation == "copy":
                    process = subprocess.Popen(["pbcopy"], stdin=subprocess.PIPE)
                    process.communicate(text.encode())
                elif operation == "paste":
                    result = subprocess.run(["pbpaste"], capture_output=True, text=True)
                    return {"success": True, "output": {"text": result.stdout}}

            elif self.platform == "windows":
                # Windows clipboard handling
                import win32clipboard

                if operation == "copy":
                    win32clipboard.OpenClipboard()
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardText(text)
                    win32clipboard.CloseClipboard()
                elif operation == "paste":
                    win32clipboard.OpenClipboard()
                    data = win32clipboard.GetClipboardData()
                    win32clipboard.CloseClipboard()
                    return {"success": True, "output": {"text": data}}

            else:  # Linux
                if operation == "copy":
                    process = subprocess.Popen(
                        ["xclip", "-selection", "clipboard"], stdin=subprocess.PIPE
                    )
                    process.communicate(text.encode())
                elif operation == "paste":
                    result = subprocess.run(
                        ["xclip", "-selection", "clipboard", "-o"],
                        capture_output=True,
                        text=True,
                    )
                    return {"success": True, "output": {"text": result.stdout}}

            return {"success": True, "output": {"operation": operation}}

        except Exception as e:
            return {"success": False, "error": f"Clipboard operation failed: {str(e)}"}

    async def _open_settings(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Open macOS System Settings/Preferences"""
        try:
            if self.platform == "darwin":
                # Open specific pane if specified
                pane = params.get("pane", "")
                if pane:
                    # Open specific settings pane
                    script = f'''
                    tell application "System Settings"
                        activate
                        set current pane to pane "{pane}"
                    end tell
                    '''
                    subprocess.run(["osascript", "-e", script], capture_output=True)
                else:
                    subprocess.run(
                        ["open", "-a", "System Settings"], capture_output=True
                    )

                return {
                    "success": True,
                    "output": {"opened": "System Settings", "pane": pane},
                }
            else:
                return {
                    "success": False,
                    "error": "Settings control only available on macOS",
                }
        except Exception as e:
            return {"success": False, "error": f"Failed to open settings: {str(e)}"}

    async def _open_facetime(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Open FaceTime app"""
        try:
            if self.platform == "darwin":
                subprocess.run(["open", "-a", "FaceTime"], capture_output=True)
                return {"success": True, "output": {"opened": "FaceTime"}}
            else:
                return {"success": False, "error": "FaceTime only available on macOS"}
        except Exception as e:
            return {"success": False, "error": f"Failed to open FaceTime: {str(e)}"}

    async def _open_contacts(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Open Contacts app"""
        try:
            if self.platform == "darwin":
                subprocess.run(["open", "-a", "Contacts"], capture_output=True)
                return {"success": True, "output": {"opened": "Contacts"}}
            else:
                return {
                    "success": False,
                    "error": "Contacts app only available on macOS",
                }
        except Exception as e:
            return {"success": False, "error": f"Failed to open Contacts: {str(e)}"}

    async def _make_facetime_call(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Initiate FaceTime call via AppleScript"""
        contact = params.get("contact") or params.get("phone") or params.get("email")

        if not contact:
            return {"success": False, "error": "No contact specified"}

        try:
            if self.platform == "darwin":
                # Use FaceTime URL scheme
                facetime_url = f"facetime://{contact}"
                subprocess.run(["open", facetime_url], capture_output=True)

                return {"success": True, "output": {"initiated_call": contact}}
            else:
                return {
                    "success": False,
                    "error": "FaceTime calling only available on macOS",
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to initiate FaceTime call: {str(e)}",
            }

    async def _app_automation(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute AppleScript automation in any app"""
        app_name = params.get("app_name")
        script = params.get("script")

        if not app_name or not script:
            return {"success": False, "error": "App name and script required"}

        try:
            if self.platform == "darwin":
                full_script = f'''
                tell application "{app_name}"
                    activate
                    {script}
                end tell
                '''
                result = subprocess.run(
                    ["osascript", "-e", full_script], capture_output=True, text=True
                )

                return {
                    "success": result.returncode == 0,
                    "output": {"result": result.stdout, "errors": result.stderr},
                }
            else:
                return {
                    "success": False,
                    "error": "AppleScript automation only available on macOS",
                }
        except Exception as e:
            return {"success": False, "error": f"App automation failed: {str(e)}"}

    async def _type_text(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Type text system-wide using AppleScript"""
        text = params.get("text", "")

        if not text:
            return {"success": False, "error": "No text specified"}

        try:
            if self.platform == "darwin":
                # Use AppleScript to type text
                script = f'''
                tell application "System Events"
                    keystroke "{text}"
                end tell
                '''
                subprocess.run(["osascript", "-e", script], capture_output=True)

                return {"success": True, "output": {"typed": text}}
            else:
                return {
                    "success": False,
                    "error": "System-wide typing only available on macOS",
                }
        except Exception as e:
            return {"success": False, "error": f"Typing failed: {str(e)}"}

    async def _press_keys(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Press keyboard keys system-wide"""
        keys = params.get("keys", [])

        if not keys:
            return {"success": False, "error": "No keys specified"}

        try:
            if self.platform == "darwin":
                # Convert key names to AppleScript key constants
                key_map = {
                    "return": "return",
                    "enter": "return",
                    "tab": "tab",
                    "space": "space",
                    "escape": "escape",
                    "esc": "escape",
                    "delete": "delete",
                    "backspace": "delete",
                    "up": "key code 126",
                    "down": "key code 125",
                    "left": "key code 123",
                    "right": "key code 124",
                    "command": "command down",
                    "cmd": "command down",
                    "shift": "shift down",
                    "option": "option down",
                    "control": "control down",
                    "ctrl": "control down",
                }

                keystrokes = []
                for key in keys:
                    if key.lower() in key_map:
                        keystrokes.append(key_map[key.lower()])
                    else:
                        keystrokes.append(f'keystroke "{key}"')

                script_lines = "\n    ".join(keystrokes)
                script = (
                    f'tell application "System Events"\n    {script_lines}\nend tell'
                )
                subprocess.run(["osascript", "-e", script], capture_output=True)

                return {"success": True, "output": {"keys_pressed": keys}}
            else:
                return {
                    "success": False,
                    "error": "System-wide key presses only available on macOS",
                }
        except Exception as e:
            return {"success": False, "error": f"Key press failed: {str(e)}"}
