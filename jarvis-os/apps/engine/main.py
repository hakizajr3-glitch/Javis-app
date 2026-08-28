"""
J.A.R.V.I.S. AI Engine - Main FastAPI Application
Multi-Agent Autonomous Desktop System
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Optional
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from livekit import api as livekit_api

load_dotenv()

from core.orchestrator import AgentOrchestrator
from core.execution_engine import ExecutionEngine
from core.tool_registry import ToolRegistry
from core.browser_environment_manager import browser_manager
from models.schemas import (
    UserCommand, ExecutionPlan, AgentResponse, 
    AgentUpdate, SystemStatus
)
from memory.sqlite_store import SQLiteStore
from memory.vector_store import VectorStore
from conversation_engine import ConversationEngine, ConversationState
from voice_agent import VoiceAgentController, get_or_create_session, VoiceState

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global state
app_state = {
    'orchestrator': None,
    'execution_engine': None,
    'tool_registry': None,
    'sqlite_store': None,
    'vector_store': None,
    'active_connections': {},
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    logger.info("Starting J.A.R.V.I.S. AI Engine...")
    
    # Initialize stores
    app_state['sqlite_store'] = SQLiteStore()
    app_state['vector_store'] = VectorStore()
    
    # Initialize tool registry
    app_state['tool_registry'] = ToolRegistry()
    await app_state['tool_registry'].initialize()
    
    # Initialize execution engine
    app_state['execution_engine'] = ExecutionEngine(
        tool_registry=app_state['tool_registry']
    )
    
    # Initialize orchestrator
    app_state['orchestrator'] = AgentOrchestrator(
        execution_engine=app_state['execution_engine'],
        sqlite_store=app_state['sqlite_store'],
        vector_store=app_state['vector_store']
    )
    await app_state['orchestrator'].initialize()
    
    logger.info("J.A.R.V.I.S. AI Engine initialized successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down J.A.R.V.I.S. AI Engine...")
    if app_state['orchestrator']:
        await app_state['orchestrator'].shutdown()


# Create FastAPI app
app = FastAPI(
    title="J.A.R.V.I.S. AI Engine",
    description="Multi-Agent Autonomous Desktop System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected")
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected")
    
    async def send_message(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
    
    async def broadcast(self, message: dict):
        disconnected = []
        for client_id, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to {client_id}: {e}")
                disconnected.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected:
            self.disconnect(client_id)


manager = ConnectionManager()


@app.get("/livekit-token")
async def get_livekit_token(identity: str, room: str = "jarvis-room"):
    """Generate LiveKit JWT token for voice connection"""
    try:
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL")
        
        if not api_key or not api_secret:
            return {"error": "LiveKit credentials not configured"}
        
        # Create access token
        token = livekit_api.AccessToken(api_key, api_secret)
        
        # Set identity and name
        token.with_identity(identity)
        token.with_name(identity)
        
        # Add grants
        token.with_grants(livekit_api.VideoGrants(
            room_join=True,
            room=room,
            can_publish=True,
            can_subscribe=True,
        ))
        
        # Generate JWT
        jwt = token.to_jwt()
        
        logger.info(f"[LiveKit] Token generated for identity: {identity}")
        
        return {
            "token": jwt,
            "url": livekit_url,
            "room": room,
        }
    except Exception as e:
        logger.error(f"[LiveKit] Token generation failed: {e}")
        return {"error": str(e)}


@app.get("/")
async def root():
    return {
        "name": "J.A.R.V.I.S. AI Engine",
        "version": "1.0.0",
        "status": "operational",
        "agents": [
            "commander",
            "planner", 
            "executor_file",
            "executor_browser",
            "executor_system",
            "observer",
            "memory",
            "reflection"
        ]
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "orchestrator_ready": app_state['orchestrator'] is not None
    }


@app.websocket("/ws/desktop")
async def desktop_websocket(websocket: WebSocket):
    """WebSocket endpoint for desktop client"""
    client_id = f"desktop_{datetime.now(timezone.utc).timestamp()}"
    
    # Get memory store from app state
    memory_store = app_state.get('sqlite_store')
    
    # Create VoiceAgent controller with memory
    voice_agent = get_or_create_session(
        client_id,
        memory_store=memory_store
    )
    
    # Set up callbacks
    voice_agent.set_callbacks(
        on_state_change=lambda state: asyncio.create_task(manager.send_message(client_id, {"type": "state_change", "payload": {"state": state}})),
        on_transcript=lambda text, final: asyncio.create_task(manager.send_message(client_id, {"type": "transcript", "payload": {"text": text, "final": final}})),
        on_ai_response=lambda text: asyncio.create_task(manager.send_message(client_id, {"type": "ai_response", "payload": {"text": text}})),
        on_interrupt=lambda: asyncio.create_task(manager.send_message(client_id, {"type": "interrupted", "payload": {}})),
        on_audio_level=lambda level: None  # Could send audio level for visualization
    )
    
    app_state['active_connections'][client_id] = {
        'voice_agent': voice_agent,
        'cancelled': False
    }
    
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # Receive message from desktop
            data = await websocket.receive_text()
            message = json.loads(data)
            
            logger.info(f"[WS] Received: {message.get('type')}")
            
            msg_type = message.get('type')
            
            # Handle different message types
            if msg_type == 'interrupt':
                # 🚨 BARGE-IN: User interrupted - stop everything immediately
                voice_agent.interrupt()
                await manager.send_message(client_id, {"type": "interrupted", "payload": {"message": "AI interrupted"}})
                
            elif msg_type == 'audio_level':
                # 🎤 VAD: Audio level from frontend for interrupt detection
                level = message.get('payload', {}).get('level', 0)
                voice_agent.on_audio_level(level)
                
            elif msg_type == 'user_speaking':
                # 🎤 User speech detected
                transcript = message.get('payload', {}).get('transcript', '')
                is_final = message.get('payload', {}).get('is_final', False)
                voice_agent.on_user_speaking(transcript, is_final)
                
            elif msg_type == 'user_speaking_end':
                # 🎤 User stopped speaking
                transcript = message.get('payload', {}).get('transcript', '')
                voice_agent.on_user_speaking_end(transcript)
                
            elif msg_type == 'file_upload':
                await handle_file_upload(client_id, message['payload'])
                
            elif msg_type == 'memory_request':
                # 🧠 Memory request
                await handle_memory_request(client_id, message['payload'])
                
            elif msg_type == 'history_request':
                # 📜 History request
                await handle_history_request(client_id, message['payload'])
                
            elif msg_type == 'user_command':
                await handle_user_command(client_id, message['payload'])
                
            elif msg_type == 'voice_command':
                # 🎤 Voice command with full state machine
                transcript = message.get('payload', {}).get('transcript', '')
                is_final = message.get('payload', {}).get('is_final', True)
                
                logger.info(f"[Voice] Transcript: {transcript[:50]}... (final={is_final})")
                
                if is_final and transcript.strip():
                    # Process through voice agent - triggers full pipeline
                    voice_agent.on_user_speaking(transcript, is_final)
                    
            elif msg_type == 'screenshot_data':
                await handle_screenshot_data(client_id, message['payload'])
                
            elif msg_type == 'command_complete':
                await handle_command_complete(client_id, message['payload'])
                
            elif msg_type == 'file_operation_complete':
                await handle_file_operation_complete(client_id, message['payload'])
                
            elif msg_type == 'get_conversation_status':
                # Get conversation state
                status = voice_agent.get_status()
                await manager.send_message(client_id, {
                    "type": "conversation_status",
                    "payload": status
                })
                
            elif msg_type == 'get_history':
                # 📜 Get full conversation history
                if memory_store:
                    history = await memory_store.get_conversation_history(client_id, limit=30)
                    messages = [{"role": m.role, "content": m.content, "timestamp": m.timestamp.isoformat()} for m in history]
                    await manager.send_message(client_id, {
                        "type": "history_response",
                        "payload": {"messages": messages}
                    })
            
            # Browser Environment Management
            elif msg_type == 'create_browser_environment':
                await handle_create_browser_environment(client_id, message['payload'])
                
            elif msg_type == 'execute_in_environment':
                await handle_execute_in_environment(client_id, message['payload'])
                
            elif msg_type == 'close_browser_environment':
                await handle_close_browser_environment(client_id, message['payload'])
                
            elif msg_type == 'get_environments':
                await handle_get_environments(client_id, message['payload'])
                
            elif msg_type == 'start_screenshot_stream':
                await handle_start_screenshot_stream(client_id, message['payload'])
                
            elif msg_type == 'stop_screenshot_stream':
                await handle_stop_screenshot_stream(client_id, message['payload'])
            
    except WebSocketDisconnect:
        logger.info(f"[WS] Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"[WS] Error: {e}")
    finally:
        # Cleanup session
        close_session(client_id)
        if client_id in app_state.get('active_connections', {}):
            del app_state['active_connections'][client_id]


async def handle_user_command(client_id: str, payload: dict):
    """Process user command through the orchestrator"""
    command = payload.get('command', '')
    context = payload.get('context', {})
    
    logger.info(f"[Handler] Processing command: {command}")
    
    # Send acknowledgment
    await manager.send_message(client_id, {
        "type": "agent_update",
        "payload": {
            "agent": "commander",
            "status": "working",
            "message": f"Processing: {command[:50]}..."
        }
    })
    
    # Process through orchestrator
    try:
        logger.info(f"[Handler] Calling orchestrator.process_command...")
        result = await app_state['orchestrator'].process_command(command, context)
        logger.info(f"[Handler] Got result: {result.get('response', 'no response')[:50]}...")
        
        # Send response
        await manager.send_message(client_id, {
            "type": "response",
            "payload": {
                "response": result.get('response', 'Command processed'),
                "plan_id": result.get('plan_id')
            }
        })
        
        # If there's an execution plan, send it
        if result.get('execution_plan'):
            await manager.send_message(client_id, {
                "type": "execution_status",
                "payload": {
                    "type": "plan_start",
                    "goal": result['execution_plan']['goal'],
                    "steps": result['execution_plan']['steps']
                }
            })
            
    except Exception as e:
        logger.error(f"Error processing command: {e}")
        await manager.send_message(client_id, {
            "type": "response",
            "payload": {
                "response": f"⚠️ Error: {str(e)}"
            }
        })


async def handle_interrupt(client_id: str):
    """🚨 Handle interrupt - stop all ongoing processing"""
    logger.info(f"[Handler] 🚨 INTERRUPT from {client_id}")
    
    # Cancel any ongoing response
    app_state['active_connections'].get(client_id, {}).get('cancelled', False)
    
    # Send interrupt acknowledgment
    await manager.send_message(client_id, {
        "type": "interrupted",
        "payload": {"message": "AI interrupted"}
    })
    logger.info(f"[Handler] ✅ Interrupt handled - returning to listening")


async def handle_voice_command(client_id: str, payload: dict):
    """Process voice command (transcribed to text)"""
    transcript = payload.get('transcript', '')
    await handle_user_command(client_id, {'command': transcript, 'context': {'source': 'voice'}})


async def handle_voice_conversation(client_id: str, payload: dict, conv_engine: ConversationEngine):
    """Handle voice conversational flow"""
    transcript = payload.get('transcript', '')
    is_final = payload.get('is_final', True)
    
    logger.info(f"[Voice] Transcript: {transcript[:50]}... (final={is_final})")
    
    # Process through conversation engine
    response = await conv_engine.process_turn(transcript, is_final)
    
    if response:
        logger.info(f"[Voice] Response: {response[:50]}...")
        
        # Send response back
        await manager.send_message(client_id, {
            "type": "response",
            "payload": {
                "response": response,
                "source": "voice"
            }
        })
        
        # Also send audio if needed
        await manager.send_message(client_id, {
            "type": "tts_audio",
            "payload": {
                "text": response
            }
        })


async def handle_audio_stream(client_id: str, payload: dict, conv_engine: ConversationEngine):
    """Handle continuous audio stream from STT"""
    is_speaking = payload.get('is_speaking', False)
    
    if is_speaking:
        conv_engine.on_speech_start()
        await manager.send_message(client_id, {
            "type": "listening",
            "payload": {"status": "active"}
        })
    else:
        conv_engine.on_speech_end()


async def handle_speech_end(client_id: str, payload: dict, conv_engine: ConversationEngine):
    """Handle speech endpoint - user stopped speaking"""
    final_transcript = payload.get('transcript', '')
    
    # Trigger endpoint detection
    should_process = conv_engine.on_speech_end(final_transcript)
    
    if should_process:
        # Process the final transcript
        text = conv_engine.flush_speech_buffer()
        if text.strip():
            logger.info(f"[Endpoint] Processing: {text[:50]}...")
            
            response = await conv_engine.generate_response(text)
            
            await manager.send_message(client_id, {
                "type": "ai_response",
                "payload": {
                    "text": response,
                    "interrupted": conv_engine.turn_context.interrupted
                }
            })


async def handle_file_upload(client_id: str, payload: dict):
    """Handle file upload from frontend"""
    filename = payload.get('filename', 'unknown')
    file_type = payload.get('type', 'unknown')
    
    logger.info(f"[Handler] 📁 File received: {filename} ({file_type})")
    
    # Send acknowledgment
    await manager.send_message(client_id, {
        "type": "file_uploaded",
        "payload": {
            "filename": filename,
            "status": "received",
            "message": f"File {filename} uploaded successfully"
        }
    })


async def handle_memory_request(client_id: str, payload: dict):
    """Handle memory/system access request"""
    logger.info(f"[Handler] 🧠 Memory request from {client_id}")
    
    # Get system memory summary
    memory_data = {
        "sessions": len(app_state['active_connections']),
        "tools": len(app_state['tool_registry'].tools) if app_state['tool_registry'] else 0,
        "status": "operational"
    }
    
    await manager.send_message(client_id, {
        "type": "memory_response",
        "payload": memory_data
    })


async def handle_history_request(client_id: str, payload: dict):
    """Handle history/search request"""
    logger.info(f"[Handler] 📜 History request from {client_id}")
    
    # Return conversation history
    history_data = {
        "recent_commands": [],
        "system_events": [
            "System initialized",
            "WebSocket connected",
            "Ready for commands"
        ]
    }
    
    await manager.send_message(client_id, {
        "type": "history_response",
        "payload": history_data
    })


async def handle_screenshot_data(client_id: str, payload: dict):
    """Handle screenshot data from desktop"""
    # Forward to observer agent
    if app_state['orchestrator']:
        await app_state['orchestrator'].handle_screenshot(
            payload.get('requestId'),
            payload.get('image')
        )


async def handle_command_complete(client_id: str, payload: dict):
    """Handle completion of system command"""
    # Update execution status
    await manager.send_message(client_id, {
        "type": "execution_status",
        "payload": {
            "type": "step_update",
            "step_id": payload.get('command'),
            "update": {
                "status": "complete" if payload.get('success') else "failed",
                "output": payload.get('result') if payload.get('success') else payload.get('error')
            }
        }
    })


async def handle_file_operation_complete(client_id: str, payload: dict):
    """Handle completion of file operation"""
    pass


@app.post("/api/execution/update")
async def execution_update(update: dict):
    """Receive execution updates from agents"""
    # Broadcast to all connected desktop clients
    await manager.broadcast({
        "type": "execution_status",
        "payload": update
    })
    return {"status": "received"}


@app.post("/api/agent/update")
async def agent_update(update: AgentUpdate):
    """Receive agent status updates"""
    await manager.broadcast({
        "type": "agent_update",
        "payload": update.dict()
    })
    return {"status": "received"}


# Browser Environment Handlers
async def handle_create_browser_environment(client_id: str, payload: dict):
    """Create a new isolated browser environment"""
    logger.info(f"[Browser] Creating new environment for {client_id}")
    
    try:
        env_id = await browser_manager.create_environment(
            name=payload.get('name'),
            headless=payload.get('headless', False),
            viewport=payload.get('viewport', {'width': 1920, 'height': 1080})
        )
        
        await manager.send_message(client_id, {
            "type": "browser_environment_created",
            "payload": {
                "env_id": env_id,
                "status": "created",
                "message": f"Browser environment {env_id} created"
            }
        })
    except Exception as e:
        logger.error(f"[Browser] Failed to create environment: {e}")
        await manager.send_message(client_id, {
            "type": "browser_environment_error",
            "payload": {"error": str(e)}
        })


async def handle_execute_in_environment(client_id: str, payload: dict):
    """Execute an action in a specific browser environment"""
    env_id = payload.get('env_id')
    action = payload.get('action')
    params = payload.get('params', {})
    
    logger.info(f"[Browser] Executing {action} in environment {env_id}")
    
    try:
        result = await browser_manager.execute_in_environment(env_id, action, params)
        
        await manager.send_message(client_id, {
            "type": "browser_action_result",
            "payload": {
                "env_id": env_id,
                "action": action,
                "result": result
            }
        })
    except Exception as e:
        logger.error(f"[Browser] Action execution failed: {e}")
        await manager.send_message(client_id, {
            "type": "browser_action_error",
            "payload": {"env_id": env_id, "action": action, "error": str(e)}
        })


async def handle_close_browser_environment(client_id: str, payload: dict):
    """Close a browser environment"""
    env_id = payload.get('env_id')
    
    logger.info(f"[Browser] Closing environment {env_id}")
    
    try:
        result = await browser_manager.close_environment(env_id)
        
        await manager.send_message(client_id, {
            "type": "browser_environment_closed",
            "payload": {
                "env_id": env_id,
                "result": result
            }
        })
    except Exception as e:
        logger.error(f"[Browser] Failed to close environment: {e}")
        await manager.send_message(client_id, {
            "type": "browser_environment_error",
            "payload": {"env_id": env_id, "error": str(e)}
        })


async def handle_get_environments(client_id: str, payload: dict):
    """Get list of all active browser environments"""
    try:
        environments = browser_manager.get_all_environments()
        
        await manager.send_message(client_id, {
            "type": "browser_environments_list",
            "payload": {"environments": environments}
        })
    except Exception as e:
        logger.error(f"[Browser] Failed to get environments: {e}")
        await manager.send_message(client_id, {
            "type": "browser_environment_error",
            "payload": {"error": str(e)}
        })


async def handle_start_screenshot_stream(client_id: str, payload: dict):
    """Start streaming screenshots from an environment"""
    env_id = payload.get('env_id')
    interval = payload.get('interval', 1.0)
    
    logger.info(f"[Browser] Starting screenshot stream for {env_id}")
    
    async def stream_callback(data: dict):
        await manager.send_message(client_id, {
            "type": "environment_screenshot",
            "payload": data
        })
    
    try:
        await browser_manager.start_screenshot_stream(env_id, stream_callback, interval)
        
        await manager.send_message(client_id, {
            "type": "screenshot_stream_started",
            "payload": {"env_id": env_id, "interval": interval}
        })
    except Exception as e:
        logger.error(f"[Browser] Failed to start stream: {e}")
        await manager.send_message(client_id, {
            "type": "screenshot_stream_error",
            "payload": {"env_id": env_id, "error": str(e)}
        })


async def handle_stop_screenshot_stream(client_id: str, payload: dict):
    """Stop streaming screenshots from an environment"""
    env_id = payload.get('env_id')
    
    logger.info(f"[Browser] Stopping screenshot stream for {env_id}")
    
    try:
        await browser_manager.stop_screenshot_stream(env_id)
        
        await manager.send_message(client_id, {
            "type": "screenshot_stream_stopped",
            "payload": {"env_id": env_id}
        })
    except Exception as e:
        logger.error(f"[Browser] Failed to stop stream: {e}")
        await manager.send_message(client_id, {
            "type": "screenshot_stream_error",
            "payload": {"env_id": env_id, "error": str(e)}
        })


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
