"""
Vector Store - ChromaDB for semantic memory
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class VectorStore:
    """
    Vector store for semantic search using ChromaDB.
    Stores embeddings for memories, enabling semantic similarity search.
    """
    
    def __init__(self, collection_name: str = "jarvis_memories"):
        self.collection_name = collection_name
        self.client = None
        self.collection = None
    
    async def initialize(self):
        """Initialize ChromaDB client"""
        try:
            import chromadb
            from chromadb.config import Settings
            
            self.client = chromadb.Client(Settings(
                chroma_db_impl="duckdb+parquet",
                persist_directory="./chroma_db"
            ))
            
            # Get or create collection
            self.collection = self.client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "J.A.R.V.I.S. semantic memory"}
            )
            
            logger.info("Vector store initialized")
            
        except ImportError:
            logger.warning("ChromaDB not installed. Vector store disabled.")
            self.client = None
    
    async def upsert(
        self,
        id: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ):
        """Upsert a vector embedding"""
        if self.collection is None:
            return
        
        try:
            self.collection.upsert(
                ids=[id],
                embeddings=[embedding],
                metadatas=[metadata]
            )
        except Exception as e:
            logger.error(f"Vector upsert error: {e}")
    
    async def search(
        self,
        query: str,
        limit: int = 5,
        filter_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar vectors.
        
        Note: This requires the query to be embedded first.
        For now, we return an empty list (embedding generation not implemented).
        """
        if self.collection is None:
            return []
        
        try:
            # In production:
            # 1. Embed the query using same embedding model
            # 2. Use collection.query() with the embedding
            
            # For now, return recent entries
            where_filter = None
            if filter_type:
                where_filter = {"type": filter_type}
            
            results = self.collection.query(
                query_texts=[query],  # Chroma can embed if embedding function set
                n_results=limit,
                where=where_filter
            )
            
            # Format results
            formatted = []
            if results and results['ids']:
                for i, id in enumerate(results['ids'][0]):
                    formatted.append({
                        'id': id,
                        'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                        'distance': results['distances'][0][i] if results['distances'] else None
                    })
            
            return formatted
            
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            return []
    
    async def delete(self, id: str):
        """Delete a vector"""
        if self.collection is None:
            return
        
        try:
            self.collection.delete(ids=[id])
        except Exception as e:
            logger.error(f"Vector delete error: {e}")
    
    async def get(self, id: str) -> Optional[Dict[str, Any]]:
        """Get a specific vector by ID"""
        if self.collection is None:
            return None
        
        try:
            result = self.collection.get(ids=[id])
            if result and result['ids']:
                return {
                    'id': result['ids'][0],
                    'metadata': result['metadatas'][0] if result['metadatas'] else {},
                    'embedding': result['embeddings'][0] if result['embeddings'] else None
                }
            return None
        except Exception as e:
            logger.error(f"Vector get error: {e}")
            return None
