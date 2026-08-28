"""
Observer Agent - Monitors execution and system state with GPT-4V vision
"""

import asyncio
import logging
import base64
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone

import openai

logger = logging.getLogger(__name__)

# Configure OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')


class ObserverAgent:
    """
    Observer Agent: Watches execution and detects changes.
    
    Responsibilities:
    - Monitor execution progress
    - Detect UI changes (via screenshots)
    - Identify errors and anomalies
    - Provide context for recovery
    
    This is the key differentiator that makes the system feel like JARVIS.
    """
    
    def __init__(self, event_queue: Any):
        self.event_queue = event_queue
        self.screenshot_requests: Dict[str, Dict[str, Any]] = {}
        self.last_screenshot: Optional[str] = None
        self.execution_log: list = []
    
    async def process_screenshot(
        self,
        request_id: str,
        image_base64: str,
        task_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a screenshot for analysis using GPT-4V.
        
        Args:
            request_id: The request ID for this screenshot
            image_base64: Base64-encoded image
            task_context: Optional context about what task is being performed
            
        Returns:
            Analysis results
        """
        logger.info(f"Processing screenshot for request {request_id}")
        
        # Store screenshot
        self.last_screenshot = image_base64
        
        # Analyze the screenshot with GPT-4V
        analysis = await self._analyze_screenshot(image_base64, task_context)
        
        # Update request status
        if request_id in self.screenshot_requests:
            self.screenshot_requests[request_id]['analysis'] = analysis
            self.screenshot_requests[request_id]['received_at'] = datetime.now(timezone.utc)
            self.screenshot_requests[request_id]['task_context'] = task_context
        
        # Check for issues
        if analysis.get('has_error'):
            logger.warning(f"Error detected in screenshot: {analysis.get('error_description')}")
            await self._handle_detected_error(analysis)
        
        if analysis.get('is_complete'):
            logger.info("Task completion detected")
            await self._handle_completion()
        
        return analysis
    
    async def _analyze_screenshot(
        self,
        image_base64: str,
        task_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze a screenshot using GPT-4V for visual understanding.
        
        Args:
            image_base64: Base64-encoded screenshot
            task_context: Optional context about what task is being performed
            
        Returns:
            Analysis results including detected state, errors, and completion status
        """
        try:
            # Prepare the prompt based on context
            if task_context:
                system_prompt = f"""You are analyzing a screenshot to monitor task execution. 
The current task is: {task_context}

Analyze the screenshot and respond with a JSON object containing:
- "has_error": boolean - Is there an error, crash, or problem visible?
- "error_description": string - Description of any error found
- "is_complete": boolean - Has the task completed successfully?
- "ui_state": string - Current state (loading, error, success, normal, etc.)
- "active_window": string - What application/window is active
- "detected_elements": array - Key UI elements visible (buttons, forms, etc.)
- "detected_text": array - Important text visible on screen
- "suggested_action": string - What should be done next
- "confidence": number - Your confidence in this analysis (0-1)

Be precise and factual. Only mark is_complete=true if you clearly see success indicators."""
            else:
                system_prompt = """Analyze this screenshot and respond with a JSON object containing:
- "has_error": boolean - Is there an error, crash, or problem visible?
- "error_description": string - Description of any error found
- "is_complete": boolean - Has a task completed successfully?
- "ui_state": string - Current state (loading, error, success, normal, etc.)
- "active_window": string - What application/window is active
- "detected_elements": array - Key UI elements visible (buttons, forms, etc.)
- "detected_text": array - Important text visible on screen
- "suggested_action": string - What action should be taken
- "confidence": number - Your confidence in this analysis (0-1)

Be precise and factual."""

            # Call GPT-4V API
            response = openai.chat.completions.create(
                model="gpt-4o",  # or "gpt-4-vision-preview" depending on availability
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Analyze this screenshot and provide the JSON response."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                response_format={"type": "json_object"}
            )
            
            # Parse the response
            import json
            analysis_text = response.choices[0].message.content
            analysis = json.loads(analysis_text)
            
            # Ensure all expected fields exist
            default_analysis = {
                'has_error': False,
                'error_description': None,
                'is_complete': False,
                'ui_state': 'normal',
                'active_window': 'Unknown',
                'detected_elements': [],
                'detected_text': [],
                'suggested_action': None,
                'confidence': 0.5
            }
            
            # Merge with defaults
            analysis = {**default_analysis, **analysis}
            
            logger.info(f"Screenshot analysis complete: {analysis.get('ui_state')} (confidence: {analysis.get('confidence')})")
            
            return analysis
            
        except Exception as e:
            logger.error(f"GPT-4V analysis failed: {e}")
            
            # Fallback to basic analysis
            return {
                'has_error': False,
                'error_description': None,
                'is_complete': False,
                'ui_state': 'unknown',
                'active_window': 'Unknown',
                'detected_elements': [],
                'detected_text': [],
                'suggested_action': None,
                'confidence': 0.0,
                'analysis_error': str(e)
            }
    
    async def monitor_execution(
        self,
        plan_id: str,
        check_interval: float = 2.0
    ):
        """
        Monitor execution of a plan.
        
        Args:
            plan_id: Plan to monitor
            check_interval: Seconds between checks
        """
        logger.info(f"Starting monitoring for plan {plan_id}")
        
        while True:
            # Request screenshot
            await self._request_screenshot(plan_id)
            
            # Wait
            await asyncio.sleep(check_interval)
            
            # Check if plan complete
            # In production, check plan status
            break  # For now, just do one iteration
    
    async def _request_screenshot(self, plan_id: str):
        """Request screenshot from desktop"""
        request_id = f"ss_{plan_id}_{datetime.now(timezone.utc).timestamp()}"
        
        self.screenshot_requests[request_id] = {
            'plan_id': plan_id,
            'requested_at': datetime.now(timezone.utc),
            'status': 'pending'
        }
        
        # Send request via event queue
        await self.event_queue.put({
            'type': 'screenshot_request',
            'request_id': request_id
        })
    
    async def _handle_detected_error(self, analysis: Dict[str, Any]):
        """Handle detected errors"""
        await self.event_queue.put({
            'type': 'execution_error_detected',
            'error': analysis.get('error_description'),
            'suggested_recovery': analysis.get('suggested_action')
        })
    
    async def _handle_completion(self):
        """Handle detected completion"""
        await self.event_queue.put({
            'type': 'execution_complete_detected'
        })
    
    def get_execution_status(self, plan_id: str) -> Dict[str, Any]:
        """Get current execution status"""
        # Get relevant screenshots for this plan
        relevant_requests = [
            req for req in self.screenshot_requests.values()
            if req.get('plan_id') == plan_id
        ]
        
        latest = relevant_requests[-1] if relevant_requests else None
        
        return {
            'plan_id': plan_id,
            'screenshot_count': len(relevant_requests),
            'latest_analysis': latest.get('analysis') if latest else None,
            'has_error_detected': any(
                req.get('analysis', {}).get('has_error')
                for req in relevant_requests
                if req.get('analysis')
            )
        }
