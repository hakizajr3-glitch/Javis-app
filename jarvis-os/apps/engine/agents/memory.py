"""
Memory Agent - Long-term learning and context retrieval
"""

import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime

from models.schemas import MemoryEntry, ExecutionPlan

logger = logging.getLogger(__name__)


class MemoryAgent:
    """
    Memory Agent: Stores and retrieves learned information.
    
    Storage Types:
    - Episodic: Past conversations and task history
    - Semantic: User preferences, habits, workflows
    - Procedural: Successful task patterns
    """
    
    def __init__(self, sqlite_store: Any, vector_store: Any):
        self.sqlite_store = sqlite_store
        self.vector_store = vector_store
    
    async def store_episode(
        self,
        command: str,
        plan: ExecutionPlan,
        result: Dict[str, Any]
    ) -> str:
        """
        Store a task execution episode.
        
        Args:
            command: Original command
            plan: Execution plan
            result: Execution result
            
        Returns:
            Memory entry ID
        """
        # Create memory entry
        entry = MemoryEntry(
            id=str(uuid.uuid4()),
            type='episodic',
            content=f"Command: {command}\nPlan: {plan.goal}\nResult: {result.get('success')}",
            metadata={
                'command': command,
                'plan_id': plan.id,
                'success': result.get('success'),
                'steps_count': len(plan.steps),
                'intent': plan.metadata.get('intent')
            }
        )
        
        # Store in SQLite
        await self._store_in_sqlite(entry)
        
        # Store in vector store for semantic search
        await self._store_in_vector_db(entry)
        
        logger.info(f"Stored episode {entry.id}")
        return entry.id
    
    async def store(
        self,
        content: str,
        memory_type: str = 'semantic',
        metadata: Dict[str, Any] = None
    ) -> str:
        """
        Store arbitrary content in memory.
        
        Args:
            content: Content to store
            memory_type: Type of memory
            metadata: Additional metadata
            
        Returns:
            Memory entry ID
        """
        entry = MemoryEntry(
            id=str(uuid.uuid4()),
            type=memory_type,
            content=content,
            metadata=metadata or {}
        )
        
        await self._store_in_sqlite(entry)
        await self._store_in_vector_db(entry)
        
        return entry.id
    
    async def retrieve_relevant(
        self,
        query: str,
        limit: int = 5,
        memory_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant memories for a query.
        
        Args:
            query: Search query
            limit: Maximum results
            memory_type: Filter by type
            
        Returns:
            List of relevant memories
        """
        # Search in vector store for semantic similarity
        vector_results = await self.vector_store.search(
            query=query,
            limit=limit,
            filter_type=memory_type
        )
        
        # Also search in SQLite for recent/exact matches
        sql_results = await self.sqlite_store.search_memories(
            query=query,
            limit=limit,
            memory_type=memory_type
        )
        
        # Combine and deduplicate
        combined = self._combine_results(vector_results, sql_results)
        
        # Update access counts
        for result in combined:
            await self._update_access_count(result.get('id'))
        
        return combined[:limit]
    
    async def get_user_preferences(self) -> Dict[str, Any]:
        """Get learned user preferences"""
        preferences = await self.sqlite_store.get_preferences()
        return preferences
    
    async def store_preference(
        self,
        key: str,
        value: Any,
        confidence: float = 1.0
    ):
        """Store a learned preference"""
        await self.sqlite_store.store_preference(key, value, confidence)
    
    async def get_workflow_pattern(
        self,
        intent: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a learned workflow pattern for an intent.
        
        Args:
            intent: Intent to look up
            
        Returns:
            Workflow pattern if found
        """
        pattern = await self.sqlite_store.get_workflow_pattern(intent)
        return pattern
    
    async def store_workflow_pattern(
        self,
        intent: str,
        pattern: Dict[str, Any],
        success_rate: float
    ):
        """Store a successful workflow pattern"""
        await self.sqlite_store.store_workflow_pattern(
            intent, pattern, success_rate
        )
    
    async def _store_in_sqlite(self, entry: MemoryEntry):
        """Store in SQLite database"""
        await self.sqlite_store.insert_memory(
            id=entry.id,
            type=entry.type,
            content=entry.content,
            metadata=entry.metadata,
            created_at=entry.created_at
        )
    
    async def _store_in_vector_db(self, entry: MemoryEntry):
        """Store in vector database for semantic search"""
        # Generate embedding
        embedding = await self._generate_embedding(entry.content)
        entry.embedding = embedding
        
        await self.vector_store.upsert(
            id=entry.id,
            embedding=embedding,
            metadata={
                'type': entry.type,
                'content': entry.content,
                'created_at': entry.created_at.isoformat()
            }
        )
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text"""
        # In production, use OpenAI or local embedding model
        # For now, return mock embedding
        return [0.0] * 1536  # OpenAI embedding size
    
    async def _update_access_count(self, memory_id: str):
        """Update access count for a memory"""
        await self.sqlite_store.increment_access_count(memory_id)
    
    def _combine_results(
        self,
        vector_results: List[Dict],
        sql_results: List[Dict]
    ) -> List[Dict[str, Any]]:
        """Combine and deduplicate search results"""
        seen_ids = set()
        combined = []
        
        for result in vector_results + sql_results:
            mid = result.get('id')
            if mid and mid not in seen_ids:
                seen_ids.add(mid)
                combined.append(result)
        
        # Sort by relevance (would be more sophisticated in production)
        return combined
