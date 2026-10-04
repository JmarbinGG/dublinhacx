#!/usr/bin/env bash
# Host Banyan on your own domain through a Cloudflare Tunnel, from this machine.
#
# One-time setup (domain's nameservers must already point at Cloudflare):
#   cloudflared tunnel login                 # browser: pick the domain
#   cloudflared tunnel create banyan
#   cloudflared tunnel route dns banyan example.xyz
#
# Then each time:  ./host.sh example.xyz
# Builds the frontend, serves it + the API from one process on :8080, and
# opens the tunnel. Ctrl+C stops both. The site is down while this isn't running.
set -euo pipefail

DOMAIN="${1:?usage: ./host.sh your-domain.xyz}"
PORT="${PORT:-8080}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Building frontend for https://$DOMAIN ..."
(cd "$ROOT/frontend/react" && VITE_API_BASE_URL="https://$DOMAIN" npm run build >/dev/null)

cd "$ROOT/backend"
APP_ENV=production TRUST_PROXY=1 TRANSLATE_BACKFILL=1 CORS_ORIGINS="https://$DOMAIN,https://www.$DOMAIN" \
  python3 -m uvicorn main:app --host 127.0.0.1 --port "$PORT" --proxy-headers &
API=$!
trap 'kill $API 2>/dev/null' EXIT

echo "Live at https://$DOMAIN (Ctrl+C to stop)"
cloudflared tunnel run --protocol http2 --url "http://127.0.0.1:$PORT" banyan
