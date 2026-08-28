# J.A.R.V.I.S. OS - Autonomous Desktop Agent System

> "Your computer runs itself."

J.A.R.V.I.S. OS is a **category-defining autonomous desktop operating system layer** that goes beyond traditional AI assistants. It features a **multi-agent orchestration architecture** where specialized agents work together to understand, plan, execute, and learn from every task.

## Architecture Overview

```
User Command
   ↓
Commander Agent (Intent Understanding)
   ↓
Planner Agent (Task Decomposition)
   ↓
Execution Agents (Parallel)
   ├─ File Agent
   ├─ Browser Agent (Playwright)
   ├─ System Agent
   └─ Communication Agent
   ↓
Observer Agent (State Monitoring)
   ↓
Memory Agent (Learning & Context)
   ↓
Reflection Agent (Self-Improvement)
   ↓
Response Synthesis
```

## Key Differentiators

| Feature | Traditional Assistants | J.A.R.V.I.S. OS |
|---------|------------------------|-----------------|
| Architecture | Single-pass LLM | Multi-agent orchestration |
| Execution | Sequential | Parallel with dependency graph |
| Awareness | Reactive | Proactive with Observer Agent |
| Learning | Basic preferences | Full episodic + semantic memory |
| Planning | None | Automatic task decomposition |
| Recovery | Manual | Self-healing with retry logic |
| Extensibility | Hard-coded | Dynamic Tool Registry |

## Tech Stack

- **Frontend**: Electron + React + TypeScript + Tailwind CSS
- **Backend**: Python FastAPI with WebSocket support
- **Browser Automation**: Playwright
- **AI Integration**: OpenAI GPT-4 (configurable)
- **Memory**: SQLite + ChromaDB (vector store)
- **Communication**: WebSocket real-time bridge

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+
- Playwright browsers: `npx playwright install`

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/jarvis-os.git
cd jarvis-os

# Install Node.js dependencies
npm run setup

# Install Python dependencies
npm run setup:engine

# Configure environment
cp apps/engine/.env.example apps/engine/.env
# Edit .env with your OpenAI API key
```

### Running Development Mode

```bash
# Start both desktop app and AI engine
npm run dev

# Or start individually:
npm run dev:engine  # Python AI Engine on port 8000
npm run dev:desktop # Electron app
```

### Building for Production

```bash
npm run build
```

## Project Structure

```
jarvis-os/
├── apps/
│   ├── desktop/          # Electron + React UI
│   │   ├── src/
│   │   │   ├── components/   # UI components
│   │   │   ├── main.ts         # Electron main process
│   │   │   └── preload.ts      # IPC bridge
│   │   └── package.json
│   └── engine/           # Python AI Core
│       ├── agents/             # Agent implementations
│       │   ├── commander.py    # Intent parsing
│       │   ├── planner.py      # Task decomposition
│       │   ├── observer.py     # State monitoring
│       │   ├── memory.py       # Learning
│       │   ├── reflection.py   # Self-improvement
│       │   └── executor/       # Tool agents
│       ├── core/              # Core systems
│       ├── models/            # Pydantic schemas
│       └── memory/            # Storage layers
└── README.md
```

## The Six Core Agents

### 1. Commander Agent
Parses natural language commands and classifies intent. Extracts entities and determines task complexity.

### 2. Planner Agent
Decomposes complex tasks into executable steps, identifies dependencies, and creates execution graphs.

### 3. Execution Agents
Specialized agents for specific domains:
- **File Agent**: File system operations
- **Browser Agent**: Web automation via Playwright
- **System Agent**: OS-level operations
- **Communication Agent**: Email, messaging, notifications

### 4. Observer Agent (🔥 Key Differentiator)
Monitors execution in real-time through screenshots and state tracking. Detects errors and completion automatically.

### 5. Memory Agent
Stores episodic (experiences), semantic (knowledge), and procedural (workflows) memories for personalization.

### 6. Reflection Agent
Reviews executions, identifies optimization opportunities, and updates strategies for future improvements.

## Usage Examples

### Simple Commands
```
"Create a new file called notes.txt with my ideas"
"Open Chrome and search for AI automation tools"
"Organize my Downloads folder by file type"
```

### Complex Workflows
```
"Research the top 10 AI companies and create a spreadsheet"
→ Commander identifies multi-step intent
→ Planner creates: search → extract → create spreadsheet → populate
→ Browser Agent searches and extracts
→ File Agent creates spreadsheet
→ All execute in parallel where possible
```

### Learning System
```
"Create my weekly report"
→ Memory retrieves: "Weekly report = Analytics export + CRM data + Slack summary"
→ Executes learned workflow automatically
```

## Configuration

### Environment Variables

Create `apps/engine/.env`:

```env
OPENAI_API_KEY=your_key_here
DEFAULT_LLM_MODEL=gpt-4
ENABLE_SCREENSHOTS=true
MEMORY_DB_PATH=./memory.db
```

### Custom Tools

Add new tools to `apps/engine/core/tool_registry.py`:

```python
self.register(Tool(
    name="my_custom_tool",
    description="What it does",
    parameters={"input": {"type": "string"}},
    required_params=["input"],
    handler=self._my_handler,
    category="custom"
))
```

## Business Applications

J.A.R.V.I.S. OS is designed for:

- **AI Agencies**: White-label for clients
- **Solopreneurs**: Personal automation
- **Enterprises**: Department-specific deployments

### Vertical Specializations
- Real Estate Agent OS
- E-commerce Operator OS
- Marketing Agency OS
- Content Creator OS

## License

MIT License - See LICENSE file for details.

---

Built with the vision: **"Your computer runs itself."**
