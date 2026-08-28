"""
Agent Orchestrator - Coordinates all agents
"""

import asyncio
import logging
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from agents.commander import CommanderAgent
from agents.planner import PlannerAgent
from agents.observer import ObserverAgent
from agents.memory import MemoryAgent
from agents.reflection import ReflectionAgent
from agents.executor.file_agent import FileAgent
from agents.executor.browser_agent import BrowserAgent
from agents.executor.system_agent import SystemAgent
from agents.executor.comm_agent import CommunicationAgent
from core.execution_engine import ExecutionEngine
from models.schemas import (
    UserCommand, AgentResponse, ExecutionPlan, 
    AgentUpdate, AgentStatus
)
from ai_client import get_ai_client

logger = logging.getLogger(__name__)


class AgentOrchestrator:
    """
    Central orchestrator for all agents.
    Manages the flow: Command -> Intent -> Plan -> Execute -> Observe -> Learn
    """
    
    def __init__(
        self,
        execution_engine: ExecutionEngine,
        sqlite_store: Any,
        vector_store: Any
    ):
        self.execution_engine = execution_engine
        self.sqlite_store = sqlite_store
        self.vector_store = vector_store
        
        # Initialize all agents
        self.agents: Dict[str, Any] = {}
        self.active_plans: Dict[str, ExecutionPlan] = {}
        
        # Event queue for agent communication
        self.event_queue: asyncio.Queue = asyncio.Queue()
        
    async def initialize(self):
        """Initialize all agents"""
        logger.info("Initializing agents...")
        
        # Core agents
        self.agents['commander'] = CommanderAgent(
            event_queue=self.event_queue,
            sqlite_store=self.sqlite_store
        )
        self.agents['planner'] = PlannerAgent(
            event_queue=self.event_queue,
            vector_store=self.vector_store
        )
        self.agents['observer'] = ObserverAgent(
            event_queue=self.event_queue
        )
        self.agents['memory'] = MemoryAgent(
            sqlite_store=self.sqlite_store,
            vector_store=self.vector_store
        )
        self.agents['reflection'] = ReflectionAgent(
            sqlite_store=self.sqlite_store
        )
        
        # Executor agents
        self.agents['file'] = FileAgent(
            execution_engine=self.execution_engine
        )
        self.agents['browser'] = BrowserAgent(
            execution_engine=self.execution_engine
        )
        self.agents['system'] = SystemAgent(
            execution_engine=self.execution_engine
        )
        self.agents['communication'] = CommunicationAgent(
            execution_engine=self.execution_engine
        )
        
        # Initialize each agent
        for name, agent in self.agents.items():
            if hasattr(agent, 'initialize'):
                await agent.initialize()
                logger.info(f"Agent {name} initialized")
        
        # Start event processor
        asyncio.create_task(self._process_events())
        
        logger.info("All agents initialized")
    
    async def shutdown(self):
        """Shutdown all agents"""
        logger.info("Shutting down agents...")
        for name, agent in self.agents.items():
            if hasattr(agent, 'shutdown'):
                await agent.shutdown()
        logger.info("All agents shutdown")
    
    async def _process_events(self):
        """Process events from the event queue"""
        while True:
            try:
                event = await self.event_queue.get()
                await self._handle_event(event)
            except Exception as e:
                logger.error(f"Error processing event: {e}")
                await asyncio.sleep(0.1)
    
    async def _handle_event(self, event: Dict[str, Any]):
        """Handle events from agents"""
        event_type = event.get('type')
        
        if event_type == 'agent_update':
            # Forward agent updates to connected clients
            pass  # Handled via API endpoint
            
        elif event_type == 'plan_created':
            plan = event.get('plan')
            if plan:
                self.active_plans[plan.id] = plan
                
        elif event_type == 'step_complete':
            plan_id = event.get('plan_id')
            step_id = event.get('step_id')
            result = event.get('result')
            
            if plan_id in self.active_plans:
                plan = self.active_plans[plan_id]
                for step in plan.steps:
                    if step.id == step_id:
                        step.status = 'complete'
                        step.output = str(result) if result else None
                        step.completed_at = datetime.now(timezone.utc)
                        break
                        
        elif event_type == 'screenshot_request':
            # Request screenshot from desktop
            pass  # Handled via WebSocket
            
        elif event_type == 'memory_store':
            # Store in memory
            await self.agents['memory'].store(
                event.get('content'),
                event.get('type', 'episodic'),
                event.get('metadata', {})
            )
    
    async def process_command(
        self, 
        command: str, 
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Main entry point for processing user commands.
        
        Flow:
        1. Commander - Understand intent
        2. Memory - Retrieve relevant context
        3. Planner - Create execution plan
        4. Execution Engine - Execute plan
        5. Observer - Monitor execution
        6. Reflection - Learn from execution
        """
        logger.info(f"Processing command: {command[:50]}...")
        
        # Step 1: Commander - Parse intent
        await self._broadcast_update(
            'commander', AgentStatus.WORKING, "Analyzing intent..."
        )
        
        intent = await self.agents['commander'].classify_intent(command)
        logger.info(f"Intent classified: {intent.intent} (confidence: {intent.confidence})")
        
        await self._broadcast_update(
            'commander', AgentStatus.COMPLETE, 
            f"Intent: {intent.intent}"
        )
        
        # Handle general queries directly via AI (no execution needed)
        if intent.intent == 'general_query':
            await self._broadcast_update(
                'executor', AgentStatus.WORKING, "Consulting neural networks..."
            )
            
            try:
                client = await get_ai_client()
                messages = [
                    {"role": "system", "content": "You are J.A.R.V.I.S., a helpful AI assistant. Answer the user's question concisely and accurately."},
                    {"role": "user", "content": command}
                ]
                ai_response = await client.chat_completion(messages, temperature=0.7, max_tokens=500)
                
                await self._broadcast_update(
                    'executor', AgentStatus.COMPLETE, "Response generated"
                )
                
                return {
                    'response': ai_response,
                    'plan_id': None,
                    'execution_plan': None,
                    'intent': intent.dict()
                }
            except Exception as e:
                logger.error(f"General query failed: {e}")
                error_msg = str(e)
                if "API KEY INVALID" in error_msg:
                    return {
                        'response': "⚠️ API KEY INVALID: Your NVIDIA API key is invalid or expired.\n\nPlease get a new key at:\nhttps://build.nvidia.com/meta/llama-4-scout-17b-16e-instruct",
                        'plan_id': None,
                        'execution_plan': None,
                        'intent': intent.dict()
                    }
                return {
                    'response': f"⚠️ Error: {error_msg}",
                    'plan_id': None,
                    'execution_plan': None,
                    'intent': intent.dict()
                }
        
        # Step 2: Memory - Get relevant context
        await self._broadcast_update(
            'memory', AgentStatus.WORKING, "Retrieving context..."
        )
        
        relevant_memories = await self.agents['memory'].retrieve_relevant(command)
        
        await self._broadcast_update(
            'memory', AgentStatus.COMPLETE, 
            f"Retrieved {len(relevant_memories)} memories"
        )
        
        # Step 3: Planner - Create execution plan
        await self._broadcast_update(
            'planner', AgentStatus.WORKING, "Creating execution plan..."
        )
        
        execution_plan = await self.agents['planner'].create_plan(
            goal=command,
            intent=intent,
            context=relevant_memories
        )
        
        plan_id = str(uuid.uuid4())
        execution_plan.id = plan_id
        self.active_plans[plan_id] = execution_plan
        
        await self._broadcast_update(
            'planner', AgentStatus.COMPLETE, 
            f"Plan created: {len(execution_plan.steps)} steps"
        )
        
        # Step 4: Execute the plan
        await self._broadcast_update(
            'executor', AgentStatus.WORKING, "Executing plan..."
        )
        
        execution_result = await self.execution_engine.execute_plan(
            execution_plan,
            agent_callbacks=self._get_agent_callbacks()
        )
        
        # Step 5: Store in memory
        await self.agents['memory'].store_episode(
            command=command,
            plan=execution_plan,
            result=execution_result
        )
        
        # Step 6: Reflection (async, don't wait)
        asyncio.create_task(self.agents['reflection'].review_execution(
            plan=execution_plan,
            result=execution_result
        ))
        
        # Generate response
        response = await self._generate_response(
            command, intent, execution_plan, execution_result
        )
        
        return {
            'response': response,
            'plan_id': plan_id,
            'execution_plan': execution_plan.dict() if execution_plan else None,
            'intent': intent.dict()
        }
    
    async def _broadcast_update(
        self, 
        agent: str, 
        status: AgentStatus, 
        message: str
    ):
        """Broadcast agent status update"""
        update = AgentUpdate(
            agent=agent,
            status=status,
            message=message
        )
        await self.event_queue.put({
            'type': 'agent_update',
            'data': update.dict()
        })
    
    def _get_agent_callbacks(self) -> Dict[str, Any]:
        """Get callbacks for executor agents"""
        return {
            'file': self.agents['file'].execute,
            'browser': self.agents['browser'].execute,
            'system': self.agents['system'].execute,
            'communication': self.agents['communication'].execute,
        }
    
    async def _generate_response(
        self,
        command: str,
        intent: Any,
        plan: ExecutionPlan,
        result: Any
    ) -> str:
        """Generate human-friendly response using AI"""
        try:
            client = await get_ai_client()
            
            # Build result summary
            completed = sum(1 for s in plan.steps if s.status == 'complete')
            total = len(plan.steps)
            
            result_summary = {
                'success': result.get('success'),
                'completed_steps': completed,
                'total_steps': total,
                'intent': intent.intent if hasattr(intent, 'intent') else 'unknown',
                'error': result.get('error') if not result.get('success') else None
            }
            
            response = await client.generate_response(command, result_summary)
            return response
            
        except Exception as e:
            logger.error(f"AI response generation failed: {e}, using fallback")
            # Fallback response
            if result.get('success'):
                completed = sum(1 for s in plan.steps if s.status == 'complete')
                total = len(plan.steps)
                
                if total == 1:
                    return f"Done! I've completed the task: {plan.steps[0].action}"
                else:
                    return f"Done! I've completed {completed}/{total} steps of your request."
            else:
                error = result.get('error', 'Unknown error')
                return f"I encountered an issue: {error}. Would you like me to try a different approach?"
    
    async def handle_screenshot(self, request_id: str, image_base64: str):
        """Handle screenshot from observer"""
        await self.agents['observer'].process_screenshot(request_id, image_base64)
