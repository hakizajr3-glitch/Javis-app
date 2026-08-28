"""
Planner Agent - Task decomposition and execution planning
"""

import logging
import uuid
from typing import Dict, Any, List

from models.schemas import (
    ExecutionPlan, ExecutionStep, IntentClassification, 
    StepStatus, PlanStatus, TaskDecomposition
)
from ai_client import get_ai_client

logger = logging.getLogger(__name__)


class PlannerAgent:
    """
    Planner Agent: Breaks down goals into executable steps.
    
    Responsibilities:
    - Decompose complex tasks into steps
    - Identify dependencies
    - Select appropriate agents
    - Estimate execution order
    """
    
    def __init__(self, event_queue: Any, vector_store: Any):
        self.event_queue = event_queue
        self.vector_store = vector_store
    
    async def create_plan(
        self,
        goal: str,
        intent: IntentClassification,
        context: List[Dict[str, Any]]
    ) -> ExecutionPlan:
        """
        Create an execution plan from a goal and intent.
        
        Args:
            goal: The high-level goal
            intent: Classified intent
            context: Relevant context from memory
            
        Returns:
            ExecutionPlan with steps
        """
        logger.info(f"Creating plan for goal: {goal[:50]}...")
        
        # Decompose into steps
        decomposition = await self._decompose_task(goal, intent)
        
        # Create execution steps
        steps = self._create_steps(decomposition, intent)
        
        # Determine dependencies
        steps = self._resolve_dependencies(steps)
        
        # Create plan
        plan = ExecutionPlan(
            id=str(uuid.uuid4()),
            goal=goal,
            steps=steps,
            status=PlanStatus.PLANNING,
            metadata={
                'intent': intent.intent,
                'confidence': intent.confidence,
                'complexity': intent.complexity,
                'context_count': len(context)
            }
        )
        
        logger.info(f"Plan created with {len(steps)} steps")
        return plan
    
    async def _decompose_task(
        self,
        goal: str,
        intent: IntentClassification
    ) -> TaskDecomposition:
        """Decompose a task into sub-tasks using AI for complex tasks"""
        
        # For high complexity tasks, use AI for intelligent decomposition
        if intent.complexity == 'high' or intent.intent == 'complex_workflow':
            try:
                client = await get_ai_client()
                steps_data = await client.create_plan(goal, [])
                if steps_data and len(steps_data) > 0:
                    return TaskDecomposition(
                        goal=goal,
                        steps=steps_data,
                        estimated_duration_seconds=len(steps_data) * 10
                    )
            except Exception as e:
                logger.error(f"AI decomposition failed: {e}, using rule-based fallback")
        
        steps_data = []
        
        if intent.intent == 'file_create':
            steps_data = [
                {'action': 'prepare_file_creation', 'agent': 'file'},
                {'action': 'create_file', 'agent': 'file'},
                {'action': 'verify_file', 'agent': 'file'}
            ]
            
        elif intent.intent == 'browser_search':
            steps_data = [
                {'action': 'open_browser', 'agent': 'browser'},
                {'action': 'perform_search', 'agent': 'browser'},
                {'action': 'extract_results', 'agent': 'browser'}
            ]
            
        elif intent.intent == 'browser_navigate':
            steps_data = [
                {'action': 'open_browser', 'agent': 'browser'},
                {'action': 'navigate_to_url', 'agent': 'browser'},
                {'action': 'wait_for_load', 'agent': 'browser'}
            ]
            
        elif intent.intent == 'system_launch':
            steps_data = [
                {'action': 'identify_application', 'agent': 'system'},
                {'action': 'launch_application', 'agent': 'system'},
                {'action': 'verify_launch', 'agent': 'observer'}
            ]
            
        elif intent.intent == 'file_organize':
            steps_data = [
                {'action': 'analyze_folder', 'agent': 'file'},
                {'action': 'create_organization_structure', 'agent': 'file'},
                {'action': 'move_files', 'agent': 'file'},
                {'action': 'verify_organization', 'agent': 'file'}
            ]
            
        elif intent.intent == 'complex_workflow' or intent.complexity == 'high':
            # For complex tasks, create a research and execution workflow
            steps_data = [
                {'action': 'analyze_requirements', 'agent': 'commander'},
                {'action': 'research_online', 'agent': 'browser'},
                {'action': 'gather_information', 'agent': 'browser'},
                {'action': 'create_deliverable', 'agent': 'file'},
                {'action': 'verify_completion', 'agent': 'observer'}
            ]
            
        else:
            # Default: simple single-step execution
            agent_map = {
                'file_read': 'file',
                'file_edit': 'file',
                'file_delete': 'file',
                'browser_extract': 'browser',
                'system_info': 'system',
                'communication': 'communication'
            }
            
            agent = agent_map.get(intent.intent, 'system')
            steps_data = [
                {'action': intent.intent, 'agent': agent}
            ]
        
        # Build TaskDecomposition
        return TaskDecomposition(
            goal=goal,
            steps=steps_data,
            estimated_duration_seconds=len(steps_data) * 5
        )
    
    def _create_steps(
        self,
        decomposition: TaskDecomposition,
        intent: IntentClassification
    ) -> List[ExecutionStep]:
        """Create ExecutionStep objects from decomposition"""
        steps = []
        
        for i, step_data in enumerate(decomposition.steps):
            step = ExecutionStep(
                id=f"step_{i}_{uuid.uuid4().hex[:8]}",
                agent=step_data['agent'],
                action=step_data['action'],
                params=self._infer_params(step_data, intent),
                status=StepStatus.PENDING,
                depends_on=[]
            )
            steps.append(step)
        
        return steps
    
    def _infer_params(
        self,
        step_data: Dict[str, Any],
        intent: IntentClassification
    ) -> Dict[str, Any]:
        """Infer parameters for a step based on intent entities"""
        params = {}
        
        # Map intent entities to step parameters
        if 'path' in intent.entities:
            params['path'] = intent.entities['path'][0] if isinstance(intent.entities['path'], list) else intent.entities['path']
        
        if 'url' in intent.entities:
            params['url'] = intent.entities['url']
        
        if 'search_query' in intent.entities:
            params['query'] = intent.entities['search_query']
        
        if 'app_candidate' in intent.entities:
            params['app_name'] = intent.entities['app_candidate']
        
        return params
    
    def _resolve_dependencies(
        self,
        steps: List[ExecutionStep]
    ) -> List[ExecutionStep]:
        """
        Resolve and set dependencies between steps.
        """
        # Simple sequential dependency for now
        # In production, this would use dependency graph analysis
        
        for i, step in enumerate(steps):
            if i > 0:
                # Previous step must complete
                step.depends_on = [steps[i-1].id]
        
        # Special handling for specific patterns
        for i, step in enumerate(steps):
            # Observer steps depend on execution steps
            if step.agent == 'observer' and i > 0:
                # Depend on the previous execution step
                execution_steps = [
                    s.id for s in steps[:i] 
                    if s.agent in ['file', 'browser', 'system']
                ]
                if execution_steps:
                    step.depends_on = [execution_steps[-1]]
        
        return steps
    
    def optimize_plan(self, plan: ExecutionPlan) -> ExecutionPlan:
        """
        Optimize an execution plan by identifying parallel steps.
        
        Args:
            plan: The plan to optimize
            
        Returns:
            Optimized plan
        """
        # Find steps that can run in parallel
        # For now, simple sequential execution
        # Production would analyze true dependencies
        
        return plan
