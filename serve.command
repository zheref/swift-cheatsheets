#!/bin/bash
# Serve the cheat sheets over plain HTTP to every device on your local network.
# Double-click this file, or run ./serve.command [port]   (default 8000).
# Ctrl-C to stop.
#
# If a browser refuses to load the page with ERR_SSL_PROTOCOL_ERROR, it is
# force-upgrading the URL to HTTPS. Use ./serve-https.command instead.

cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"

if [ ! -f index.html ]; then
  echo "  index.html is missing - building it first..."
  python3 src/build.py || exit 1
fi

# First non-loopback IPv4 address across the usual interfaces.
IP=""
for iface in en0 en1 en2 bridge100; do
  candidate="$(ipconfig getifaddr "$iface" 2>/dev/null)"
  if [ -n "$candidate" ]; then IP="$candidate"; break; fi
done
[ -z "$IP" ] && IP="$(ifconfig 2>/dev/null | awk '/inet /&&$2!="127.0.0.1"{print $2; exit}')"
[ -z "$IP" ] && IP="127.0.0.1"

echo ""
echo "  Swift Interview Cheat Sheets  (HTTP)"
echo "  ---------------------------------------------------------"
echo "  This Mac : http://localhost:$PORT/"
echo "  iPad etc : http://$IP:$PORT/"
echo "  ---------------------------------------------------------"
echo "  Type the http:// prefix explicitly on the other device."
echo "  Same Wi-Fi network required. Ctrl-C to stop."
echo ""

exec python3 -m http.server "$PORT" --bind 0.0.0.0
