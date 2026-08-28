# Stonic AI Recreation Blueprint: Master System Prompt & Architecture Specification

## Master System Prompt for Windsurf

**Goal:** Develop a local, JARVIS-style AI Desktop Agent for Windows (with future adaptability for macOS/Linux) that replicates the core functionalities and user experience of Stonic AI, as detailed in the accompanying Architecture Specification. The agent should prioritize deep operating system integration, browser automation, and a highly responsive, visually appealing user interface.

**Role:** You are an expert AI software engineer specializing in cross-platform desktop application development, AI integration, and system-level automation. Your task is to interpret the following specifications and generate the necessary code, configurations, and documentation to build the Stonic AI clone.

**Constraints & Priorities:**
*   **Local-First Operation:** The core application must run locally on the user's machine. While external LLMs can be integrated, the agent's control and data processing should primarily occur on the desktop.
*   **Performance:** Optimize for responsiveness, especially in UI interactions and automation tasks.
*   **Modularity:** Design the architecture with clear separation of concerns to allow for easy extension and maintenance.
*   **Security & Privacy:** Implement best practices for local data handling and system access.
*   **User Experience:** Emphasize a modern, intuitive, and visually engaging interface, drawing inspiration from Stonic AI's "glassmorphism" design.

## Architecture Specification

### 1. Overview
The Stonic AI clone will be a desktop application built on the Electron framework, leveraging React for the frontend UI and Node.js for the backend logic and system interactions. It will integrate with various AI models for natural language understanding, vision, and voice processing, enabling comprehensive PC control and automation.

### 2. Core Components

#### 2.1. Frontend (User Interface)
*   **Technology:** React.js with TypeScript, bundled within Electron.
*   **Styling:** Tailwind CSS for rapid UI development, with a focus on a "glassmorphism" aesthetic (translucent elements, subtle shadows, blurred backgrounds).
*   **Key UI Elements:**
    *   **Main Dashboard:** Central hub with tabs for Intelligence, Notes, Tasks, Contacts.
    *   **Intelligence Hub:** Input area for commands (voice/text), "Initialize AI" button, "Deep Reasoning" toggle.
    *   **System Transcript:** Real-time log displaying AI processes, system status, and conversation history.
    *   **Today Headlines:** Widget for news, weather, and stock updates.
    *   **Visual Intelligence Hub:** Area for displaying generated diagrams (e.g., mind maps).
    *   **Integrated Media Player:** For streaming music and YouTube videos.
    *   **Update System:** UI element for checking and applying updates.

#### 2.2. Backend (Electron Main Process & Node.js)
*   **Technology:** Node.js, running as the Electron main process.
*   **Responsibilities:**
    *   **IPC Communication:** Handle inter-process communication between the React renderer process and native system modules.
    *   **OS Integration Layer:** Interface with the operating system for file management, application control, and system settings.
    *   **Browser Automation Module:** Control a headless or visible browser instance (e.g., using Playwright or Puppeteer).
    *   **AI Orchestration:** Manage calls to various AI services (LLMs, vision, speech).
    *   **Data Persistence:** Handle local storage of user preferences, memory bank, and conversation history.

#### 2.3. AI Core & Services
*   **Natural Language Understanding (NLU) & Generation (NLG):**
    *   **Primary LLM:** Integration with an external, high-performance LLM (e.g., OpenAI GPT series, Gemini) via API for complex reasoning and conversational capabilities.
    *   **Local LLM (Optional/Fallback):** Consider integrating a lightweight local LLM (e.g., via Ollama) for basic commands and offline functionality.
*   **Voice Processing:**
    *   **Speech-to-Text (STT):** Utilize native OS STT capabilities or a robust library (e.g., Vosk, Web Speech API).
    *   **Text-to-Speech (TTS):** Utilize native OS TTS capabilities or a high-quality library for natural-sounding responses.
*   **Vision (Screen Awareness & Object Recognition):**
    *   **Screen Capture:** Implement functionality to capture screenshots of the active window or entire desktop.
    *   **Image Analysis:** Use a vision-enabled LLM or a dedicated image recognition library to interpret screen content and camera feeds (for object recognition).
*   **Memory Bank:** A persistent storage mechanism (e.g., SQLite, local JSON files) to store user preferences, past interactions, and learned behaviors for personalized responses.

#### 2.4. System Interaction Modules
*   **File System Module:** Node.js `fs` module for creating, reading, updating, and deleting files and directories.
*   **Process/Application Control Module:** Utilize Node.js `child_process` or platform-specific APIs to launch, manage, and close applications.
*   **Browser Automation Module:** Integrate Playwright or Puppeteer to control a browser instance for web navigation, form filling, data extraction, and web-based task automation.
*   **Messaging Integration:** Implement APIs for popular messaging platforms (e.g., WhatsApp Web API) to send and receive messages.

### 3. Data Flow & Interaction Model
1.  **User Input:** Voice command (STT) or text input from the UI.
2.  **NLU Processing:** Input sent to the AI Core (LLM) for intent recognition and entity extraction.
3.  **Action Planning:** Based on the NLU output and context from the Memory Bank, the AI Core determines the appropriate action (e.g., open an app, browse a website, create a file).
4.  **Tool Execution:** The Backend orchestrates the execution of relevant System Interaction Modules (File System, Browser Automation, etc.).
5.  **Feedback & Output:** Results of the action (e.g., confirmation, data extracted, visual output) are processed by the AI Core (NLG) and displayed in the UI (System Transcript, Visual Intelligence Hub) and/or spoken (TTS).
6.  **Screen Awareness Loop:** Continuously capture screen content (or on demand) for the Vision module to provide real-time context to the AI Core.

### 4. Development Environment & Tools
*   **IDE:** Windsurf (or any compatible AI-powered IDE).
*   **Version Control:** Git.
*   **Package Manager:** npm or yarn.
*   **Testing:** Jest/React Testing Library for frontend, Mocha/Chai for backend.

### 5. Key Distinctions from OpenClaw (as per Stonic AI's positioning)
*   **Integrated UI:** Stonic AI emphasizes a rich, visually appealing desktop interface, whereas OpenClaw is more focused on a command-line or messaging-app-driven gateway.
*   **Product-Oriented:** Stonic AI is presented as a ready-to-ship product architecture, while OpenClaw is an open-source framework for hobbyists.
*   **Direct System Control:** Stonic AI highlights deep OS integration and direct control, offering a more unified desktop experience.

This blueprint provides a high-level guide. The next phase will detail the step-by-step implementation process, including specific code examples and configurations, tailored for an AI-powered development environment like Windsurf.
