"""
Browser Agent - Browser automation using Playwright
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from playwright.async_api import async_playwright, Page, Browser

logger = logging.getLogger(__name__)


class BrowserAgent:
    """
    Browser Agent: Automates browser interactions.
    
    Uses Playwright for reliable browser automation.
    """
    
    def __init__(self, execution_engine: Any):
        self.execution_engine = execution_engine
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.playwright = None
    
    async def _ensure_browser(self):
        """Ensure browser is initialized"""
        if self.browser is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=False)
            self.page = await self.browser.new_page()
            logger.info("Browser initialized")
    
    async def execute(
        self,
        action: str,
        params: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a browser operation.
        
        Args:
            action: The action to perform
            params: Action parameters
            context: Execution context
            
        Returns:
            Execution result
        """
        try:
            # Ensure browser is ready
            await self._ensure_browser()
            
            if action == 'navigate' or action == 'navigate_to_url':
                return await self._navigate(params)
            elif action == 'search' or action == 'perform_search':
                return await self._search(params)
            elif action == 'extract_text' or action == 'extract_results':
                return await self._extract_text(params)
            elif action == 'screenshot':
                return await self._screenshot(params)
            elif action == 'fill_form':
                return await self._fill_form(params)
            elif action == 'click':
                return await self._click(params)
            elif action == 'type':
                return await self._type(params)
            elif action == 'press_key':
                return await self._press_key(params)
            elif action == 'hover':
                return await self._hover(params)
            elif action == 'scroll':
                return await self._scroll(params)
            elif action == 'get_element_text':
                return await self._get_element_text(params)
            elif action == 'wait_for_selector':
                return await self._wait_for_selector(params)
            elif action == 'play_youtube':
                return await self._play_youtube(params)
            elif action == 'pause_youtube':
                return await self._pause_youtube(params)
            elif action == 'play_youtube_video':
                return await self._play_youtube_video(params)
            elif action == 'search_youtube_smart':
                return await self._search_youtube_smart(params)
            elif action == 'open_whatsapp_web':
                return await self._open_whatsapp_web(params)
            elif action == 'send_whatsapp_message':
                return await self._send_whatsapp_message(params)
            elif action == 'wait_for_load':
                return await self._wait_for_load(params)
            elif action == 'open_browser':
                await self._ensure_browser()
                return {'success': True, 'output': 'Browser opened'}
            elif action == 'close_browser':
                return await self._close_browser(params)
            else:
                return {
                    'success': False,
                    'error': f'Unknown browser action: {action}'
                }
        except Exception as e:
            logger.error(f"Browser operation error ({action}): {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _navigate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Navigate to URL"""
        url = params.get('url')
        
        if not url:
            return {'success': False, 'error': 'No URL specified'}
        
        # Ensure URL has protocol
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        await self.page.goto(url, wait_until='networkidle')
        
        return {
            'success': True,
            'output': {'url': url, 'title': await self.page.title()}
        }
    
    async def _search(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Perform web search"""
        query = params.get('query')
        engine = params.get('engine', 'google')
        
        if not query:
            return {'success': False, 'error': 'No query specified'}
        
        # Navigate to search engine
        search_urls = {
            'google': f'https://www.google.com/search?q={query.replace(" ", "+")}',
            'bing': f'https://www.bing.com/search?q={query.replace(" ", "+")}',
            'duckduckgo': f'https://duckduckgo.com/?q={query.replace(" ", "+")}'
        }
        
        url = search_urls.get(engine, search_urls['google'])
        await self.page.goto(url, wait_until='networkidle')
        
        return {
            'success': True,
            'output': {'query': query, 'engine': engine, 'url': url}
        }
    
    async def _extract_text(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Extract text from page"""
        selector = params.get('selector', 'body')
        
        try:
            element = await self.page.query_selector(selector)
            if element:
                text = await element.inner_text()
            else:
                text = await self.page.inner_text(selector)
            
            # Limit text length
            max_length = params.get('max_length', 5000)
            if len(text) > max_length:
                text = text[:max_length] + '...'
            
            return {
                'success': True,
                'output': {'text': text, 'selector': selector}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to extract text: {str(e)}'
            }
    
    async def _screenshot(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Take screenshot of page"""
        path = params.get('path', '/tmp/screenshot.png')
        full_page = params.get('full_page', True)
        
        await self.page.screenshot(path=path, full_page=full_page)
        
        return {
            'success': True,
            'output': {'path': path, 'full_page': full_page}
        }
    
    async def _fill_form(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Fill form fields"""
        fields = params.get('fields', {})
        
        for selector, value in fields.items():
            await self.page.fill(selector, value)
        
        return {
            'success': True,
            'output': {'filled_fields': list(fields.keys())}
        }
    
    async def _click(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Click element"""
        selector = params.get('selector')
        
        if not selector:
            return {'success': False, 'error': 'No selector specified'}
        
        await self.page.click(selector)
        
        return {
            'success': True,
            'output': {'clicked': selector}
        }
    
    async def _wait_for_load(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Wait for page to load"""
        timeout = params.get('timeout', 5000)
        
        await self.page.wait_for_load_state('networkidle', timeout=timeout)
        
        return {
            'success': True,
            'output': {'loaded': True}
        }
    
    async def _type(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Type text into an element"""
        selector = params.get('selector')
        text = params.get('text', '')
        clear_first = params.get('clear', True)
        
        if not selector:
            return {'success': False, 'error': 'No selector specified'}
        
        try:
            if clear_first:
                await self.page.fill(selector, text)
            else:
                await self.page.type(selector, text)
            
            return {
                'success': True,
                'output': {'typed': text, 'selector': selector}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to type: {str(e)}'
            }
    
    async def _press_key(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Press a keyboard key"""
        key = params.get('key')
        selector = params.get('selector')
        
        if not key:
            return {'success': False, 'error': 'No key specified'}
        
        try:
            if selector:
                await self.page.press(selector, key)
            else:
                await self.page.keyboard.press(key)
            
            return {
                'success': True,
                'output': {'key_pressed': key}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to press key: {str(e)}'
            }
    
    async def _hover(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Hover over an element"""
        selector = params.get('selector')
        
        if not selector:
            return {'success': False, 'error': 'No selector specified'}
        
        try:
            await self.page.hover(selector)
            return {
                'success': True,
                'output': {'hovered': selector}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to hover: {str(e)}'
            }
    
    async def _scroll(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Scroll the page"""
        direction = params.get('direction', 'down')
        amount = params.get('amount', 500)
        
        try:
            if direction == 'down':
                await self.page.mouse.wheel(0, amount)
            elif direction == 'up':
                await self.page.mouse.wheel(0, -amount)
            elif direction == 'right':
                await self.page.mouse.wheel(amount, 0)
            elif direction == 'left':
                await self.page.mouse.wheel(-amount, 0)
            
            return {
                'success': True,
                'output': {'scrolled': direction, 'amount': amount}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to scroll: {str(e)}'
            }
    
    async def _get_element_text(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get text content of an element"""
        selector = params.get('selector')
        
        if not selector:
            return {'success': False, 'error': 'No selector specified'}
        
        try:
            element = await self.page.query_selector(selector)
            if element:
                text = await element.inner_text()
                return {
                    'success': True,
                    'output': {'text': text, 'selector': selector}
                }
            else:
                return {
                    'success': False,
                    'error': f'Element not found: {selector}'
                }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to get text: {str(e)}'
            }
    
    async def _wait_for_selector(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Wait for an element to appear"""
        selector = params.get('selector')
        timeout = params.get('timeout', 5000)
        
        if not selector:
            return {'success': False, 'error': 'No selector specified'}
        
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            return {
                'success': True,
                'output': {'selector_found': selector}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Timeout waiting for: {selector}'
            }
    
    async def _play_youtube(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Play YouTube video using multiple methods"""
        try:
            # Try multiple selectors for play button
            play_selectors = [
                'button[data-testid="play-button"]',
                '.ytp-play-button',
                '[aria-label="Play"]',
                '[title="Play"]',
                'button.ytp-button:has(svg)',
                '.ytp-cued-thumbnail-overlay'
            ]
            
            for selector in play_selectors:
                try:
                    element = await self.page.query_selector(selector)
                    if element:
                        await element.click()
                        return {
                            'success': True,
                            'output': {'action': 'play', 'method': selector}
                        }
                except:
                    continue
            
            # Fallback: try using keyboard shortcut
            await self.page.keyboard.press('Space')
            return {
                'success': True,
                'output': {'action': 'play', 'method': 'space_key'}
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to play YouTube: {str(e)}'
            }
    
    async def _pause_youtube(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Pause YouTube video"""
        try:
            await self.page.keyboard.press('Space')
            return {
                'success': True,
                'output': {'action': 'pause', 'method': 'space_key'}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to pause YouTube: {str(e)}'
            }

    async def _open_whatsapp_web(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Open WhatsApp Web"""
        try:
            await self.page.goto('https://web.whatsapp.com', wait_until='networkidle')
            
            # Wait for QR code scan or chat list to appear
            try:
                await self.page.wait_for_selector('[data-testid="chat-list"]', timeout=30000)
                logged_in = True
            except:
                logged_in = False
            
            return {
                'success': True,
                'output': {
                    'opened': True,
                    'logged_in': logged_in,
                    'note': 'Scan QR code if not logged in'
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to open WhatsApp Web: {str(e)}'
            }
    
    async def _send_whatsapp_message(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send WhatsApp message to a contact"""
        contact_name = params.get('contact')
        message = params.get('message')
        
        if not contact_name or not message:
            return {'success': False, 'error': 'Contact name and message required'}
        
        try:
            # Ensure WhatsApp is open
            if not self.page or 'web.whatsapp.com' not in self.page.url:
                await self._open_whatsapp_web({})
                await asyncio.sleep(3)  # Wait for load
            
            # Click on search box
            search_selectors = [
                '[data-testid="chat-list-search"]',
                '[title="Search input textbox"]',
                'div[contenteditable="true"]',
                '[data-icon="search"]'
            ]
            
            search_clicked = False
            for selector in search_selectors:
                try:
                    await self.page.click(selector, timeout=2000)
                    search_clicked = True
                    break
                except:
                    continue
            
            if not search_clicked:
                # Try pressing Ctrl+K for search shortcut
                await self.page.keyboard.press('Control+k')
                await asyncio.sleep(0.5)
            
            # Type contact name
            await self.page.keyboard.type(contact_name, delay=50)
            await asyncio.sleep(1.5)  # Wait for results
            
            # Click on first matching contact
            contact_selectors = [
                '[data-testid="chat-list"] div[role="listitem"]',
                '[data-testid="cell-frame-container"]',
                'span[title*="' + contact_name + '"]'
            ]
            
            contact_clicked = False
            for selector in contact_selectors:
                try:
                    elements = await self.page.query_selector_all(selector)
                    if elements:
                        await elements[0].click()
                        contact_clicked = True
                        break
                except:
                    continue
            
            if not contact_clicked:
                return {'success': False, 'error': f'Could not find contact: {contact_name}'}
            
            await asyncio.sleep(1)  # Wait for chat to open
            
            # Find message input box
            input_selectors = [
                '[data-testid="conversation-compose-box-input"]',
                '[data-testid="text-input"]',
                'div[contenteditable="true"][data-tab="10"]',
                '[title="Type a message"]'
            ]
            
            input_found = False
            for selector in input_selectors:
                try:
                    await self.page.click(selector, timeout=2000)
                    input_found = True
                    break
                except:
                    continue
            
            if not input_found:
                return {'success': False, 'error': 'Could not find message input box'}
            
            # Type the message
            await self.page.keyboard.type(message, delay=30)
            await asyncio.sleep(0.5)
            
            # Send message (press Enter)
            await self.page.keyboard.press('Enter')
            
            return {
                'success': True,
                'output': {
                    'contact': contact_name,
                    'message_sent': message,
                    'status': 'sent'
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to send WhatsApp message: {str(e)}'
            }
    
    async def _search_youtube_smart(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Smart YouTube search with criteria (captions, trending, best title)"""
        query = params.get('query')
        criteria = params.get('criteria', {})  # {captions: true, trending: true, best_title: true}
        max_results = params.get('max_results', 5)
        
        if not query:
            return {'success': False, 'error': 'No search query specified'}
        
        try:
            # Build search URL with parameters
            search_url = f'https://www.youtube.com/results?search_query={query.replace(" ", "+")}'
            
            # Add filters if specified
            filters = []
            if criteria.get('captions'):
                filters.append('search_filter=1')  # CC filter
            if criteria.get('hd'):
                filters.append('search_filter=2')  # HD filter
            if criteria.get('today'):
                filters.append('sp=CAI%253D')  # Upload date filter
            if criteria.get('this_week'):
                filters.append('sp=CAw%253D')  # This week
            if criteria.get('this_month'):
                filters.append('sp=CAY%253D')  # This month
            if criteria.get('this_year'):
                filters.append('sp=CAg%253D')  # This year
            
            if filters:
                search_url += '&' + '&'.join(filters)
            
            await self.page.goto(search_url, wait_until='networkidle')
            await asyncio.sleep(2)  # Wait for results to load
            
            # Extract video results
            video_data = await self.page.evaluate(f'''
                () => {{
                    const videos = [];
                    const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer');
                    
                    videoElements.forEach((el, index) => {{
                        if (index >= {max_results}) return;
                        
                        const titleEl = el.querySelector('#video-title, .title a, h3 a');
                        const channelEl = el.querySelector('#channel-name a, .channel-name, .ytd-channel-name a');
                        const viewsEl = el.querySelector('#metadata-line span, .view-count, .metadata-line');
                        const descEl = el.querySelector('#description-text, .description, #dismissible > div > div.metadata-snippet-container');
                        const thumbnailEl = el.querySelector('img, yt-img-shadow img');
                        const linkEl = el.querySelector('#video-title-link, a#video-title, a[href*="/watch"]');
                        
                        const hasCaptions = el.querySelector('[aria-label*="Captions"], [aria-label*="subtitles"], .badge[aria-label*="CC"]') !== null;
                        
                        if (titleEl && linkEl) {{
                            videos.push({{
                                title: titleEl.textContent?.trim() || '',
                                channel: channelEl?.textContent?.trim() || 'Unknown',
                                views: viewsEl?.textContent?.trim() || '',
                                description: descEl?.textContent?.trim() || '',
                                thumbnail: thumbnailEl?.src || '',
                                url: linkEl.href || '',
                                has_captions: hasCaptions,
                                video_id: linkEl.href?.match(/v=([^&]+)/)?.[1] || ''
                            }});
                        }}
                    }});
                    
                    return videos;
                }}
            ''')
            
            # Sort by criteria if specified
            if criteria.get('best_title'):
                # Simple heuristic: prefer titles that closely match query
                query_words = query.lower().split()
                video_data.sort(key=lambda v: sum(1 for word in query_words if word in v['title'].lower()), reverse=True)
            
            if criteria.get('trending'):
                # Sort by view count (extract numbers)
                def extract_views(view_str):
                    try:
                        num = view_str.lower().replace('views', '').strip()
                        if 'm' in num:
                            return float(num.replace('m', '')) * 1000000
                        elif 'k' in num:
                            return float(num.replace('k', '')) * 1000
                        else:
                            return float(num.replace(',', ''))
                    except:
                        return 0
                
                video_data.sort(key=lambda v: extract_views(v.get('views', '')), reverse=True)
            
            # Filter for captions if required
            if criteria.get('captions_required'):
                video_data = [v for v in video_data if v.get('has_captions')]
            
            return {
                'success': True,
                'output': {
                    'query': query,
                    'criteria': criteria,
                    'videos': video_data[:max_results],
                    'count': len(video_data[:max_results])
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to search YouTube: {str(e)}'
            }
    
    async def _play_youtube_video(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Play a specific YouTube video by URL or search and play first result"""
        video_url = params.get('url')
        search_query = params.get('query')
        
        try:
            if video_url:
                # Direct URL provided
                if not video_url.startswith('http'):
                    video_url = f'https://www.youtube.com/watch?v={video_url}'
                await self.page.goto(video_url, wait_until='networkidle')
            elif search_query:
                # Search and play first result
                result = await self._search_youtube_smart({
                    'query': search_query,
                    'criteria': params.get('criteria', {}),
                    'max_results': 1
                })
                
                if result['success'] and result['output']['videos']:
                    video = result['output']['videos'][0]
                    await self.page.goto(video['url'], wait_until='networkidle')
                else:
                    return {'success': False, 'error': 'No videos found'}
            else:
                return {'success': False, 'error': 'Need url or query parameter'}
            
            await asyncio.sleep(3)  # Wait for player to load
            
            # Try to play (click video or press space)
            try:
                await self.page.click('.html5-video-player', timeout=5000)
            except:
                pass
            
            await self._play_youtube({})
            
            # Handle captions if requested
            if params.get('enable_captions'):
                try:
                    # Click CC button
                    cc_selectors = [
                        '[aria-label="Subtitles/closed captions"]',
                        '.ytp-subtitles-button',
                        '[title="Subtitles/closed captions (c)"]'
                    ]
                    for selector in cc_selectors:
                        try:
                            await self.page.click(selector, timeout=2000)
                            break
                        except:
                            continue
                except:
                    pass
            
            return {
                'success': True,
                'output': {
                    'playing': True,
                    'url': self.page.url,
                    'title': await self.page.title()
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to play YouTube video: {str(e)}'
            }
    
    async def _close_browser(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Close the browser environment"""
        try:
            await self.close()
            return {
                'success': True,
                'output': {'closed': True}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to close browser: {str(e)}'
            }
    
    async def close(self):
        """Close browser"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
