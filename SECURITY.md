# Security Policy

## Supported Versions

JARVIS is under active development. Security fixes are applied to the latest release only.

| Version | Supported          |
|---------|--------------------|
| latest  | Yes                |
| older   | No — please update |

## Reporting a Vulnerability

If you discover a security vulnerability in JARVIS, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email: **security@jarvis.dev** (or send a private message via GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You will receive a response within 48 hours. If the vulnerability is confirmed, a fix will be released as soon as possible and you will be credited in the release notes (unless you prefer to remain anonymous).

## Security Architecture

JARVIS is designed with security in mind:

### Local-First
- All data (conversations, memory, agent workspaces) stays on your machine
- No telemetry, no analytics, no data sent to any server
- API keys are stored locally and never transmitted except to your chosen AI provider

### API Key Handling
- API keys are stored in the local config file (`~/.jarvis/config.json`) or localStorage
- Keys are only sent to the AI provider you select — never to any JARVIS server
- Keys are never logged, never included in error reports, never committed to git

### Desktop Automation
- Shell commands, file operations, and desktop automation (mouse/keyboard) require explicit user action
- The app does not execute commands autonomously unless you enable autonomy mode
- Autonomy levels: OBSERVE → SUGGEST → ACT → VERIFY → LEARN (you control the level)

### Sandboxed Agents
- Each AI agent runs in an isolated workspace with its own filesystem sandbox
- Agents cannot access other agents' workspaces or credentials
- Browser automation is sandboxed via Playwright

### Dependencies
- We use well-established, actively maintained dependencies
- We avoid dependencies published less than 7 days ago
- Regular dependency updates via `pnpm update`

## Best Practices for Users

1. **Use a dedicated API key** — Create a separate API key for JARVIS so you can revoke it if needed
2. **Keep JARVIS updated** — Auto-updates are enabled by default
3. **Review agent actions** — Before enabling ACT autonomy, review what agents do in SUGGEST mode
4. **Use Ollama for sensitive data** — If you work with sensitive information, use the Ollama provider to keep everything local
