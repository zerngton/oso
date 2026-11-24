#!/usr/bin/env node
// Builds importable n8n workflow JSON files into ./dist from:
//   - src/shared.js + src/code/*.js   (Code node sources)
//   - config.env                       (non-secret settings)
//   - an optional credentials list     (id/name/type only - never secret values)
//
// Usage: node build.mjs [--config config.env] [--creds creds.json] [--out dist]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const configPath = path.resolve(args.config || path.join(ROOT, 'config.env'));
const credsPath = args.creds ? path.resolve(args.creds) : null;
const outDir = path.resolve(args.out || path.join(ROOT, 'dist'));

// ---------------------------------------------------------------- config.env
function parseEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    env[m[1]] = v;
  }
  return env;
}
if (!fs.existsSync(configPath)) {
  console.error(`Missing ${configPath}. Copy config.example.env to config.env and fill it in.`);
  process.exit(1);
}
const env = parseEnv(configPath);
const req = (k) => {
  if (!env[k]) { console.error(`config.env: ${k} is required`); process.exit(1); }
  return env[k];
};
const num = (k, d) => (env[k] ? Number(env[k]) : d);

const CONFIG = {
  companyName: env.COMPANY_NAME || 'Washaholics',
  companyWebsite: env.COMPANY_WEBSITE || '',
  ownerEmail: req('OWNER_EMAIL'),
  fromHeader: env.FROM_EMAIL ? `${env.SENDER_NAME || env.COMPANY_NAME || ''} <${env.FROM_EMAIL}>`.trim() : '',
  senderName: env.SENDER_NAME || '',
  senderTitle: env.SENDER_TITLE || '',
  senderPhone: env.SENDER_PHONE || '',
  services: env.SERVICES || 'exterior and commercial cleaning',
  usp: env.USP || '',
  sheetId: env.SHEET_ID || 'SET_SHEET_ID_IN_CONFIG_ENV',
  dailyMax: num('DAILY_MAX', 20),
  dailyMin: num('DAILY_MIN', 10),
  minScore: num('MIN_SCORE', 60),
  candidatePool: num('CANDIDATE_POOL', 40),
  followupDays: num('FOLLOWUP_DAYS', 4),
  maxThreadsPerRun: num('MAX_THREADS_PER_RUN', 150),
  timezone: env.TIMEZONE || 'Europe/London',
  aiModel: env.AI_MODEL || 'claude-opus-5-5',
  aiEffort: env.AI_EFFORT || 'medium',
  excludeDomains: (env.EXCLUDE_DOMAINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  placesBase: env.PLACES_BASE || 'https://places.googleapis.com',
  sheetsBase: env.SHEETS_BASE || 'https://sheets.googleapis.com',
  gmailBase: env.GMAIL_BASE || 'https://gmail.googleapis.com',
  anthropicBase: env.ANTHROPIC_BASE || 'https://api.anthropic.com',
};
const CRON = {
  leadgen: env.LEADGEN_CRON || '0 8 * * *',
  replies: env.REPLY_CRON || '15 8-20/2 * * *',
  report: env.REPORT_CRON || '0 18 * * *',
};

// ---------------------------------------------------------------- credentials
const CRED = {
  sheets: { type: 'googleSheetsOAuth2Api', name: env.CRED_SHEETS || 'Washaholics - Google Sheets' },
  gmail: { type: 'gmailOAuth2', name: env.CRED_GMAIL || 'Washaholics - Gmail' },
  places: { type: 'httpHeaderAuth', name: env.CRED_PLACES || 'Washaholics - Google Places API Key' },
  anthropic: { type: 'httpHeaderAuth', name: env.CRED_ANTHROPIC || 'Washaholics - Anthropic API Key' },
};
const known = credsPath && fs.existsSync(credsPath) ? JSON.parse(fs.readFileSync(credsPath, 'utf8')) : [];
const missing = new Set();
function credRef(key) {
  const c = CRED[key];
  const hit = known.find((k) => k.name === c.name && k.type === c.type);
  if (!hit) missing.add(`${c.name}  (type: ${c.type})`);
  return hit ? { id: String(hit.id), name: c.name } : { id: '', name: c.name };
}

// ---------------------------------------------------------------- node helpers
const shared = fs.readFileSync(path.join(ROOT, 'src/shared.js'), 'utf8');
const codeSrc = (f) => fs.readFileSync(path.join(ROOT, 'src/code', f), 'utf8');
let idCounter = 0;
const WF_NUM = { s0: 1, l1: 2, r2: 3, d3: 4, e4: 5 };
const nid = (wf) => `${String(WF_NUM[wf]).padStart(8, '0')}-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

function code(wf, name, file, pos, opts = {}) {
  const body = file === 'config.js'
    ? codeSrc(file).replace('__CONFIG__', JSON.stringify(CONFIG, null, 2))
    : `const CONFIG = $('Config').first().json;\n\n${codeSrc(file)}`;
  return { id: nid(wf), name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos,
    parameters: { jsCode: `${shared}\n// ---- node logic ----\n${body}` }, ...opts };
}

