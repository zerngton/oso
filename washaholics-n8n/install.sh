#!/usr/bin/env bash
# Installs / updates the Washaholics workflows in a Docker-based n8n.
# Needs only Docker on the host (build + import run inside the n8n container).
# Safe to re-run: workflows have fixed IDs, so they are updated in place.
#
#   ./install.sh                     # auto-detects the n8n container
#   N8N_CONTAINER=my-n8n ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f config.env ]; then
  cp config.example.env config.env
  echo "Created config.env - open it, fill in your details, then run ./install.sh again."
  exit 1
fi

CONTAINER="${N8N_CONTAINER:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /n8n/ {print $1; exit}')
fi
if [ -z "$CONTAINER" ]; then
  echo "Could not find a running n8n container. Start n8n, or run: N8N_CONTAINER=<name> ./install.sh"
  docker ps --format '  {{.Names}}  ({{.Image}})'
  exit 1
fi
echo "Using n8n container: $CONTAINER"

TMP=/tmp/washaholics-install
cleanup() { docker exec "$CONTAINER" rm -rf "$TMP" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker exec "$CONTAINER" sh -c "rm -rf $TMP && mkdir -p $TMP"
docker cp src "$CONTAINER:$TMP/src" >/dev/null
docker cp build.mjs "$CONTAINER:$TMP/build.mjs" >/dev/null
docker cp config.env "$CONTAINER:$TMP/config.env" >/dev/null

# Read credential IDs by name. Only id/name/type are kept; the export stays
# encrypted and is deleted immediately.
docker exec "$CONTAINER" sh -c "n8n export:credentials --all --output=$TMP/raw.json >/dev/null 2>&1 || echo '[]' > $TMP/raw.json"
docker exec "$CONTAINER" node -e "
  const fs=require('fs'); let a=[]; try { a=JSON.parse(fs.readFileSync('$TMP/raw.json','utf8')); } catch(e) {}
  fs.writeFileSync('$TMP/creds.json', JSON.stringify(a.map(c=>({id:c.id,name:c.name,type:c.type}))));
  fs.unlinkSync('$TMP/raw.json');"

set +e
docker exec "$CONTAINER" node "$TMP/build.mjs" --config "$TMP/config.env" --creds "$TMP/creds.json" --out "$TMP/dist"
BUILD=$?
set -e
if [ "$BUILD" -ne 0 ] && [ "$BUILD" -ne 3 ]; then echo "Build failed."; exit 1; fi

docker exec "$CONTAINER" n8n import:workflow --separate --input="$TMP/dist"

echo
echo "Done. Open http://localhost:5678 and look for the 'Washaholics' workflows."
if [ "$BUILD" -eq 3 ]; then
  echo "Some credentials are still missing (listed above): create them in n8n with exactly those names, then run ./install.sh again."
fi
echo "Re-importing turns workflows off: re-activate 01, 02 and 03 after each install (04 works without activation)."
