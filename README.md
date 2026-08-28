# J.A.R.V.I.S. - Just A Rather Very Intelligent System

> Your AI-powered desktop assistant. Download, open, connect your AI provider — done.

[![Website](https://img.shields.io/badge/website-jervis--app.run.place-00d4ee?style=flat-square)](https://jervis-app.run.place)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://github.com/hakizajr3-glitch/J.R.R.V.I.S/releases)
[![Release](https://img.shields.io/github/v/release/hakizajr3-glitch/J.R.R.V.I.S?style=flat-square&color=00d4ee)](https://github.com/hakizajr3-glitch/J.R.R.V.I.S/releases)
[![Tests](https://img.shields.io/badge/tests-297%20passing-00f5d4?style=flat-square)](https://github.com/hakizajr3-glitch/J.R.R.V.I.S/actions)

**Website:** [jervis-app.run.place](https://jervis-app.run.place)

J.A.R.V.I.S. is a comprehensive AI desktop assistant featuring voice interaction, autonomous task execution, multi-agent orchestration, and a beautiful HUD-style interface. It works with **any AI provider** — Gemini, OpenAI, Claude, OpenRouter, Groq, Mistral, Ollama (local), and more.

## 🚀 Quick Start (Download & Run)

### Option 1: Download the pre-built app (easiest)

> **JARVIS is currently available for macOS only.** Windows and Linux support coming soon.

1. Go to [Releases](https://github.com/hakizajr3-glitch/J.R.R.V.I.S/releases)
2. Download the `.dmg` for your Mac:
   - **Apple Silicon (M1/M2/M3/M4):** `JARVIS_aarch64-apple-darwin.dmg`
   - **Intel Macs (2020 and older):** `JARVIS_x86_64-apple-darwin.dmg`
3. Double-click the `.dmg` to open it
4. Drag **JARVIS** into your **Applications** folder
5. Open JARVIS — on first launch, macOS may say "developer not verified"
   - Right-click JARVIS → **Open** → **Open Anyway**
6. The setup wizard appears — pick your AI provider, enter your API key, click Connect
7. That's it. Start talking to JARVIS.

### Option 2: Install from source (for developers)

```bash
# One command — handles Node.js, pnpm, Rust, and all dependencies
curl -fsSL https://raw.githubusercontent.com/hakizajr3-glitch/J.R.R.V.I.S/main/scripts/install.sh | bash
```

Or clone first:

```bash
git clone https://github.com/hakizajr3-glitch/J.R.R.V.I.S.git
cd J.R.R.V.I.S
./scripts/install.sh
```

Then start the app:

```bash
jarvis          # Start in dev mode
jarvis build    # Build a production binary
jarvis doctor   # Diagnose any issues
jarvis update   # Update to the latest version
jarvis config   # Edit configuration
```

## 🔌 AI Providers

JARVIS supports **12+ AI providers**. Pick any one when you first open the app:

| Provider | Free Tier | Local | Models |
|----------|-----------|-------|--------|
| **Google Gemini** | Yes | No | Gemini 3.1 Flash, 3.5 Flash, 2.5 Pro |
| **OpenAI** | No | No | GPT-4o, GPT-4.1, o1, o3 |
| **Anthropic Claude** | No | No | Claude 3.5 Sonnet/Haiku, Claude 4, Claude 3.7 |
| **OpenRouter** | Yes | No | 200+ models (Gemini, GPT, Claude, Llama, etc.) |
| **Groq** | Yes | No | Llama 3.3 70B, Mixtral, DeepSeek R1 (ultra-fast) |
| **Mistral AI** | Yes | No | Mistral Large, Codestral, Mixtral |
| **DeepSeek** | No | No | DeepSeek V3, DeepSeek R1 |
| **Together AI** | Yes | No | Llama, Qwen, DeepSeek (hosted open-source) |
| **Fireworks AI** | Yes | No | Llama, DeepSeek (fast inference) |
| **Ollama** | Yes | Yes | Llama, Qwen, Gemma, Mistral (runs on your machine) |
| **xAI Grok** | No | No | Grok 2, Grok 3 |
| **Perplexity** | No | No | Sonar (with web search) |

### Getting an API key

- **Gemini (free):** https://aistudio.google.com/apikey
- **OpenAI:** https://platform.openai.com/api-keys
- **Anthropic:** https://console.anthropic.com/settings/keys
- **OpenRouter (free models):** https://openrouter.ai/keys
- **Groq (free):** https://console.groq.com/keys
- **Mistral (free):** https://console.mistral.ai/api-keys
- **DeepSeek:** https://platform.deepseek.com/api_keys
- **Together (free credits):** https://api.together.xyz/settings/api-keys
- **Fireworks (free credits):** https://fireworks.ai/api-keys
- **xAI:** https://console.x.ai
- **Perplexity:** https://www.perplexity.ai/settings/api
- **Ollama (local, no key):** https://ollama.com — install, then `ollama pull llama3.3`

### Switching providers

Click the **gear icon** (top right) in JARVIS → pick a new provider → enter key → Connect. Your conversation history stays.

## 🏗️ Architecture

This monorepo contains:

- **jarvis-core** — The platform library (memory engine, agent factory, knowledge graph, mission runtime, LLM orchestrator). Runs in-process in the desktop app via the browser-safe entry point.
- **jarvis-tauri** — The desktop app (Tauri + React + TypeScript). Voice interaction, HUD dashboard, multi-agent workforce, harness control center.
- **scripts/** — One-click installer, doctor diagnostics, launcher.

### Key Features

- **Multi-provider AI** — Works with 12+ AI providers, switch anytime
- **Voice interaction** — Speech-to-text + text-to-speech (browser native or ElevenLabs)
- **Multi-agent workforce** — Create specialized AI agents with departments, roles, and isolated workspaces
- **Knowledge graph** — Entity-relationship memory that agents can query
- **Harness control center** — Autonomy levels, mission management, audit logs
- **Desktop automation** — Mouse, keyboard, screen capture (via Tauri)
- **Browser control** — Playwright-based web automation
- **Local-first** — All data stays on your machine. No cloud, no telemetry.

## 📋 Prerequisites (for building from source)

- **Node.js** 18+ (the installer handles this)
- **pnpm** (the installer handles this)
- **Rust** (the installer handles this, only needed for desktop builds)
- **Git**

If you use the install script, all of these are installed automatically.

## 🛠️ Development

```bash
# Install dependencies
cd jarvis-core && pnpm install && cd ..
cd jarvis-tauri && pnpm install && cd ..

# Run in dev mode
cd jarvis-tauri && pnpm tauri dev

# Run tests
cd jarvis-core && npx vitest run

# Build for production
cd jarvis-tauri && pnpm tauri build

# Diagnose issues
./scripts/doctor.sh
```

## 📦 Publishing a Release

Releases are published automatically via GitHub Actions (macOS only for now):

1. Tag a release: `git tag v0.1.0 && git push origin v0.1.0`
2. The Release workflow builds for Apple Silicon + Intel Macs
3. Binaries (`.dmg`) + `checksums.txt` are uploaded to GitHub Releases
4. Users download the `.dmg` for their Mac and double-click to install

Or trigger manually from the Actions tab → Release → Run workflow.

## 📄 License

MIT — see [LICENSE](LICENSE)

## 🤝 Contributing

Pull requests welcome. Run `./scripts/doctor.sh` to verify your setup before developing.
