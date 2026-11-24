#!/usr/bin/env bash
# End-to-end test: runs every workflow in a throwaway local n8n against
# test/mock-server.mjs (fake Places, Sheets, Gmail, Claude and websites).
# Never touches real accounts. Needs: node 20+, and n8n (set N8N_BIN or it is installed into .n8n-test).
# The fake company websites need host entries, e.g. in /etc/hosts:
#   127.0.0.1 acme-property.test grandhotel.test bistro.test cleanco.test mall.test old.test
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
WORK="$ROOT/.n8n-test"; mkdir -p "$WORK"
PORT=4545
if [ -z "${N8N_BIN:-}" ]; then
  [ -x "$WORK/node_modules/.bin/n8n" ] || (cd "$WORK" && npm init -y >/dev/null && npm i n8n@1 >/dev/null 2>&1)
  N8N_BIN="$WORK/node_modules/.bin/n8n"
fi
export N8N_USER_FOLDER="$WORK/home" N8N_ENCRYPTION_KEY=e2e-test-key N8N_DIAGNOSTICS_ENABLED=false
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy
rm -rf "$N8N_USER_FOLDER"; mkdir -p "$N8N_USER_FOLDER"

node test/mock-server.mjs $PORT > "$WORK/mock.log" 2>&1 & MOCK=$!
trap 'kill $MOCK 2>/dev/null || true' EXIT
sleep 1
state() { curl -s --noproxy '*' "localhost:$PORT/__state"; }

cat > "$WORK/creds.json" <<'EOF'
[
 {"id":"credSheets001","name":"Washaholics - Google Sheets","type":"googleSheetsOAuth2Api","data":{"clientId":"x","clientSecret":"y","oauthTokenData":{"access_token":"tok-sheets","token_type":"Bearer","refresh_token":"r"}}},
 {"id":"credGmail0001","name":"Washaholics - Gmail","type":"gmailOAuth2","data":{"clientId":"x","clientSecret":"y","oauthTokenData":{"access_token":"tok-gmail","token_type":"Bearer","refresh_token":"r"}}},
 {"id":"credPlaces001","name":"Washaholics - Google Places API Key","type":"httpHeaderAuth","data":{"name":"X-Goog-Api-Key","value":"fake-places-key"}},
 {"id":"credAnthro001","name":"Washaholics - Anthropic API Key","type":"httpHeaderAuth","data":{"name":"x-api-key","value":"fake-anthropic-key"}}
]
EOF
"$N8N_BIN" import:credentials --input="$WORK/creds.json" >/dev/null 2>&1
"$N8N_BIN" export:credentials --all --output="$WORK/exported.json" >/dev/null 2>&1

cp config.example.env "$WORK/test.env"
sed -i.bak 's/^OWNER_EMAIL=.*/OWNER_EMAIL="owner@example.com"/' "$WORK/test.env"
for k in PLACES_BASE SHEETS_BASE GMAIL_BASE ANTHROPIC_BASE; do echo "$k=\"http://127.0.0.1:$PORT\"" >> "$WORK/test.env"; done
AI="${AI_ENABLED:-true}"
sed -i.bak "s/^AI_ENABLED=.*/AI_ENABLED=\"$AI\"/" "$WORK/test.env"
if [ "$AI" = "true" ]; then D=2; else D=3; fi   # rules also qualify the shopping centre
echo "== AI_ENABLED=$AI =="

run() { # run <workflowId>
  node build.mjs --config "$WORK/test.env" --creds "$WORK/exported.json" --out "$WORK/dist" >/dev/null
  "$N8N_BIN" import:workflow --separate --input="$WORK/dist" >/dev/null 2>&1
  "$N8N_BIN" execute --id "$1" > "$WORK/$1.out" 2>&1 || true
  grep -q '"status": "success"' "$WORK/$1.out" || { echo "FAIL: $1"; tail -40 "$WORK/$1.out"; exit 1; }
  echo "ok: $1"
}
check() { state | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const st=JSON.parse(s);const ok=($1);console.log((ok?'PASS ':'FAIL ')+process.argv[1]);if(!ok)process.exit(1)})" "$2"; }

run washSetup0000000
SID=$(state | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Object.keys(JSON.parse(s).sheets)[0]))")
sed -i.bak "s/^SHEET_ID=.*/SHEET_ID=\"$SID\"/" "$WORK/test.env"

run washLeadGen00001
ROWS="st.sheets['$SID'].Leads.slice(1).map(r=>Object.fromEntries(st.sheets['$SID'].Leads[0].map((h,i)=>[h,r[i]])))"
check "$ROWS.length===5" "5 unique leads saved (duplicate, closed and no-website places dropped)"
check "$ROWS.find(r=>r.company_name.startsWith('Acme')).email==='facilities@acme-property.test'" "best email picked"
check "$ROWS.filter(r=>r.status==='Draft Ready'&&r.draft_id&&r.thread_id).length===$D" "$D Gmail drafts created"
check "$ROWS.find(r=>r.company_name.startsWith('CleanCo')).status==='Low Fit'" "competitor disqualified"
check "st.sent.length===0" "no email sent automatically"

run washLeadGen00001
check "$ROWS.length===5" "second run adds no duplicates"

curl -s --noproxy '*' -X POST "localhost:$PORT/__control" -H 'content-type: application/json' \
  -d '{"events":[{"type":"sent","email":"facilities@acme-property.test","daysAgo":1},{"type":"reply","email":"facilities@acme-property.test"},{"type":"sent","email":"reservations@grandhotel.test","daysAgo":5}]}' >/dev/null
run washReplies00002
check "$ROWS.find(r=>r.company_name.startsWith('Acme')).status==='Replied - Interested'" "reply detected and classified"
check "$ROWS.find(r=>r.company_name.startsWith('The Grand')).status==='Follow-up Draft Ready'" "follow-up draft after FOLLOWUP_DAYS"
check "Object.keys(st.drafts).length===$((D+2))" "reply + follow-up drafts created in the threads"
run washReplies00002
check "Object.keys(st.drafts).length===$((D+2))" "re-run creates no duplicate drafts"

run washReport000003
check "st.sent.length===1 && /^To: owner@example.com/m.test(st.sent[0])" "daily report emailed to owner only"
check "st.sheets['$SID'].Reports.length===2" "report row saved"
if [ "$AI" = "true" ]; then check "st.calls.some(c=>c.path==='/v1/messages')" "Claude API used"; else check "!st.calls.some(c=>c.path==='/v1/messages')" "no Claude API calls in no-AI mode"; fi
echo "All end-to-end checks passed (AI_ENABLED=$AI)."