function http(wf, name, pos, { method = 'POST', auth = null, url = '={{ $json.request.url }}', body = method === 'GET' ? null : '={{ JSON.stringify($json.request.body) }}',
  headers = [], full = true, format = 'json', timeout = 60000, batch = null, onError = 'continueRegularOutput', insecure = false }) {
  const p = { method, url };
  const credentials = {};
  if (auth === 'sheets' || auth === 'gmail') {
    p.authentication = 'predefinedCredentialType';
    p.nodeCredentialType = CRED[auth].type;
    credentials[CRED[auth].type] = credRef(auth);
  } else if (auth) {
    p.authentication = 'genericCredentialType';
    p.genericAuthType = 'httpHeaderAuth';
    credentials.httpHeaderAuth = credRef(auth);
  } else {
    p.authentication = 'none';
  }
  if (headers.length) { p.sendHeaders = true; p.headerParameters = { parameters: headers.map(([n, v]) => ({ name: n, value: v })) }; }
  if (body) { p.sendBody = true; p.specifyBody = 'json'; p.jsonBody = body; }
  const response = { response: { fullResponse: full, neverError: true, responseFormat: format } };
  if (format === 'text') response.response.outputPropertyName = 'data';
  p.options = { timeout, response };
  if (batch) p.options.batching = { batch: { batchSize: batch[0], batchInterval: batch[1] } };
  if (insecure) p.options.allowUnauthorizedCerts = true;
  const node = { id: nid(wf), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, parameters: p, onError };
  if (Object.keys(credentials).length) node.credentials = credentials;
  return node;
}

function ifSkip(wf, name, pos) {
  return { id: nid(wf), name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos, parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: nid(wf), leftValue: '={{ $json.skip === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    looseTypeValidation: true, options: {},
  } };
}

const schedule = (wf, name, cron, pos) => ({ id: nid(wf), name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos,
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: cron }] } } });
const manual = (wf, pos, name = 'Run Manually') => ({ id: nid(wf), name, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos, parameters: {} });
const sticky = (wf, name, content, pos, w = 420, h = 300) => ({ id: nid(wf), name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos,
  parameters: { content, width: w, height: h } });

function connect(pairs) {
  const c = {};
  for (const [from, to, outIdx = 0] of pairs) {
    c[from] = c[from] || { main: [] };
    while (c[from].main.length <= outIdx) c[from].main.push([]);
    c[from].main[outIdx].push({ node: to, type: 'main', index: 0 });
  }
  return c;
}

