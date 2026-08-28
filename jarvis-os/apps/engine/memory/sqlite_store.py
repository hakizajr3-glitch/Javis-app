"""
SQLite Store - Persistent storage for memories, preferences, and execution history
"""

import sqlite3
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ConversationMessage:
    """Single conversation message with full context"""
    role: str  # "system", "user", "assistant"
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    audio_data: Optional[bytes] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class SQLiteStore:
    """
    SQLite database for storing:
    - Episodic memories
    - User preferences
    - Workflow patterns
    - Execution history
    """
    
    def __init__(self, db_path: str = "jarvis_memory.db"):
        self.db_path = db_path
        self.connection: Optional[sqlite3.Connection] = None
    
    async def initialize(self):
        """Initialize database connection and tables"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row
        
        self._create_tables()
        logger.info("SQLite store initialized")
    
    def _create_tables(self):
        """Create database tables"""
        cursor = self.connection.cursor()
        
        # Memories table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                access_count INTEGER DEFAULT 0
            )
        """)
        
        # Conversation history table (PERSISTENT)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                session_id TEXT NOT NULL
            )
        """)
        
        # Create index for faster lookups
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_conversation_session 
            ON conversation_history(session_id, timestamp)
        """)
        
        # Preferences table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Workflow patterns table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workflow_patterns (
                id TEXT PRIMARY KEY,
                intent TEXT NOT NULL,
                pattern TEXT NOT NULL,
                success_rate REAL DEFAULT 0.0,
                usage_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Failure patterns table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS failure_patterns (
                id TEXT PRIMARY KEY,
                plan_id TEXT,
                intent TEXT,
                error_category TEXT,
                error_message TEXT,
                failed_steps TEXT,
                step_count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Recovery strategies table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS recovery_strategies (
                id TEXT PRIMARY KEY,
                error_category TEXT UNIQUE NOT NULL,
                strategy TEXT NOT NULL,
                success_count INTEGER DEFAULT 0,
                fail_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        self.connection.commit()
    
    async def insert_memory(
        self,
        id: str,
        type: str,
        content: str,
        metadata: Dict[str, Any],
        created_at: datetime
    ):
        """Insert a memory entry"""
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO memories (id, type, content, metadata, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
            """,
            (id, type, content, json.dumps(metadata), created_at)
        )
        self.connection.commit()
    
    async def search_memories(
        self,
        query: str,
        limit: int = 5,
        memory_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search memories by content similarity (simple keyword match)"""
        cursor = self.connection.cursor()
        
        # Simple keyword search
        keywords = query.lower().split()
        
        if memory_type:
            cursor.execute(
                """
                SELECT * FROM memories 
                WHERE type = ? 
                ORDER BY access_count DESC, created_at DESC
                LIMIT ?
                """,
                (memory_type, limit)
            )
        else:
            cursor.execute(
                """
                SELECT * FROM memories 
                ORDER BY access_count DESC, created_at DESC
                LIMIT ?
                """,
                (limit,)
            )
        
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            content = row['content'].lower()
            # Calculate relevance score
            score = sum(1 for kw in keywords if kw in content)
            if score > 0:
                results.append({
                    'id': row['id'],
                    'type': row['type'],
                    'content': row['content'],
                    'metadata': json.loads(row['metadata'] or '{}'),
                    'created_at': row['created_at'],
                    'access_count': row['access_count'],
                    'relevance_score': score
                })
        
        # Sort by relevance
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return results[:limit]
    
    async def increment_access_count(self, memory_id: str):
        """Increment access count for a memory"""
        cursor = self.connection.cursor()
        cursor.execute(
            "UPDATE memories SET access_count = access_count + 1 WHERE id = ?",
            (memory_id,)
        )
        self.connection.commit()
    
    async def store_preference(
        self,
        key: str,
        value: Any,
        confidence: float = 1.0
    ):
        """Store a user preference"""
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO preferences (key, value, confidence)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                confidence = excluded.confidence,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, json.dumps(value), confidence)
        )
        self.connection.commit()
    
    async def get_preferences(self) -> Dict[str, Any]:
        """Get all user preferences"""
        cursor = self.connection.cursor()
        cursor.execute("SELECT * FROM preferences")
        rows = cursor.fetchall()
        
        return {
            row['key']: json.loads(row['value'])
            for row in rows
        }
    
    async def store_workflow_pattern(
        self,
        intent: str,
        pattern: Dict[str, Any],
        success_rate: float
    ):
        """Store a successful workflow pattern"""
        import uuid
        cursor = self.connection.cursor()
        
        # Check if pattern exists for this intent
        cursor.execute(
            "SELECT * FROM workflow_patterns WHERE intent = ?",
            (intent,)
        )
        existing = cursor.fetchone()
        
        if existing:
            # Update usage count
            cursor.execute(
                """
                UPDATE workflow_patterns 
                SET usage_count = usage_count + 1,
                    success_rate = ?
                WHERE intent = ?
                """,
                (success_rate, intent)
            )
        else:
            # Insert new pattern
            cursor.execute(
                """
                INSERT INTO workflow_patterns (id, intent, pattern, success_rate)
                VALUES (?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), intent, json.dumps(pattern), success_rate)
            )
        
        self.connection.commit()
    
    async def get_workflow_pattern(
        self,
        intent: str
    ) -> Optional[Dict[str, Any]]:
        """Get workflow pattern for an intent"""
        cursor = self.connection.cursor()
        cursor.execute(
            "SELECT * FROM workflow_patterns WHERE intent = ?",
            (intent,)
        )
        row = cursor.fetchone()
        
        if row:
            return {
                'intent': row['intent'],
                'pattern': json.loads(row['pattern']),
                'success_rate': row['success_rate'],
                'usage_count': row['usage_count']
            }
        return None
    
    async def store_failure_pattern(
        self,
        plan_id: str,
        intent: str,
        error_category: str,
        error_message: str,
        failed_steps: List[str],
        step_count: int
    ):
        """Store a failure pattern for learning"""
        import uuid
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO failure_patterns 
            (id, plan_id, intent, error_category, error_message, failed_steps, step_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                plan_id,
                intent,
                error_category,
                error_message,
                json.dumps(failed_steps),
                step_count
            )
        )
        self.connection.commit()
    
    async def get_failure_patterns(
        self,
        intent: str
    ) -> List[Dict[str, Any]]:
        """Get failure patterns for an intent"""
        cursor = self.connection.cursor()
        cursor.execute(
            """
            SELECT * FROM failure_patterns 
            WHERE intent = ? 
            ORDER BY created_at DESC
            LIMIT 10
            """,
            (intent,)
        )
        rows = cursor.fetchall()
        
        return [
            {
                'error_category': row['error_category'],
                'error_message': row['error_message'],
                'failed_steps': json.loads(row['failed_steps']),
                'created_at': row['created_at']
            }
            for row in rows
        ]
    
    async def store_recovery_strategy(
        self,
        error_category: str,
        strategy: Dict[str, Any]
    ):
        """Store a recovery strategy"""
        import uuid
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO recovery_strategies (id, error_category, strategy)
            VALUES (?, ?, ?)
            ON CONFLICT(error_category) DO UPDATE SET
                strategy = excluded.strategy
            """,
            (str(uuid.uuid4()), error_category, json.dumps(strategy))
        )
        self.connection.commit()
    
    async def get_recovery_strategy(
        self,
        error_category: str
    ) -> Optional[Dict[str, Any]]:
        """Get recovery strategy for an error category"""
        cursor = self.connection.cursor()
        cursor.execute(
            "SELECT * FROM recovery_strategies WHERE error_category = ?",
            (error_category,)
        )
        row = cursor.fetchone()
        
        if row:
            return json.loads(row['strategy'])
        return None
    
    async def store_optimization_opportunity(
        self,
        plan_id: str,
        suggestions: List[Dict[str, Any]]
    ):
        """Store optimization opportunities"""
        # Could add a separate table for this
        logger.info(f"Optimization opportunities for {plan_id}: {suggestions}")
    
    async def get_optimization_opportunities(
        self,
        intent: str
    ) -> List[Dict[str, Any]]:
        """Get optimization opportunities for an intent"""
        # Placeholder - would query optimization table
        return []

    # ==================== PERSISTENT CONVERSATION MEMORY ====================

    async def add_conversation_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Dict[str, Any] = None
    ):
        """Add message to persistent conversation history"""
        cursor = self.connection.cursor()
        cursor.execute(
            """
            INSERT INTO conversation_history (session_id, role, content, metadata)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, role, content, json.dumps(metadata or {}))
        )
        self.connection.commit()
        logger.info(f"[Memory] Added {role} message to session {session_id[:8]}...")

    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = 50
    ) -> List[ConversationMessage]:
        """Get full conversation history for a session"""
        cursor = self.connection.cursor()
        cursor.execute(
            """
            SELECT * FROM conversation_history 
            WHERE session_id = ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (session_id, limit)
        )
        rows = cursor.fetchall()
        
        return [
            ConversationMessage(
                role=row['role'],
                content=row['content'],
                timestamp=datetime.fromisoformat(row['timestamp']),
                metadata=json.loads(row['metadata'] or '{}')
            )
            for row in rows
        ]

    async def get_conversation_context(
        self,
        session_id: str,
        max_messages: int = 20
    ) -> List[Dict[str, str]]:
        """Get formatted conversation context for LLM"""
        messages = await self.get_conversation_history(session_id, max_messages)
        return [
            {"role": m.role, "content": m.content}
            for m in messages
        ]

    async def clear_conversation_session(self, session_id: str):
        """Clear a specific conversation session"""
        cursor = self.connection.cursor()
        cursor.execute(
            "DELETE FROM conversation_history WHERE session_id = ?",
            (session_id,)
        )
        self.connection.commit()
        logger.info(f"[Memory] Cleared session {session_id[:8]}...")

    async def get_all_sessions(self) -> List[str]:
        """Get all conversation session IDs"""
        cursor = self.connection.cursor()
        cursor.execute(
            "SELECT DISTINCT session_id FROM conversation_history ORDER BY timestamp DESC"
        )
        rows = cursor.fetchall()
        return [row['session_id'] for row in rows]

    async def get_session_count(self) -> int:
        """Get total message count across all sessions"""
        cursor = self.connection.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM conversation_history")
        return cursor.fetchone()['count']
