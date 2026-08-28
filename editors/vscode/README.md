# J.A.R.V.I.S. VS Code Extension

A minimal VS Code extension that connects the editor to the J.A.R.V.I.S. agent harness.

## Features

- **Open Panel**: Launch the J.A.R.V.I.S. side panel from the command palette.
- **Run on Selection**: Send the current editor selection to the J.A.R.V.I.S. gateway for agent processing.
- **Configuration**: Set the gateway WebSocket URL and API key in VS Code settings.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Press `F5` to open a new VS Code window with the extension loaded.

## Commands

- `J.A.R.V.I.S.: Open J.A.R.V.I.S. Panel`
- `J.A.R.V.I.S.: Run Agent on Selection`

## Settings

- `jarvis.gatewayUrl` — WebSocket URL of the J.A.R.V.I.S. gateway (default: `ws://localhost:18789`)
- `jarvis.apiKey` — API key for authentication

## Roadmap

- Tree view of active agent runs
- Inline chat / quick-pick agent interface
- Diff preview for agent file edits
- Approval flow for destructive actions
