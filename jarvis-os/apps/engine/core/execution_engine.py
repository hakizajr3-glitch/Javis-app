"""
Execution Engine - Executes plans with parallel step processing
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

from models.schemas import ExecutionPlan, ExecutionStep, StepStatus, PlanStatus

logger = logging.getLogger(__name__)


class ExecutionEngine:
    """
    Executes execution plans with:
    - Parallel step execution (respecting dependencies)
    - State tracking
    - Error handling and recovery
    - Progress reporting
    """
    
    def __init__(self, tool_registry: Any):
        self.tool_registry = tool_registry
        self.active_executions: Dict[str, Dict[str, Any]] = {}
        self.executor = ThreadPoolExecutor(max_workers=5)
        
    async def execute_plan(
        self,
        plan: ExecutionPlan,
        agent_callbacks: Dict[str, Callable],
        event_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute an execution plan with parallel processing.
        
        Args:
            plan: The execution plan to execute
            agent_callbacks: Mapping of agent names to their execute functions
            event_callback: Optional callback for progress events
            
        Returns:
            Execution result with status and outputs
        """
        logger.info(f"Executing plan {plan.id}: {plan.goal}")
        
        plan.status = PlanStatus.EXECUTING
        completed_steps = set()
        running_tasks = {}
        failed_steps = []
        
        execution_context = {
            'plan_id': plan.id,
            'outputs': {},
            'start_time': datetime.now(timezone.utc)
        }
        
        try:
            while len(completed_steps) < len(plan.steps):
                # Find steps ready to execute (dependencies satisfied)
                ready_steps = self._get_ready_steps(
                    plan.steps, completed_steps, set(running_tasks.keys())
                )
                
                if not ready_steps and not running_tasks:
                    # Deadlock or all done
                    break
                
                # Start ready steps
                for step in ready_steps:
                    task = asyncio.create_task(
                        self._execute_step(
                            step, agent_callbacks, execution_context, event_callback
                        )
                    )
                    running_tasks[step.id] = task
                
                # Wait for at least one task to complete
                if running_tasks:
                    done, pending = await asyncio.wait(
                        running_tasks.values(),
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    
                    # Process completed tasks
                    for task in done:
                        # Find which step this task was for
                        step_id = None
                        for sid, t in running_tasks.items():
                            if t == task:
                                step_id = sid
                                break
                        
                        if step_id:
                            del running_tasks[step_id]
                            
                            try:
                                result = await task
                                if result.get('success'):
                                    completed_steps.add(step_id)
                                    # Store output for dependent steps
                                    execution_context['outputs'][step_id] = result.get('output')
                                    
                                    # Update step status
                                    for s in plan.steps:
                                        if s.id == step_id:
                                            s.status = StepStatus.COMPLETE
                                            s.output = str(result.get('output', ''))[:200]
                                            s.completed_at = datetime.now(timezone.utc)
                                            break
                                else:
                                    failed_steps.append(step_id)
                                    for s in plan.steps:
                                        if s.id == step_id:
                                            s.status = StepStatus.FAILED
                                            s.error = result.get('error', 'Unknown error')
                                            break
                                            
                            except Exception as e:
                                logger.error(f"Step {step_id} failed: {e}")
                                failed_steps.append(step_id)
                                for s in plan.steps:
                                    if s.id == step_id:
                                        s.status = StepStatus.FAILED
                                        s.error = str(e)
                                        break
            
            # Determine final status
            if failed_steps:
                plan.status = PlanStatus.FAILED
                return {
                    'success': False,
                    'completed_steps': len(completed_steps),
                    'failed_steps': failed_steps,
                    'total_steps': len(plan.steps),
                    'outputs': execution_context['outputs']
                }
            else:
                plan.status = PlanStatus.COMPLETE
                return {
                    'success': True,
                    'completed_steps': len(completed_steps),
                    'total_steps': len(plan.steps),
                    'outputs': execution_context['outputs'],
                    'execution_time_ms': self._get_execution_time(execution_context)
                }
                
        except Exception as e:
            logger.error(f"Plan execution failed: {e}")
            plan.status = PlanStatus.FAILED
            return {
                'success': False,
                'error': str(e),
                'completed_steps': len(completed_steps),
                'total_steps': len(plan.steps)
            }
    
    def _get_ready_steps(
        self,
        steps: List[ExecutionStep],
        completed: set,
        running: set
    ) -> List[ExecutionStep]:
        """Get steps that are ready to execute (dependencies met)"""
        ready = []
        for step in steps:
            if step.id in completed or step.id in running:
                continue
            if step.status == StepStatus.COMPLETE:
                continue
                
            # Check if all dependencies are completed
            deps_satisfied = all(
                dep_id in completed 
                for dep_id in step.depends_on
            )
            
            if deps_satisfied:
                ready.append(step)
        
        return ready
    
    async def _execute_step(
        self,
        step: ExecutionStep,
        agent_callbacks: Dict[str, Callable],
        context: Dict[str, Any],
        event_callback: Optional[Callable]
    ) -> Dict[str, Any]:
        """Execute a single step"""
        step.status = StepStatus.RUNNING
        step.started_at = datetime.now(timezone.utc)
        
        if event_callback:
            await event_callback({
                'type': 'step_start',
                'step_id': step.id,
                'agent': step.agent
            })
        
        try:
            # Get the appropriate agent callback
            agent_key = step.agent.replace('executor_', '')
            callback = agent_callbacks.get(agent_key)
            
            if not callback:
                return {
                    'success': False,
                    'error': f"No agent available for: {step.agent}"
                }
            
            # Execute
            logger.info(f"Executing step {step.id}: {step.action}")
            
            # Resolve parameter references from previous steps
            resolved_params = self._resolve_params(step.params, context['outputs'])
            
            result = await callback(
                action=step.action,
                params=resolved_params,
                context=context
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Step {step.id} execution error: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _resolve_params(
        self,
        params: Dict[str, Any],
        outputs: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Resolve parameter references like ${step_id.output}"""
        resolved = {}
        
        for key, value in params.items():
            if isinstance(value, str) and value.startswith('${') and value.endswith('}'):
                # Extract reference
                ref = value[2:-1]  # step_id.output or similar
                parts = ref.split('.')
                
                if len(parts) >= 1:
                    step_id = parts[0]
                    if step_id in outputs:
                        resolved[key] = outputs[step_id]
                    else:
                        resolved[key] = value  # Keep original if not found
                else:
                    resolved[key] = value
            else:
                resolved[key] = value
        
        return resolved
    
    def _get_execution_time(self, context: Dict[str, Any]) -> int:
        """Get execution time in milliseconds"""
        if 'start_time' in context:
            delta = datetime.now(timezone.utc) - context['start_time']
            return int(delta.total_seconds() * 1000)
        return 0
    
    async def cancel_plan(self, plan_id: str):
        """Cancel an active execution"""
        if plan_id in self.active_executions:
            self.active_executions[plan_id]['cancelled'] = True
            logger.info(f"Plan {plan_id} cancelled")
