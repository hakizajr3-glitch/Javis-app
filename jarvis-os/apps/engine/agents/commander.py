"""
Commander Agent - Intent classification and command parsing
"""

import logging
from typing import Dict, Any, Optional

from models.schemas import IntentClassification
from ai_client import get_ai_client

logger = logging.getLogger(__name__)


class CommanderAgent:
    """
    Commander Agent: The entry point for all user commands.
    
    Responsibilities:
    - Parse natural language commands
    - Classify intent
    - Extract entities
    - Determine complexity
    """
    
    def __init__(self, event_queue: Any, sqlite_store: Any):
        self.event_queue = event_queue
        self.sqlite_store = sqlite_store
        
        # Intent patterns for classification
        self.intent_patterns = {
            'file_create': [
                'create file', 'make file', 'new file', 'write file',
                'create document', 'new document'
            ],
            'file_read': [
                'read file', 'open file', 'show file', 'view file',
                'read document', 'open document'
            ],
            'file_edit': [
                'edit file', 'modify file', 'update file', 'change file',
                'edit document', 'modify document'
            ],
            'file_delete': [
                'delete file', 'remove file', 'trash file', 'destroy file'
            ],
            'file_organize': [
                'organize files', 'clean up folder', 'sort files',
                'organize folder', 'tidy up'
            ],
            'browser_navigate': [
                'open website', 'go to', 'navigate to', 'visit',
                'open url', 'browse to'
            ],
            'browser_search': [
                'search for', 'google', 'look up', 'find information',
                'research', 'search'
            ],
            'browser_extract': [
                'extract data', 'scrape', 'get information from',
                'download from', 'save from website'
            ],
            'system_launch': [
                'open app', 'launch app', 'start application',
                'run program', 'launch program'
            ],
            'system_info': [
                'system info', 'computer info', 'show status',
                'what is running', 'check system'
            ],
            'complex_workflow': [
                'set up', 'create system', 'build workflow',
                'automate', 'generate report', 'research and create'
            ],
            'communication': [
                'send email', 'send message', 'email', 'message',
                'notify', 'contact'
            ],
            'general_query': [
                'what is', 'how to', 'explain', 'tell me about',
                'question', 'help me understand'
            ]
        }
    
    async def classify_intent(self, command: str) -> IntentClassification:
        """
        Classify the intent of a user command using NVIDIA/OpenAI AI.
        
        Args:
            command: Natural language command
            
        Returns:
            IntentClassification with intent type, confidence, and entities
        """
        logger.info(f"Classifying intent for: {command[:50]}...")
        
        try:
            # Use AI client for intelligent classification
            client = await get_ai_client()
            ai_result = await client.classify_intent(command)
            
            # Parse AI response
            intent = ai_result.get('intent', 'general_query')
            confidence = ai_result.get('confidence', 0.7)
            entities = ai_result.get('entities', {})
            complexity = ai_result.get('complexity', 'medium')
            
            # Suggest tools based on intent
            suggested_tools = self._suggest_tools(intent)
            
            # Estimate steps
            estimated_steps = self._estimate_steps(intent, complexity)
            
            return IntentClassification(
                intent=intent,
                confidence=confidence,
                entities=entities,
                suggested_tools=suggested_tools,
                complexity=complexity,
                estimated_steps=estimated_steps
            )
            
        except Exception as e:
            logger.error(f"AI intent classification failed: {e}, using fallback")
            # Fallback to rule-based if AI fails
            return self._fallback_classify_intent(command)
    
    def _fallback_classify_intent(self, command: str) -> IntentClassification:
        """Fallback rule-based classification"""
        command_lower = command.lower()
        
        # Match against patterns
        intent_scores = {}
        for intent, patterns in self.intent_patterns.items():
            score = 0
            for pattern in patterns:
                if pattern in command_lower:
                    score += 1
            if score > 0:
                intent_scores[intent] = score
        
        # Determine primary intent
        if intent_scores:
            primary_intent = max(intent_scores, key=intent_scores.get)
            confidence = min(0.6 + (intent_scores[primary_intent] * 0.1), 0.95)
        else:
            primary_intent = 'general_query'
            confidence = 0.5
        
        # Extract entities
        entities = self._extract_entities(command, primary_intent)
        complexity = self._assess_complexity(command, primary_intent)
        estimated_steps = self._estimate_steps(primary_intent, complexity)
        suggested_tools = self._suggest_tools(primary_intent)
        
        return IntentClassification(
            intent=primary_intent,
            confidence=confidence,
            entities=entities,
            suggested_tools=suggested_tools,
            complexity=complexity,
            estimated_steps=estimated_steps
        )
    
    def _extract_entities(
        self, 
        command: str, 
        intent: str
    ) -> Dict[str, Any]:
        """Extract relevant entities from command"""
        entities = {}
        
        # Simple entity extraction (production would use NER)
        words = command.split()
        
        # Extract file paths (anything with / or \\ or .ext)
        for word in words:
            if '/' in word or '\\' in word or '.' in word:
                if 'path' not in entities:
                    entities['path'] = []
                entities['path'].append(word)
        
        # Extract URLs
        for word in words:
            if word.startswith('http://') or word.startswith('https://'):
                entities['url'] = word
            elif '.' in word and ' ' not in word:
                # Might be a domain
                entities['possible_url'] = word
        
        # Extract app names for system commands
        if 'app' in intent or 'launch' in intent:
            # Look for quoted strings or capitalized words
            entities['app_candidate'] = words[-1] if words else None
        
        # Extract search queries
        if 'search' in intent:
            # Everything after "search for" or similar
            search_indicators = ['search for', 'google', 'look up', 'research']
            for indicator in search_indicators:
                if indicator in command.lower():
                    idx = command.lower().find(indicator)
                    if idx >= 0:
                        entities['search_query'] = command[idx + len(indicator):].strip()
                        break
        
        return entities
    
    def _assess_complexity(
        self, 
        command: str, 
        intent: str
    ) -> str:
        """Assess task complexity"""
        # Count words (longer = potentially more complex)
        word_count = len(command.split())
        
        # Check for complexity indicators
        complexity_indicators = [
            'and then', 'after that', 'next', 'finally',
            'workflow', 'automation', 'system', 'setup',
            'generate', 'create report', 'analysis'
        ]
        
        complexity_score = 0
        for indicator in complexity_indicators:
            if indicator in command.lower():
                complexity_score += 1
        
        # Check for multiple intents
        intent_matches = sum(
            1 for patterns in self.intent_patterns.values()
            for pattern in patterns
            if pattern in command.lower()
        )
        
        if complexity_score >= 2 or intent_matches >= 2 or word_count > 20:
            return 'high'
        elif complexity_score >= 1 or word_count > 10:
            return 'medium'
        else:
            return 'low'
    
    def _estimate_steps(self, intent: str, complexity: str) -> int:
        """Estimate number of execution steps"""
        base_steps = {
            'file_create': 1,
            'file_read': 1,
            'file_edit': 1,
            'file_delete': 1,
            'browser_navigate': 1,
            'browser_search': 2,
            'system_launch': 1,
            'communication': 2,
        }
        
        base = base_steps.get(intent, 1)
        
        if complexity == 'high':
            return max(base * 3, 5)
        elif complexity == 'medium':
            return max(base * 2, 3)
        else:
            return base
    
    def _suggest_tools(self, intent: str) -> list:
        """Suggest appropriate tools for the intent"""
        tool_mapping = {
            'file_create': ['create_file', 'mkdir', 'write_file'],
            'file_read': ['read_file', 'list_dir'],
            'file_edit': ['write_file', 'read_file'],
            'file_delete': ['delete_file'],
            'file_organize': ['list_dir', 'move_file', 'mkdir'],
            'browser_navigate': ['navigate', 'screenshot'],
            'browser_search': ['search', 'navigate', 'extract_text'],
            'browser_extract': ['extract_text', 'download', 'screenshot'],
            'system_launch': ['launch_app'],
            'system_info': ['system_info', 'list_processes'],
            'communication': ['send_email', 'send_message'],
        }
        
        return tool_mapping.get(intent, ['search'])
