#!/bin/bash
# Serve the cheat sheets over plain HTTP to every device on your local network.
# Double-click this file, or run ./serve.command [port]   (default 8000).
# Ctrl-C to stop.
#
# If a browser refuses to load the page with ERR_SSL_PROTOCOL_ERROR, it is
# force-upgrading the URL to HTTPS. Use ./serve-https.command instead.

cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"

if [ ! -d node_modules ]; then
  echo "  Installing dependencies first..."
  npm ci || exit 1
fi
if [ ! -f public/index.html ]; then
  echo "  public/ is missing - building the site first..."
  npm run build:site || exit 1
fi

exec node scripts/serve.mts --port "$PORT"
