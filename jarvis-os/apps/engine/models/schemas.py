"""
Pydantic models for J.A.R.V.I.S. AI Engine
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from enum import Enum


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    COMPLETE = "complete"
    ERROR = "error"


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class PlanStatus(str, Enum):
    PLANNING = "planning"
    EXECUTING = "executing"
    COMPLETE = "complete"
    FAILED = "failed"


class UserCommand(BaseModel):
    command: str
    context: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: Literal["text", "voice"] = "text"


class ExecutionStep(BaseModel):
    id: str
    agent: str
    action: str
    params: Dict[str, Any] = Field(default_factory=dict)
    status: StepStatus = StepStatus.PENDING
    depends_on: List[str] = Field(default_factory=list)
    output: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ExecutionPlan(BaseModel):
    id: str
    goal: str
    steps: List[ExecutionStep]
    status: PlanStatus = PlanStatus.PLANNING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AgentUpdate(BaseModel):
    agent: str
    status: AgentStatus
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_id: Optional[str] = None
    step_id: Optional[str] = None


class AgentResponse(BaseModel):
    response: str
    plan_id: Optional[str] = None
    execution_plan: Optional[ExecutionPlan] = None
    confidence: float = Field(ge=0.0, le=1.0, default=0.8)
    suggestions: List[str] = Field(default_factory=list)


class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]
    required_params: List[str] = Field(default_factory=list)
    returns: str = "any"


class ToolCall(BaseModel):
    tool: str
    params: Dict[str, Any]
    call_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ToolResult(BaseModel):
    call_id: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


class MemoryEntry(BaseModel):
    id: str
    type: Literal["episodic", "semantic", "procedural"]
    content: str
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    access_count: int = 0


class SystemStatus(BaseModel):
    status: Literal["operational", "degraded", "down"]
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    active_plans: int = 0
    queue_depth: int = 0
    agents_ready: List[str] = Field(default_factory=list)


class ScreenshotData(BaseModel):
    request_id: str
    image_base64: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    analysis: Optional[str] = None


class IntentClassification(BaseModel):
    intent: str
    confidence: float
    entities: Dict[str, Any] = Field(default_factory=dict)
    suggested_tools: List[str] = Field(default_factory=list)
    complexity: Literal["low", "medium", "high"] = "medium"
    estimated_steps: int = 1


class TaskDecomposition(BaseModel):
    goal: str
    steps: List[Dict[str, Any]]
    parallel_groups: List[List[int]] = Field(default_factory=list)
    estimated_duration_seconds: Optional[int] = None
