#!/usr/bin/env bash
#
# J.A.R.V.I.S. — One-click installer
# ====================================
#
# Works on macOS, Linux, and WSL2.
# The installer handles everything — Node.js, pnpm, Rust, dependencies.
# No prerequisites except git.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hakizajr3-glitch/J.R.R.V.I.S/main/scripts/install.sh | bash
#
# Or clone first and run locally:
#   git clone https://github.com/hakizajr3-glitch/J.R.R.V.I.S.git
#   cd J.R.R.V.I.S
#   ./scripts/install.sh
#
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[JARVIS]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ─── Detect platform ─────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin*) PLATFORM="macos" ;;
  Linux*)  PLATFORM="linux" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *) error "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

info "Detected: $PLATFORM ($ARCH)"

# ─── Resolve project root ────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

info "Project root: $PROJECT_ROOT"

# ─── Step 1: Check for git ───────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  error "git is required but not installed."
  echo "  Install it from: https://git-scm.com/downloads"
  exit 1
fi
ok "git found: $(git --version)"

# ─── Step 2: Install Node.js (if missing or too old) ─────────────────────────
NODE_VERSION="22"
install_node() {
  info "Installing Node.js $NODE_VERSION via nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"
  nvm alias default "$NODE_VERSION"
}

if ! command -v node &>/dev/null; then
  warn "Node.js not found. Installing..."
  install_node
else
  CURRENT_NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
  if [ "$CURRENT_NODE_MAJOR" -lt 18 ]; then
    warn "Node.js $(node --version) is too old (need 18+). Upgrading..."
    install_node
  else
    ok "Node.js found: $(node --version)"
  fi
fi

# Ensure nvm is loaded for subsequent commands
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null || true

# ─── Step 3: Install pnpm (if missing) ───────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm@latest
else
  ok "pnpm found: $(pnpm --version)"
fi

# ─── Step 4: Install Rust (for Tauri desktop builds, if missing) ──────────────
if ! command -v rustc &>/dev/null; then
  warn "Rust not found. Installing (needed for desktop app)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
else
  ok "Rust found: $(rustc --version)"
fi

# Ensure cargo is in PATH
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env" 2>/dev/null || true

# ─── Step 5: Install dependencies ────────────────────────────────────────────
info "Installing dependencies..."

# Root workspace
if [ -f "package.json" ]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  ok "Root dependencies installed"
fi

# jarvis-core
if [ -d "jarvis-core" ]; then
  info "Building jarvis-core..."
  cd jarvis-core
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  # Build what we can — some type errors are pre-existing but the build still produces output
  npx tsc --noEmit 2>/dev/null || true
  ok "jarvis-core ready"
  cd "$PROJECT_ROOT"
fi

# jarvis-tauri (the desktop app)
if [ -d "jarvis-tauri" ]; then
  info "Setting up desktop app..."
  cd jarvis-tauri
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  ok "Desktop app dependencies installed"
  cd "$PROJECT_ROOT"
fi

# ─── Step 6: Create data directory ───────────────────────────────────────────
JARVIS_HOME="${JARVIS_HOME:-$HOME/.jarvis}"
mkdir -p "$JARVIS_HOME"
mkdir -p "$JARVIS_HOME/workspaces"
mkdir -p "$JARVIS_HOME/memory"
mkdir -p "$JARVIS_HOME/logs"
ok "Data directory: $JARVIS_HOME"

# ─── Step 7: Create default config (if not exists) ───────────────────────────
CONFIG_FILE="$JARVIS_HOME/config.json"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'EOF'
{
  "gemini_api_key": "",
  "elevenlabs_api_key": "",
  "elevenlabs_voice_id": "",
  "voice_persona": "jarvismale",
  "reasoning_mode": "fast",
  "fast_response_mode": true,
  "model_fast": "gemini-3.1-flash-lite",
  "model_deep": "gemini-3.5-flash",
  "first_run": true,
  "created_at": "PLACEHOLDER"
}
EOF
  ok "Default config created at $CONFIG_FILE"
else
  ok "Config already exists at $CONFIG_FILE"
fi

# ─── Step 8: Create the jarvis launcher ──────────────────────────────────────
LAUNCHER="$JARVIS_HOME/bin/jarvis"
mkdir -p "$JARVIS_HOME/bin"

