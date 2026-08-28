"""
Reflection Agent - Self-improvement through execution review
"""

import logging
from typing import Dict, Any
from datetime import datetime

from models.schemas import ExecutionPlan

logger = logging.getLogger(__name__)


class ReflectionAgent:
    """
    Reflection Agent: Reviews executions and improves future performance.
    
    Responsibilities:
    - Analyze successful and failed executions
    - Identify optimization opportunities
    - Update procedural memory
    - Improve planning strategies
    """
    
    def __init__(self, sqlite_store: Any):
        self.sqlite_store = sqlite_store
    
    async def review_execution(
        self,
        plan: ExecutionPlan,
        result: Dict[str, Any]
    ):
        """
        Review a completed execution and extract learnings.
        
        Args:
            plan: The executed plan
            result: Execution result
        """
        logger.info(f"Reviewing execution of plan {plan.id}")
        
        if result.get('success'):
            await self._review_success(plan, result)
        else:
            await self._review_failure(plan, result)
    
    async def _review_success(
        self,
        plan: ExecutionPlan,
        result: Dict[str, Any]
    ):
        """Analyze successful execution"""
        
        # Calculate metrics
        total_steps = len(plan.steps)
        completed_steps = result.get('completed_steps', 0)
        execution_time_ms = result.get('execution_time_ms', 0)
        
        # Identify patterns
        step_pattern = [
            {'agent': step.agent, 'action': step.action}
            for step in plan.steps
        ]
        
        # Store successful workflow pattern
        await self.sqlite_store.store_workflow_pattern(
            intent=plan.metadata.get('intent', 'unknown'),
            pattern={
                'steps': step_pattern,
                'estimated_duration': execution_time_ms,
                'step_count': total_steps
            },
            success_rate=1.0
        )
        
        # Identify optimization opportunities
        optimizations = self._identify_optimizations(plan, result)
        if optimizations:
            await self.sqlite_store.store_optimization_opportunity(
                plan_id=plan.id,
                suggestions=optimizations
            )
        
        logger.info(f"Success pattern stored for intent: {plan.metadata.get('intent')}")
    
    async def _review_failure(
        self,
        plan: ExecutionPlan,
        result: Dict[str, Any]
    ):
        """Analyze failed execution"""
        
        error = result.get('error', 'Unknown error')
        failed_steps = result.get('failed_steps', [])
        
        # Categorize failure
        failure_category = self._categorize_failure(error)
        
        # Store failure pattern for learning
        await self.sqlite_store.store_failure_pattern(
            plan_id=plan.id,
            intent=plan.metadata.get('intent', 'unknown'),
            error_category=failure_category,
            error_message=error,
            failed_steps=failed_steps,
            step_count=len(plan.steps)
        )
        
        # Suggest recovery strategy
        recovery_strategy = self._suggest_recovery(error, failure_category)
        
        await self.sqlite_store.store_recovery_strategy(
            error_category=failure_category,
            strategy=recovery_strategy
        )
        
        logger.info(f"Failure pattern stored: {failure_category}")
    
    def _identify_optimizations(
        self,
        plan: ExecutionPlan,
        result: Dict[str, Any]
    ) -> list:
        """Identify potential optimizations"""
        optimizations = []
        
        # Check for sequential steps that could be parallel
        sequential_agents = []
        for step in plan.steps:
            if step.agent not in sequential_agents:
                sequential_agents.append(step.agent)
        
        if len(sequential_agents) > 2:
            optimizations.append({
                'type': 'parallelization',
                'description': 'Steps could potentially be parallelized',
                'potential_savings': '20-30%'
            })
        
        # Check for long execution time
        execution_time = result.get('execution_time_ms', 0)
        if execution_time > 30000:  # > 30 seconds
            optimizations.append({
                'type': 'performance',
                'description': 'Execution took longer than expected',
                'potential_savings': 'Unknown'
            })
        
        return optimizations
    
    def _categorize_failure(self, error: str) -> str:
        """Categorize failure type"""
        error_lower = error.lower()
        
        if 'not found' in error_lower or 'does not exist' in error_lower:
            return 'resource_not_found'
        elif 'permission' in error_lower or 'access' in error_lower:
            return 'permission_denied'
        elif 'timeout' in error_lower or 'timed out' in error_lower:
            return 'timeout'
        elif 'network' in error_lower or 'connection' in error_lower:
            return 'network_error'
        elif 'parse' in error_lower or 'format' in error_lower:
            return 'parse_error'
        else:
            return 'unknown_error'
    
    def _suggest_recovery(
        self,
        error: str,
        category: str
    ) -> Dict[str, Any]:
        """Suggest recovery strategy for failure"""
        
        strategies = {
            'resource_not_found': {
                'action': 'verify_path',
                'fallback': 'create_resource',
                'message': 'Verify the file/path exists or create it'
            },
            'permission_denied': {
                'action': 'escalate_permissions',
                'fallback': 'request_user_action',
                'message': 'Try with elevated permissions or ask user'
            },
            'timeout': {
                'action': 'increase_timeout',
                'fallback': 'break_into_steps',
                'message': 'Increase timeout or break into smaller steps'
            },
            'network_error': {
                'action': 'retry',
                'fallback': 'offline_mode',
                'message': 'Retry with exponential backoff'
            },
            'parse_error': {
                'action': 'validate_input',
                'fallback': 'request_clarification',
                'message': 'Validate input format before processing'
            },
            'unknown_error': {
                'action': 'log_and_report',
                'fallback': 'request_user_action',
                'message': 'Log details and ask user for guidance'
            }
        }
        
        return strategies.get(category, strategies['unknown_error'])
    
    async def get_improvement_suggestions(
        self,
        intent: str
    ) -> list:
        """Get improvement suggestions for an intent type"""
        
        # Get failure patterns for this intent
        failures = await self.sqlite_store.get_failure_patterns(intent)
        
        # Get optimization opportunities
        optimizations = await self.sqlite_store.get_optimization_opportunities(intent)
        
        # Compile suggestions
        suggestions = []
        
        for failure in failures:
            strategy = await self.sqlite_store.get_recovery_strategy(
                failure['error_category']
            )
            if strategy:
                suggestions.append({
                    'type': 'failure_prevention',
                    'category': failure['error_category'],
                    'suggestion': strategy['message']
                })
        
        for opt in optimizations:
            suggestions.append({
                'type': 'optimization',
                'suggestion': opt['description'],
                'potential_impact': opt.get('potential_savings', 'unknown')
            })
        
        return suggestions
