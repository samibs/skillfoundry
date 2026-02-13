#!/bin/bash

# Start Observability Trace Viewer

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBSERVABILITY_DIR="$SCRIPT_DIR/../observability"
PORT="${PORT:-3001}"

cd "$OBSERVABILITY_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start server
echo "Starting Observability Trace Viewer..."
echo "Access at: http://localhost:$PORT"
PORT=$PORT node trace-viewer-server.js
