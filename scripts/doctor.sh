#!/usr/bin/env bash
#
# JARVIS Doctor — Diagnose any issues with your JARVIS installation.
#
# Usage: jarvis doctor
#        ./scripts/doctor.sh
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }

echo -e "${BOLD}${CYAN}JARVIS Doctor${NC} — Diagnosing your installation..."
echo ""

# ─── Node.js ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}Node.js${NC}"
if command -v node &>/dev/null; then
  VERSION=$(node --version)
  MAJOR=$(echo "$VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$MAJOR" -ge 18 ]; then
    pass "Node.js $VERSION"
  else
    fail "Node.js $VERSION is too old (need 18+)"
    info "Run: nvm install 22"
  fi
else
  fail "Node.js not installed"
  info "Run: curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install 22"
fi
echo ""

# ─── pnpm ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}Package Manager${NC}"
if command -v pnpm &>/dev/null; then
  pass "pnpm $(pnpm --version)"
else
  fail "pnpm not installed"
  info "Run: npm install -g pnpm"
fi
echo ""

# ─── Rust (for desktop builds) ───────────────────────────────────────────────
echo -e "${BOLD}Rust (for desktop builds)${NC}"
if command -v rustc &>/dev/null; then
  pass "Rust $(rustc --version)"
else
  warn "Rust not installed (only needed for building from source)"
  info "Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi
echo ""

# ─── Project structure ──────────────────────────────────────────────────────
echo -e "${BOLD}Project Structure${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "$PROJECT_ROOT/jarvis-core" ]; then
  pass "jarvis-core/ found"
else
  fail "jarvis-core/ not found"
fi

if [ -d "$PROJECT_ROOT/jarvis-tauri" ]; then
  pass "jarvis-tauri/ found"
else
  fail "jarvis-tauri/ not found"
fi

if [ -f "$PROJECT_ROOT/jarvis-tauri/src-tauri/tauri.conf.json" ]; then
  pass "Tauri config found"
else
  fail "Tauri config not found"
fi
echo ""

# ─── Dependencies ────────────────────────────────────────────────────────────
echo -e "${BOLD}Dependencies${NC}"
if [ -d "$PROJECT_ROOT/jarvis-core/node_modules" ]; then
  pass "jarvis-core dependencies installed"
else
  fail "jarvis-core dependencies not installed"
  info "Run: cd jarvis-core && pnpm install"
fi

if [ -d "$PROJECT_ROOT/jarvis-tauri/node_modules" ]; then
  pass "jarvis-tauri dependencies installed"
else
  fail "jarvis-tauri dependencies not installed"
  info "Run: cd jarvis-tauri && pnpm install"
fi
echo ""

# ─── JARVIS config ───────────────────────────────────────────────────────────
echo -e "${BOLD}JARVIS Configuration${NC}"
JARVIS_HOME="${JARVIS_HOME:-$HOME/.jarvis}"
if [ -d "$JARVIS_HOME" ]; then
  pass "JARVIS home: $JARVIS_HOME"
else
  warn "JARVIS home not created yet ($JARVIS_HOME)"
  info "This is normal if you haven't run the app yet"
fi

if [ -f "$JARVIS_HOME/config.json" ]; then
  pass "Config file exists"
  # Check if a provider is configured
  if command -v node &>/dev/null; then
    HAS_KEY=$(node -e "
      try {
        const cfg = require('$JARVIS_HOME/config.json');
        if (cfg.gemini_api_key && cfg.gemini_api_key.length > 0) {
          console.log('yes');
        } else {
          console.log('no');
        }
      } catch { console.log('no'); }
    " 2>/dev/null || echo "no")
    if [ "$HAS_KEY" = "yes" ]; then
      pass "API key configured"
    else
      warn "No API key configured — the setup wizard will show on first launch"
    fi
  fi
else
  warn "No config file — the setup wizard will show on first launch"
fi
echo ""

# ─── Launcher ────────────────────────────────────────────────────────────────
echo -e "${BOLD}Launcher${NC}"
if [ -f "$JARVIS_HOME/bin/jarvis" ]; then
  pass "jarvis command installed"
else
  warn "jarvis command not installed"
  info "Run: ./scripts/install.sh"
fi

# Check if it's in PATH
if command -v jarvis &>/dev/null; then
  pass "jarvis is in PATH"
else
  warn "jarvis is not in PATH"
  if [ -n "${ZSH_VERSION:-}" ]; then
    info "Run: source ~/.zshrc"
  else
    info "Run: source ~/.bashrc"
  fi
fi
echo ""

# ─── Network connectivity ────────────────────────────────────────────────────
echo -e "${BOLD}Network${NC}"
if ping -c 1 -t 3 google.com &>/dev/null 2>&1; then
  pass "Internet connection"
else
  fail "No internet connection"
fi

# Check if Gemini API is reachable (the default provider)
if curl -s --max-time 5 https://generativelanguage.googleapis.com &>/dev/null 2>&1; then
  pass "Gemini API reachable"
else
  warn "Gemini API not reachable (you may be behind a firewall)"
fi
echo ""

# ─── Summary ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}Diagnosis complete.${NC}"
echo ""
echo -e "If everything has ${GREEN}✓${NC}, you're ready to go:"
echo -e "  ${BOLD}jarvis${NC}  — Start the app"
echo ""
echo -e "If you see ${YELLOW}!${NC} warnings, they're optional but recommended."
echo -e "If you see ${RED}✗${NC} errors, fix them before running the app."
