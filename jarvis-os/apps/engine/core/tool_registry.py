"""
Tool Registry - Dynamic tool discovery and selection
"""

import logging
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
import numpy as np

from models.schemas import ToolDefinition

logger = logging.getLogger(__name__)


@dataclass
class Tool:
    """Tool representation"""
    name: str
    description: str
    parameters: Dict[str, Any]
    required_params: List[str]
    handler: Callable
    category: str
    embedding: Optional[List[float]] = None


class ToolRegistry:
    """
    Registry for all available tools.
    Provides dynamic tool discovery and selection based on task similarity.
    """
    
    def __init__(self):
        self.tools: Dict[str, Tool] = {}
        self.categories: Dict[str, List[str]] = {}
        
    async def initialize(self):
        """Initialize with default tools"""
        logger.info("Initializing tool registry...")
        
        # File tools
        self.register(Tool(
            name="create_file",
            description="Create a new file with specified content",
            parameters={
                "path": {"type": "string", "description": "File path"},
                "content": {"type": "string", "description": "File content"}
            },
            required_params=["path"],
            handler=self._create_file_handler,
            category="file"
        ))
        
        self.register(Tool(
            name="read_file",
            description="Read contents of a file",
            parameters={
                "path": {"type": "string", "description": "File path"}
            },
            required_params=["path"],
            handler=self._read_file_handler,
            category="file"
        ))
        
        self.register(Tool(
            name="write_file",
            description="Write content to a file (overwrite)",
            parameters={
                "path": {"type": "string", "description": "File path"},
                "content": {"type": "string", "description": "Content to write"}
            },
            required_params=["path", "content"],
            handler=self._write_file_handler,
            category="file"
        ))
        
        self.register(Tool(
            name="mkdir",
            description="Create a directory",
            parameters={
                "path": {"type": "string", "description": "Directory path"}
            },
            required_params=["path"],
            handler=self._mkdir_handler,
            category="file"
        ))
        
        self.register(Tool(
            name="list_dir",
            description="List contents of a directory",
            parameters={
                "path": {"type": "string", "description": "Directory path"}
            },
            required_params=["path"],
            handler=self._list_dir_handler,
            category="file"
        ))
        
        # Browser tools
        self.register(Tool(
            name="navigate",
            description="Navigate to a URL in browser",
            parameters={
                "url": {"type": "string", "description": "URL to navigate to"}
            },
            required_params=["url"],
            handler=self._navigate_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="search",
            description="Search the web for information",
            parameters={
                "query": {"type": "string", "description": "Search query"},
                "engine": {"type": "string", "description": "Search engine", "default": "google"}
            },
            required_params=["query"],
            handler=self._search_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="extract_text",
            description="Extract text from current page",
            parameters={
                "selector": {"type": "string", "description": "CSS selector", "default": "body"}
            },
            required_params=[],
            handler=self._extract_text_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="screenshot",
            description="Take a screenshot of current page",
            parameters={},
            required_params=[],
            handler=self._screenshot_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="click",
            description="Click an element on the page using CSS selector",
            parameters={
                "selector": {"type": "string", "description": "CSS selector of element to click"}
            },
            required_params=["selector"],
            handler=self._click_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="type",
            description="Type text into an input field",
            parameters={
                "selector": {"type": "string", "description": "CSS selector of input field"},
                "text": {"type": "string", "description": "Text to type"},
                "clear": {"type": "boolean", "description": "Clear field first", "default": True}
            },
            required_params=["selector", "text"],
            handler=self._type_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="press_key",
            description="Press a keyboard key",
            parameters={
                "key": {"type": "string", "description": "Key to press (e.g., Enter, Tab, Escape)"},
                "selector": {"type": "string", "description": "Optional: CSS selector to focus first"}
            },
            required_params=["key"],
            handler=self._press_key_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="play_youtube",
            description="Play YouTube video on current page",
            parameters={},
            required_params=[],
            handler=self._play_youtube_handler,
            category="browser"
        ))
        
        self.register(Tool(
            name="pause_youtube",
            description="Pause YouTube video on current page",
            parameters={},
            required_params=[],
            handler=self._pause_youtube_handler,
            category="browser"
        ))
        
        # System tools
        self.register(Tool(
            name="launch_app",
            description="Launch an application",
            parameters={
                "app_name": {"type": "string", "description": "Application name or path"}
            },
            required_params=["app_name"],
            handler=self._launch_app_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="clipboard",
            description="Copy text to clipboard",
            parameters={
                "text": {"type": "string", "description": "Text to copy"},
                "operation": {"type": "string", "description": "copy or paste", "default": "copy"}
            },
            required_params=["text"],
            handler=self._clipboard_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="open_settings",
            description="Open macOS System Settings",
            parameters={
                "pane": {"type": "string", "description": "Optional: specific settings pane to open"}
            },
            required_params=[],
            handler=self._open_settings_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="open_facetime",
            description="Open FaceTime app",
            parameters={},
            required_params=[],
            handler=self._open_facetime_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="open_contacts",
            description="Open Contacts app",
            parameters={},
            required_params=[],
            handler=self._open_contacts_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="make_facetime_call",
            description="Start a FaceTime call",
            parameters={
                "contact": {"type": "string", "description": "Phone number or email to call"}
            },
            required_params=["contact"],
            handler=self._make_facetime_call_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="type_text",
            description="Type text system-wide",
            parameters={
                "text": {"type": "string", "description": "Text to type"}
            },
            required_params=["text"],
            handler=self._type_text_handler,
            category="system"
        ))
        
        self.register(Tool(
            name="press_keys",
            description="Press keyboard keys system-wide",
            parameters={
                "keys": {"type": "array", "description": "Array of keys to press"}
            },
            required_params=["keys"],
            handler=self._press_keys_handler,
            category="system"
        ))
        
        logger.info(f"Tool registry initialized with {len(self.tools)} tools")
    
    def register(self, tool: Tool):
        """Register a tool"""
        self.tools[tool.name] = tool
        
        # Add to category
        if tool.category not in self.categories:
            self.categories[tool.category] = []
        self.categories[tool.category].append(tool.name)
        
        logger.debug(f"Registered tool: {tool.name}")
    
    def get(self, name: str) -> Optional[Tool]:
        """Get a tool by name"""
        return self.tools.get(name)
    
    def list_tools(self, category: Optional[str] = None) -> List[str]:
        """List available tools"""
        if category:
            return self.categories.get(category, [])
        return list(self.tools.keys())
    
    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """Get tool definitions for LLM"""
        definitions = []
        for tool in self.tools.values():
            definitions.append({
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "required": tool.required_params
            })
        return definitions
    
    async def execute(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool"""
        tool = self.get(tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool not found: {tool_name}"
            }
        
        # Validate required params
        missing = [p for p in tool.required_params if p not in params]
        if missing:
            return {
                "success": False,
                "error": f"Missing required parameters: {missing}"
            }
        
        try:
            result = await tool.handler(params)
            return {
                "success": True,
                "output": result
            }
        except Exception as e:
            logger.error(f"Tool execution error ({tool_name}): {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    # Tool handlers (stubs - actual implementation would use real APIs)
    async def _create_file_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for create_file"""
        return {"status": "file_created", "path": params.get('path')}
    
    async def _read_file_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for read_file"""
        return {"status": "file_read", "path": params.get('path')}
    
    async def _write_file_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for write_file"""
        return {"status": "file_written", "path": params.get('path')}
    
    async def _mkdir_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for mkdir"""
        return {"status": "directory_created", "path": params.get('path')}
    
    async def _list_dir_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for list_dir"""
        return {"status": "directory_listed", "path": params.get('path'), "items": []}
    
    async def _navigate_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for navigate"""
        return {"status": "navigated", "url": params.get('url')}
    
    async def _search_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for search"""
        return {"status": "searched", "query": params.get('query'), "results": []}
    
    async def _extract_text_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for extract_text"""
        return {"status": "text_extracted", "selector": params.get('selector')}
    
    async def _screenshot_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for screenshot"""
        return {"status": "screenshot_taken"}
    
    async def _launch_app_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for launch_app"""
        return {"status": "app_launched", "app": params.get('app_name')}
    
    async def _clipboard_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for clipboard"""
        return {"status": "clipboard_updated", "operation": params.get('operation')}
    
    async def _click_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for click"""
        return {"status": "element_clicked", "selector": params.get('selector')}
    
    async def _type_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for type"""
        return {"status": "text_typed", "selector": params.get('selector'), "text": params.get('text')}
    
    async def _press_key_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for press_key"""
        return {"status": "key_pressed", "key": params.get('key')}
    
    async def _play_youtube_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for play_youtube"""
        return {"status": "youtube_playing"}
    
    async def _pause_youtube_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for pause_youtube"""
        return {"status": "youtube_paused"}
    
    async def _open_settings_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for open_settings"""
        return {"status": "settings_opened", "pane": params.get('pane')}
    
    async def _open_facetime_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for open_facetime"""
        return {"status": "facetime_opened"}
    
    async def _open_contacts_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for open_contacts"""
        return {"status": "contacts_opened"}
    
    async def _make_facetime_call_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for make_facetime_call"""
        return {"status": "facetime_call_initiated", "contact": params.get('contact')}
    
    async def _type_text_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for type_text"""
        return {"status": "text_typed_system_wide", "text": params.get('text')}
    
    async def _press_keys_handler(self, params: Dict[str, Any]) -> Any:
        """Handler for press_keys"""
        return {"status": "keys_pressed", "keys": params.get('keys')}