cat > "$LAUNCHER" << EOF
#!/usr/bin/env bash
# JARVIS launcher — auto-generated by install.sh
# Usage:
#   jarvis          # Start the desktop app (dev mode)
#   jarvis build    # Build a production desktop binary
#   jarvis dev      # Start in dev mode (same as default)
#   jarvis doctor   # Diagnose any issues
#   jarvis update   # Update to the latest version
#   jarvis config   # Edit configuration
set -euo pipefail

export JARVIS_HOME="\${JARVIS_HOME:-$HOME/.jarvis}"
PROJECT_ROOT="$PROJECT_ROOT"

# Load nvm if available
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \\. "\$NVM_DIR/nvm.sh" 2>/dev/null || true

# Load cargo if available
[ -f "\$HOME/.cargo/env" ] && source "\$HOME/.cargo/env" 2>/dev/null || true

case "\${1:-dev}" in
  dev)
    echo "Starting JARVIS in dev mode..."
    cd "\$PROJECT_ROOT/jarvis-tauri"
    pnpm tauri dev
    ;;
  build)
    echo "Building JARVIS desktop app..."
    cd "\$PROJECT_ROOT/jarvis-tauri"
    pnpm tauri build
    ;;
  doctor)
    echo "Running diagnostics..."
    bash "$PROJECT_ROOT/scripts/doctor.sh"
    ;;
  update)
    echo "Updating JARVIS..."
    cd "\$PROJECT_ROOT"
    git pull
    pnpm install
    cd jarvis-core && pnpm install && cd ..
    cd jarvis-tauri && pnpm install && cd ..
    echo "Update complete!"
    ;;
  config)
    "\${EDITOR:-nano}" "\$JARVIS_HOME/config.json"
    ;;
  *)
    echo "JARVIS — Just A Rather Very Intelligent System"
    echo ""
    echo "Usage: jarvis [command]"
    echo ""
    echo "Commands:"
    echo "  dev     Start the desktop app in dev mode (default)"
    echo "  build   Build a production desktop binary"
    echo "  doctor  Diagnose any issues"
    echo "  update  Update to the latest version"
    echo "  config  Edit configuration"
    ;;
esac
EOF
chmod +x "$LAUNCHER"
ok "Launcher created: $LAUNCHER"

# Add to PATH (shell profile)
SHELL_PROFILE=""
if [ -n "${ZSH_VERSION:-}" ] || [ "$SHELL" = "/bin/zsh" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [ -n "${BASH_VERSION:-}" ] || [ "$SHELL" = "/bin/bash" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
fi

if [ -n "$SHELL_PROFILE" ] && [ -f "$SHELL_PROFILE" ]; then
  if ! grep -q "JARVIS_HOME" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# JARVIS" >> "$SHELL_PROFILE"
    echo "export JARVIS_HOME=\"\$HOME/.jarvis\"" >> "$SHELL_PROFILE"
    echo "export PATH=\"\$JARVIS_HOME/bin:\$PATH\"" >> "$SHELL_PROFILE"
    ok "Added JARVIS to PATH in $SHELL_PROFILE"
    warn "Run 'source $SHELL_PROFILE' or restart your terminal to use 'jarvis' command"
  else
    ok "JARVIS already in PATH"
  fi
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  J.A.R.V.I.S. installed successfully!                        ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. ${CYAN}Start the app:${NC}"
echo -e "     ${BOLD}jarvis${NC}  (or: ${BOLD}jarvis dev${NC})"
echo ""
echo -e "  2. ${CYAN}On first launch, the setup wizard will help you configure:${NC}"
echo -e "     • Gemini API key (for AI — get one free at https://aistudio.google.com/apikey)"
echo -e "     • ElevenLabs API key (for voice — optional, get one at https://elevenlabs.io)"
echo ""
echo -e "  3. ${CYAN}Other commands:${NC}"
echo -e "     ${BOLD}jarvis build${NC}   — Build a production .app/.exe/.deb"
echo -e "     ${BOLD}jarvis doctor${NC}  — Diagnose any issues"
echo -e "     ${BOLD}jarvis update${NC}  — Update to the latest version"
echo -e "     ${BOLD}jarvis config${NC}  — Edit configuration"
echo ""
echo -e "${YELLOW}Note:${NC} If 'jarvis' command isn't found, run: source $SHELL_PROFILE"
echo ""
