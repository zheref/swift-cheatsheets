#!/bin/bash
# Serve the cheat sheets over HTTPS with a throwaway self-signed certificate.
# Use this when a browser refuses plain HTTP (ERR_SSL_PROTOCOL_ERROR) because
# it force-upgrades every address to HTTPS.
#
# Double-click this file, or run ./serve-https.command [port]  (default 8443).
# Ctrl-C to stop.

cd "$(dirname "$0")" || exit 1
PORT="${1:-8443}"
CERT_DIR=".localcert"

if [ ! -d node_modules ]; then
  echo "  Installing dependencies first..."
  npm ci || exit 1
fi
if [ ! -f public/index.html ]; then
  echo "  public/ is missing - building the site first..."
  npm run build:site || exit 1
fi

# ---- find this Mac's LAN address -----------------------------------------
IP=""
for iface in en0 en1 en2 bridge100; do
  candidate="$(ipconfig getifaddr "$iface" 2>/dev/null)"
  if [ -n "$candidate" ]; then IP="$candidate"; break; fi
done
[ -z "$IP" ] && IP="$(ifconfig 2>/dev/null | awk '/inet /&&$2!="127.0.0.1"{print $2; exit}')"
[ -z "$IP" ] && IP="127.0.0.1"

# ---- certificate valid for that IP (regenerated when the IP changes) ------
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/cert.pem" ] || [ "$(cat "$CERT_DIR/ip" 2>/dev/null)" != "$IP" ]; then
  echo "  Generating a self-signed certificate for $IP ..."
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -subj "/CN=$IP" -addext "subjectAltName=IP:$IP" >/dev/null 2>&1 \
  || openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
       -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
       -subj "/CN=$IP" >/dev/null 2>&1
  printf '%s' "$IP" > "$CERT_DIR/ip"
fi

echo "  The certificate is self-signed, so the first visit warns:"
echo "    Safari : Show Details -> visit this website"
echo "    Chrome : Advanced -> Proceed"

exec node scripts/serve.mts --port "$PORT" --lan "$IP" --cert "$CERT_DIR/cert.pem" --key "$CERT_DIR/key.pem"
