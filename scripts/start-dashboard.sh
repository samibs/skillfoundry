#!/bin/bash

# Start Claude AS Dashboard

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$SCRIPT_DIR/../dashboard"
PORT="${PORT:-3000}"

cd "$DASHBOARD_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "server/node_modules" ]; then
    echo "Installing dependencies..."
    cd server
    npm install express
    cd ..
fi

# Start server
echo "Starting Claude AS Dashboard..."
echo "Access at: http://localhost:$PORT"
cd server
node index.js
