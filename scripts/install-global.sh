#!/usr/bin/env bash
set -euo pipefail

# SkillFoundry Global Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/samibs/skillfoundry/main/scripts/install-global.sh | bash
# Flags: --verbose    Show every command
#        --allow-root Allow running as root (not recommended)

REQUIRED_NODE_MAJOR=20
VERBOSE=0
ALLOW_ROOT=0

# Exit codes
EXIT_SUCCESS=0
EXIT_MISSING_NODE=1
EXIT_MISSING_NPM=2
EXIT_INSTALL_FAILED=3

# --- Parse arguments ---
for arg in "$@"; do
  case "$arg" in
    --verbose) VERBOSE=1 ;;
    --allow-root) ALLOW_ROOT=1 ;;
    --help|-h)
      echo "SkillFoundry Global Installer"
      echo ""
      echo "Usage:"
      echo "  curl -fsSL https://raw.githubusercontent.com/samibs/skillfoundry/main/scripts/install-global.sh | bash"
      echo "  ./install-global.sh [--verbose] [--allow-root]"
      echo ""
      echo "Flags:"
      echo "  --verbose      Show every command being executed"
      echo "  --allow-root   Allow running as root (not recommended)"
      echo ""
      echo "Exit codes:"
      echo "  0  Success"
      echo "  1  Node.js >= ${REQUIRED_NODE_MAJOR} not found"
      echo "  2  npm not found"
      echo "  3  Installation failed"
      exit $EXIT_SUCCESS
      ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

# --- Verbose mode ---
if [ "$VERBOSE" -eq 1 ]; then
  set -x
fi

# --- Helpers ---
info()  { echo "[skillfoundry] $*"; }
error() { echo "[skillfoundry] ERROR: $*" >&2; }
warn()  { echo "[skillfoundry] WARNING: $*" >&2; }

# --- Root check ---
if [ "$(id -u)" -eq 0 ] && [ "$ALLOW_ROOT" -eq 0 ]; then
  error "Do not run this installer as root."
  error "npm global installs should use your user account."
  error "If you must run as root, pass --allow-root"
  exit $EXIT_INSTALL_FAILED
fi

# --- Detect OS and architecture ---
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  info "Detected OS: Linux ($ARCH)" ;;
  Darwin) info "Detected OS: macOS ($ARCH)" ;;
  *)
    error "Unsupported OS: $OS"
    error "This installer supports Linux and macOS only."
    error "For Windows, use: npm install -g skillfoundry"
    exit $EXIT_INSTALL_FAILED
    ;;
esac

# --- Check Node.js ---
if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  error "SkillFoundry requires Node.js >= ${REQUIRED_NODE_MAJOR}."
  error ""
  error "Install Node.js:"
  error "  macOS:   brew install node@${REQUIRED_NODE_MAJOR}"
  error "  Linux:   https://nodejs.org/en/download/"
  error "  nvm:     nvm install ${REQUIRED_NODE_MAJOR}"
  exit $EXIT_MISSING_NODE
fi

NODE_VERSION="$(node --version)"
NODE_MAJOR="$(echo "$NODE_VERSION" | sed 's/^v//' | cut -d. -f1)"

if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  error "Node.js ${NODE_VERSION} is too old."
  error "SkillFoundry requires Node.js >= ${REQUIRED_NODE_MAJOR}."
  error ""
  error "Upgrade Node.js:"
  error "  nvm:     nvm install ${REQUIRED_NODE_MAJOR}"
  error "  brew:    brew upgrade node"
  error "  manual:  https://nodejs.org/en/download/"
  exit $EXIT_MISSING_NODE
fi

info "Node.js ${NODE_VERSION} detected (>= ${REQUIRED_NODE_MAJOR} required)"

# --- Check npm ---
if ! command -v npm &>/dev/null; then
  error "npm is not installed."
  error "npm is required to install SkillFoundry."
  error ""
  error "npm is bundled with Node.js. If Node.js is installed but npm is missing:"
  error "  Try reinstalling Node.js from https://nodejs.org/"
  exit $EXIT_MISSING_NPM
fi

NPM_VERSION="$(npm --version)"
info "npm ${NPM_VERSION} detected"

# --- Pre-install summary ---
echo ""
info "=== SkillFoundry Global Install ==="
info ""
info "  Command:  npm install -g skillfoundry"
info "  Node:     ${NODE_VERSION}"
info "  npm:      ${NPM_VERSION}"
info "  OS:       ${OS} (${ARCH})"
info ""
info "This will install the 'skillfoundry' and 'sf' commands globally."
echo ""

# --- Install ---
info "Installing skillfoundry via npm..."

if ! npm install -g skillfoundry --registry https://registry.npmjs.org 2>&1; then
  echo ""
  error "Installation failed."
  error ""
  error "Common fixes:"
  error "  EACCES (permission denied):"
  error "    Option 1: npm config set prefix ~/.npm-global"
  error "              Then add ~/.npm-global/bin to your PATH"
  error "    Option 2: Use nvm (manages permissions automatically)"
  error "    Option 3: sudo npm install -g skillfoundry (not recommended)"
  error ""
  error "  ENOENT / network errors:"
  error "    Check your internet connection and npm registry access."
  error "    npm config get registry  (should be https://registry.npmjs.org/)"
  exit $EXIT_INSTALL_FAILED
fi

# --- Verify installation ---
echo ""
if command -v skillfoundry &>/dev/null; then
  INSTALLED_VERSION="$(skillfoundry --version 2>/dev/null || echo "unknown")"
  info "SkillFoundry installed successfully!"
  info "  Version: ${INSTALLED_VERSION}"
  info ""
  info "Get started:"
  info "  cd your-project"
  info "  skillfoundry init"
  info ""
  info "Or use the short alias:"
  info "  sf init"
  exit $EXIT_SUCCESS
else
  warn "Installation completed but 'skillfoundry' is not in PATH."
  warn ""
  warn "npm global bin directory may not be in your PATH."
  warn "Check with: npm config get prefix"
  warn "Then add <prefix>/bin to your PATH."
  warn ""
  warn "Example (add to ~/.bashrc or ~/.zshrc):"
  NPM_PREFIX="$(npm config get prefix 2>/dev/null || echo '$HOME/.npm-global')"
  warn "  export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
  exit $EXIT_SUCCESS
fi
