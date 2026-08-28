# Contributing to JARVIS

Thank you for your interest in contributing to JARVIS! This document covers everything you need to get started.

## Getting Started

### Prerequisites

- **Node.js** 18+ (we recommend 22)
- **pnpm** (install with `npm install -g pnpm`)
- **Rust** (for Tauri desktop builds — install at https://rustup.rs)
- **Git**

### Setup

```bash
# Clone the repo
git clone https://github.com/hakizajr3-glitch/J.R.R.V.I.S.git
cd J.R.R.V.I.S

# One-command install (handles everything)
./scripts/install.sh

# Start developing
jarvis dev
```

### Verify your setup

```bash
jarvis doctor
```

This checks Node.js, pnpm, Rust, dependencies, and network connectivity.

## Project Structure

```
J.R.R.V.I.S/
├── jarvis-core/          # Platform library (memory, agents, knowledge graph)
├── jarvis-tauri/         # Desktop app (Tauri + React + TypeScript)
│   ├── src/
│   │   ├── components/   # React UI components
│   │   ├── providers/    # Multi-provider AI system
│   │   ├── harnessBridge.ts
│   │   └── aiService.ts
│   └── src-tauri/        # Rust backend (shell, files, desktop automation)
├── scripts/              # Install + doctor scripts
├── docs/                 # Landing page (GitHub Pages)
└── .github/workflows/    # CI + Release workflows
```

## Development Workflow

### Running the app

```bash
cd jarvis-tauri
pnpm tauri dev
```

### Running tests

```bash
cd jarvis-core
npx vitest run
```

### Building the frontend

```bash
cd jarvis-tauri
npx vite build
```

### Type checking

```bash
cd jarvis-tauri
npx tsc --noEmit
```

## Code Style

- **TypeScript** for all frontend code
- **Rust** for Tauri backend commands
- Follow existing patterns in the codebase
- Use the existing UI component style (Tailwind + stonic theme)
- No emojis in code or commit messages unless explicitly requested
- Compact code — avoid unnecessary nesting and duplicate branches

### Commit Messages

Use clear, descriptive commit messages:

```
Add multi-provider AI support for Groq and Mistral
Fix knowledge graph entity deletion race condition
Wire CenterHub IMPORT button to file picker
```

### Pull Requests

1. Fork the repo and create a branch: `git checkout -b my-feature`
2. Make your changes
3. Run tests: `cd jarvis-core && npx vitest run`
4. Build the frontend: `cd jarvis-tauri && npx vite build`
5. Commit and push: `git push origin my-feature`
6. Open a Pull Request with a clear description of what and why

## Adding a New AI Provider

1. Add the provider definition to `jarvis-tauri/src/providers/providerRegistry.ts`
2. If the provider uses the OpenAI-compatible API format, no adapter needed — it uses the shared adapter
3. If the provider has a unique API format, add an adapter to `providerAdapters.ts`
4. Test by selecting the new provider in Settings

## Reporting Bugs

Open a [GitHub Issue](https://github.com/hakizajr3-glitch/J.R.R.V.I.S/issues) with:

1. What you expected to happen
2. What actually happened
3. Steps to reproduce
4. Your OS and JARVIS version
5. Any error messages (from the console or the app's diagnostics panel)

## Feature Requests

Open a GitHub Issue with the `enhancement` label. Describe:

1. What the feature does
2. Why it's useful
3. Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
