"""
Browser Environment Manager - Manages multiple isolated browser environments
"""

import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from playwright.async_api import async_playwright, BrowserContext, Page
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class BrowserEnvironment:
    """Represents an isolated browser environment"""
    id: str
    name: str
    context: BrowserContext
    page: Page
    created_at: datetime
    last_activity: datetime
    status: str = "active"  # active, paused, closed
    metadata: Dict[str, Any] = field(default_factory=dict)
    screenshot_stream_enabled: bool = False


class BrowserEnvironmentManager:
    """
    Manages multiple isolated browser environments.
    
    Allows JARVIS to:
    - Open multiple browser instances simultaneously
    - Each environment is isolated from others
    - Stream screenshots from any environment to frontend
    - Execute actions in specific environments
    """
    
    def __init__(self):
        self.environments: Dict[str, BrowserEnvironment] = {}
        self.playwright = None
        self._lock = asyncio.Lock()
        self._screenshot_tasks: Dict[str, asyncio.Task] = {}
    
    async def initialize(self):
        """Initialize the playwright instance"""
        if not self.playwright:
            self.playwright = await async_playwright().start()
            logger.info("Browser Environment Manager initialized")
    
    async def create_environment(
        self,
        name: Optional[str] = None,
        headless: bool = False,
        viewport: Optional[Dict[str, int]] = None,
        user_agent: Optional[str] = None
    ) -> str:
        """
        Create a new isolated browser environment.
        
        Args:
            name: Human-readable name for the environment
            headless: Whether to run in headless mode
            viewport: Viewport size {'width': 1920, 'height': 1080}
            user_agent: Custom user agent string
            
        Returns:
            environment_id: Unique ID for the created environment
        """
        await self.initialize()
        
        env_id = str(uuid.uuid4())[:8]
        
        # Create browser context with isolation
        context_params = {
            'viewport': viewport or {'width': 1920, 'height': 1080},
            'user_agent': user_agent,
            'accept_downloads': True,
        }
        
        # Remove None values
        context_params = {k: v for k, v in context_params.items() if v is not None}
        
        # Launch browser with context
        browser = await self.playwright.chromium.launch(headless=headless)
        context = await browser.new_context(**context_params)
        
        # Create initial page
        page = await context.new_page()
        
        # Store environment
        env = BrowserEnvironment(
            id=env_id,
            name=name or f"Environment-{env_id}",
            context=context,
            page=page,
            created_at=datetime.now(timezone.utc),
            last_activity=datetime.now(timezone.utc),
            status="active"
        )
        
        async with self._lock:
            self.environments[env_id] = env
        
        logger.info(f"Created browser environment: {env_id} ({env.name})")
        return env_id
    
    async def execute_in_environment(
        self,
        env_id: str,
        action: str,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute an action in a specific environment.
        
        Args:
            env_id: Environment ID
            action: Action to perform (navigate, click, type, etc.)
            params: Action parameters
            
        Returns:
            Result of the action
        """
        env = self.environments.get(env_id)
        if not env:
            return {'success': False, 'error': f'Environment {env_id} not found'}
        
        if env.status != "active":
            return {'success': False, 'error': f'Environment {env_id} is {env.status}'}
        
        try:
            result = await self._execute_action(env, action, params)
            env.last_activity = datetime.now(timezone.utc)
            return result
        except Exception as e:
            logger.error(f"Action execution error in {env_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    async def _execute_action(
        self,
        env: BrowserEnvironment,
        action: str,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Execute a specific action in an environment"""
        page = env.page
        
        if action == 'navigate':
            url = params.get('url')
            if not url:
                return {'success': False, 'error': 'No URL specified'}
            await page.goto(url, wait_until='networkidle')
            return {
                'success': True,
                'output': {'url': page.url, 'title': await page.title()}
            }
        
        elif action == 'click':
            selector = params.get('selector')
            if not selector:
                return {'success': False, 'error': 'No selector specified'}
            await page.click(selector)
            return {'success': True, 'output': {'clicked': selector}}
        
        elif action == 'type':
            selector = params.get('selector')
            text = params.get('text', '')
            if not selector:
                return {'success': False, 'error': 'No selector specified'}
            await page.fill(selector, text)
            return {'success': True, 'output': {'typed': text}}
        
        elif action == 'screenshot':
            screenshot = await page.screenshot(type='jpeg', quality=80, full_page=False)
            return {
                'success': True,
                'output': {
                    'screenshot_base64': screenshot.decode('latin1'),
                    'url': page.url
                }
            }
        
        elif action == 'scroll':
            direction = params.get('direction', 'down')
            amount = params.get('amount', 500)
            if direction == 'down':
                await page.mouse.wheel(0, amount)
            elif direction == 'up':
                await page.mouse.wheel(0, -amount)
            return {'success': True, 'output': {'scrolled': direction}}
        
        elif action == 'evaluate':
            script = params.get('script')
            if not script:
                return {'success': False, 'error': 'No script provided'}
            result = await page.evaluate(script)
            return {'success': True, 'output': {'result': result}}
        
        elif action == 'press':
            key = params.get('key')
            if not key:
                return {'success': False, 'error': 'No key specified'}
            await page.keyboard.press(key)
            return {'success': True, 'output': {'key_pressed': key}}
        
        else:
            return {'success': False, 'error': f'Unknown action: {action}'}
    
    async def start_screenshot_stream(
        self,
        env_id: str,
        callback: callable,
        interval: float = 1.0
    ):
        """
        Start streaming screenshots from an environment.
        
        Args:
            env_id: Environment to stream from
            callback: Function to call with each screenshot
            interval: Seconds between screenshots
        """
        env = self.environments.get(env_id)
        if not env:
            logger.error(f"Cannot start stream: Environment {env_id} not found")
            return
        
        env.screenshot_stream_enabled = True
        
        async def stream_loop():
            while env.screenshot_stream_enabled and env.status == "active":
                try:
                    screenshot = await env.page.screenshot(
                        type='jpeg',
                        quality=70,
                        full_page=False
                    )
                    await callback({
                        'env_id': env_id,
                        'screenshot': screenshot.decode('latin1'),
                        'url': env.page.url,
                        'timestamp': datetime.now(timezone.utc).isoformat()
                    })
                    await asyncio.sleep(interval)
                except Exception as e:
                    logger.error(f"Screenshot stream error for {env_id}: {e}")
                    await asyncio.sleep(interval)
        
        task = asyncio.create_task(stream_loop())
        self._screenshot_tasks[env_id] = task
        logger.info(f"Started screenshot stream for {env_id}")
    
    async def stop_screenshot_stream(self, env_id: str):
        """Stop streaming screenshots from an environment"""
        env = self.environments.get(env_id)
        if env:
            env.screenshot_stream_enabled = False
        
        task = self._screenshot_tasks.pop(env_id, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        logger.info(f"Stopped screenshot stream for {env_id}")
    
    async def close_environment(self, env_id: str) -> Dict[str, Any]:
        """Close a specific environment"""
        env = self.environments.get(env_id)
        if not env:
            return {'success': False, 'error': f'Environment {env_id} not found'}
        
        # Stop screenshot stream if active
        await self.stop_screenshot_stream(env_id)
        
        # Close context (this closes all pages in the context)
        try:
            await env.context.close()
        except Exception as e:
            logger.error(f"Error closing context {env_id}: {e}")
        
        env.status = "closed"
        
        async with self._lock:
            del self.environments[env_id]
        
        logger.info(f"Closed browser environment: {env_id}")
        return {'success': True, 'output': {'closed': env_id}}
    
    async def close_all(self):
        """Close all environments"""
        env_ids = list(self.environments.keys())
        for env_id in env_ids:
            await self.close_environment(env_id)
        
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None
        
        logger.info("All browser environments closed")
    
    def get_environment(self, env_id: str) -> Optional[BrowserEnvironment]:
        """Get environment by ID"""
        return self.environments.get(env_id)
    
    def get_all_environments(self) -> List[Dict[str, Any]]:
        """Get list of all environments (summary)"""
        return [
            {
                'id': env.id,
                'name': env.name,
                'status': env.status,
                'created_at': env.created_at.isoformat(),
                'last_activity': env.last_activity.isoformat(),
                'streaming': env.screenshot_stream_enabled,
                'url': env.page.url if env.status == "active" else None
            }
            for env in self.environments.values()
        ]
    
    async def open_new_tab(self, env_id: str, url: Optional[str] = None) -> Dict[str, Any]:
        """Open a new tab in an environment"""
        env = self.environments.get(env_id)
        if not env:
            return {'success': False, 'error': f'Environment {env_id} not found'}
        
        try:
            new_page = await env.context.new_page()
            if url:
                await new_page.goto(url, wait_until='networkidle')
            
            # Update the environment's main page to the new tab
            env.page = new_page
            
            return {
                'success': True,
                'output': {
                    'new_tab_opened': True,
                    'url': new_page.url
                }
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


# Global singleton instance
browser_manager = BrowserEnvironmentManager()