const IDS = { setup: 'washSetup0000000', leadgen: 'washLeadGen00001', replies: 'washReplies00002', report: 'washReport000003', errors: 'washErrors000004' };
const settings = (withError = true) => ({ executionOrder: 'v1', timezone: CONFIG.timezone, saveManualExecutions: true,
  saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', ...(withError ? { errorWorkflow: IDS.errors } : {}) });
const wfBase = (id, name, nodes, connections, s = settings()) => ({ id, name, active: false, nodes, connections, settings: s,
  pinData: {}, tags: [], meta: { templateCredsSetupCompleted: true } });

const ANTHROPIC_HEADERS = [['anthropic-version', '2026-10-21'], ['anthropic-beta', 'server-side-fallback-2026-07-01'], ['content-type', 'application/json']];
const PLACES_FIELDS = ['id', 'displayName', 'formattedAddress', 'websiteUri', 'nationalPhoneNumber', 'internationalPhoneNumber', 'rating',
  'userRatingCount', 'types', 'businessStatus', 'googleMapsUri', 'editorialSummary'].map((f) => 'places.' + f).join(',');

// ================================================================ 00 Setup
function setupWf() {
  const w = 's0';
  const nodes = [
    manual(w, [0, 0]),
    code(w, 'Config', 'config.js', [220, 0]),
    code(w, 'Build Spreadsheet', 'setup_build.js', [440, 0]),
    http(w, 'Create Spreadsheet', [660, 0], { auth: 'sheets', onError: 'stopWorkflow' }),
    code(w, 'Show Sheet ID', 'setup_result.js', [880, 0]),
    sticky(w, 'Note', '## Run once\nCreates the Google Sheet (tabs **Leads** and **Reports** with headers).\nCopy the `spreadsheetId` from the last node into `config.env` as `SHEET_ID`, then run `./install.sh` again.', [0, -260], 520, 200),
  ];
  return wfBase(IDS.setup, 'Washaholics 00 - Setup Google Sheet', nodes, connect([
    ['Run Manually', 'Config'], ['Config', 'Build Spreadsheet'], ['Build Spreadsheet', 'Create Spreadsheet'], ['Create Spreadsheet', 'Show Sheet ID'],
  ]), settings(false));
}

// ================================================================ 01 Lead generation
function leadgenWf() {
  const w = 'l1';
  const nodes = [
    schedule(w, 'Every Morning', CRON.leadgen, [0, 0]),
    manual(w, [0, 200]),
    code(w, 'Config', 'config.js', [220, 100]),
    http(w, 'Read Leads', [440, 100], { method: 'GET', auth: 'sheets', url: '={{ $json.readLeadsUrl }}', onError: 'stopWorkflow' }),
    code(w, 'Build Search Queries', 'lead_build_queries.js', [660, 100]),
    http(w, 'Google Places Search', [880, 100], { auth: 'places', headers: [['X-Goog-FieldMask', PLACES_FIELDS]], batch: [1, 300] }),
    code(w, 'Normalize & Dedupe', 'lead_normalize.js', [1100, 100]),
    http(w, 'Fetch Homepage', [1320, 100], { method: 'GET', url: '={{ $json.website }}', full: false, format: 'text', timeout: 15000, batch: [5, 200], insecure: true,
      headers: [['User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'], ['Accept', 'text/html']] }),
    code(w, 'Find Contact Page', 'lead_find_contact.js', [1540, 100]),
    http(w, 'Fetch Contact Page', [1760, 100], { method: 'GET', url: '={{ $json.contact_url }}', full: false, format: 'text', timeout: 15000, batch: [5, 200], insecure: true,
      headers: [['User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'], ['Accept', 'text/html']] }),
    code(w, 'Extract Emails', 'lead_extract.js', [1980, 100]),
    code(w, 'Build AI Requests', 'lead_build_ai.js', [2200, 100]),
    http(w, 'Claude: Qualify & Write Email', [2420, 100], { auth: 'anthropic', headers: ANTHROPIC_HEADERS, timeout: 300000, batch: [1, 500] }),
    code(w, 'Parse AI Results', 'lead_parse_ai.js', [2640, 100]),
    code(w, 'Build Draft Requests', 'lead_build_drafts.js', [2860, 100]),
    ifSkip(w, 'No Drafts?', [3080, 100]),
    http(w, 'Create Gmail Drafts', [3300, 200], { auth: 'gmail', batch: [1, 250] }),
    code(w, 'Prepare Sheet Rows', 'lead_prepare_rows.js', [3520, 100]),
    http(w, 'Append to Leads Sheet', [3740, 100], { auth: 'sheets', onError: 'stopWorkflow' }),
    sticky(w, 'Note', '## Daily lead generation\n1. Google Places finds London property managers, hotels, restaurants and commercial sites (areas rotate daily).\n2. Duplicates are removed against the whole Leads sheet (place id, domain, name+postcode).\n3. Homepage + contact page are read to find a business email.\n4. Claude scores fit (0-100) and writes a tailored email.\n5. Top leads (up to DAILY_MAX) get a **Gmail draft** - never sent automatically.\n6. Everything is logged to the Leads sheet.', [0, -320], 620, 280),
  ];
  return wfBase(IDS.leadgen, 'Washaholics 01 - Daily Lead Generation', nodes, connect([
    ['Every Morning', 'Config'], ['Run Manually', 'Config'], ['Config', 'Read Leads'], ['Read Leads', 'Build Search Queries'],
    ['Build Search Queries', 'Google Places Search'], ['Google Places Search', 'Normalize & Dedupe'], ['Normalize & Dedupe', 'Fetch Homepage'],
    ['Fetch Homepage', 'Find Contact Page'], ['Find Contact Page', 'Fetch Contact Page'], ['Fetch Contact Page', 'Extract Emails'],
    ['Extract Emails', 'Build AI Requests'], ['Build AI Requests', 'Claude: Qualify & Write Email'], ['Claude: Qualify & Write Email', 'Parse AI Results'],
    ['Parse AI Results', 'Build Draft Requests'], ['Build Draft Requests', 'No Drafts?'], ['No Drafts?', 'Prepare Sheet Rows', 0],
    ['No Drafts?', 'Create Gmail Drafts', 1], ['Create Gmail Drafts', 'Prepare Sheet Rows'], ['Prepare Sheet Rows', 'Append to Leads Sheet'],
  ]));
}

// ================================================================ 02 Reply tracker
function repliesWf() {
  const w = 'r2';
  const nodes = [
    schedule(w, 'Every 2 Hours', CRON.replies, [0, 0]),
    manual(w, [0, 200]),
    code(w, 'Config', 'config.js', [220, 100]),
    http(w, 'Read Leads', [440, 100], { method: 'GET', auth: 'sheets', url: '={{ $json.readLeadsUrl }}', onError: 'stopWorkflow' }),
    code(w, 'Select Leads To Check', 'reply_select.js', [660, 100]),
    http(w, 'Get Gmail Thread', [880, 100], { method: 'GET', auth: 'gmail', batch: [5, 300] }),
    code(w, 'Analyze Threads', 'reply_analyze.js', [1100, 100]),
    code(w, 'Build AI Requests', 'reply_build_ai.js', [1320, 100]),
    ifSkip(w, 'Nothing For AI?', [1540, 100]),
    http(w, 'Claude: Classify / Follow-up', [1760, 200], { auth: 'anthropic', headers: ANTHROPIC_HEADERS, timeout: 300000, batch: [1, 500] }),
    code(w, 'Build Reply Drafts', 'reply_build_drafts.js', [1980, 200]),
    ifSkip(w, 'No Drafts?', [2200, 200]),
    http(w, 'Create Reply Drafts', [2420, 300], { auth: 'gmail', batch: [1, 250] }),
    code(w, 'Prepare Sheet Updates', 'reply_prepare_updates.js', [2640, 100]),
    ifSkip(w, 'No Changes?', [2860, 100]),
    http(w, 'Update Leads Sheet', [3080, 200], { auth: 'sheets', onError: 'stopWorkflow' }),
    sticky(w, 'Note', '## Reply & follow-up tracker\n- Detects when you have **sent** a draft (status -> Sent).\n- Detects **replies** and bounces in the same Gmail thread; Claude classifies them (interested / question / not interested / unsubscribe / out of office).\n- Interested or question -> a **reply draft** is prepared in the thread.\n- No reply after FOLLOWUP_DAYS -> a **follow-up draft** is prepared.\nNothing is ever sent automatically.', [0, -320], 620, 260),
  ];
  return wfBase(IDS.replies, 'Washaholics 02 - Reply & Follow-up Tracker', nodes, connect([
    ['Every 2 Hours', 'Config'], ['Run Manually', 'Config'], ['Config', 'Read Leads'], ['Read Leads', 'Select Leads To Check'],
    ['Select Leads To Check', 'Get Gmail Thread'], ['Get Gmail Thread', 'Analyze Threads'], ['Analyze Threads', 'Build AI Requests'],
    ['Build AI Requests', 'Nothing For AI?'], ['Nothing For AI?', 'Prepare Sheet Updates', 0], ['Nothing For AI?', 'Claude: Classify / Follow-up', 1],
    ['Claude: Classify / Follow-up', 'Build Reply Drafts'], ['Build Reply Drafts', 'No Drafts?'], ['No Drafts?', 'Prepare Sheet Updates', 0],
    ['No Drafts?', 'Create Reply Drafts', 1], ['Create Reply Drafts', 'Prepare Sheet Updates'], ['Prepare Sheet Updates', 'No Changes?'],
    ['No Changes?', 'Update Leads Sheet', 1],
  ]));
}

// ================================================================ 03 Daily report
function reportWf() {
  const w = 'd3';
  const nodes = [
    schedule(w, 'Every Evening', CRON.report, [0, 0]),
    manual(w, [0, 200]),
    code(w, 'Config', 'config.js', [220, 100]),
    http(w, 'Read Leads', [440, 100], { method: 'GET', auth: 'sheets', url: '={{ $json.readLeadsUrl }}', onError: 'stopWorkflow' }),
    code(w, 'Compute Report', 'report_compute.js', [660, 100]),
    http(w, 'Email Report To Me', [880, 100], { auth: 'gmail', url: '={{ $json.emailRequest.url }}', body: '={{ JSON.stringify($json.emailRequest.body) }}', onError: 'stopWorkflow' }),
    http(w, 'Save To Reports Tab', [1100, 100], { auth: 'sheets', url: "={{ $('Compute Report').first().json.appendRequest.url }}",
      body: "={{ JSON.stringify($('Compute Report').first().json.appendRequest.body) }}", onError: 'stopWorkflow' }),
  ];
  return wfBase(IDS.report, 'Washaholics 03 - Daily Report', nodes, connect([
    ['Every Evening', 'Config'], ['Run Manually', 'Config'], ['Config', 'Read Leads'], ['Read Leads', 'Compute Report'],
    ['Compute Report', 'Email Report To Me'], ['Email Report To Me', 'Save To Reports Tab'],
  ]));
}

// ================================================================ 04 Error alerts
function errorsWf() {
  const w = 'e4';
  const nodes = [
    { id: nid(w), name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    code(w, 'Config', 'config.js', [220, 0]),
    code(w, 'Build Alert', 'error_alert.js', [440, 0]),
    http(w, 'Email Alert To Me', [660, 0], { auth: 'gmail', onError: 'stopWorkflow' }),
  ];
  return wfBase(IDS.errors, 'Washaholics 04 - Error Alerts', nodes, connect([
    ['Error Trigger', 'Config'], ['Config', 'Build Alert'], ['Build Alert', 'Email Alert To Me'],
  ]), settings(false));
}

// ---------------------------------------------------------------- write
fs.mkdirSync(outDir, { recursive: true });
const workflows = { '00-setup.json': setupWf(), '01-lead-generation.json': leadgenWf(), '02-reply-tracker.json': repliesWf(),
  '03-daily-report.json': reportWf(), '04-error-alerts.json': errorsWf() };
for (const [file, wf] of Object.entries(workflows)) fs.writeFileSync(path.join(outDir, file), JSON.stringify(wf, null, 2));
console.log(`Built ${Object.keys(workflows).length} workflows into ${outDir}`);
if (CONFIG.sheetId.startsWith('SET_')) console.log('Note: SHEET_ID is not set yet - run "Washaholics 00 - Setup Google Sheet" first.');
if (credsPath && missing.size) {
  console.log('\nThese credentials were not found in n8n yet (create them with exactly these names):');
  for (const m of missing) console.log('  - ' + m);
  process.exitCode = 3;
}
