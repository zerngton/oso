// ---------------------------------------------------------------------------
// Shared helpers. build.mjs prepends this file to every Code node, so each
// node stays self-contained inside n8n (Code nodes cannot import local files).
// ---------------------------------------------------------------------------

const LEAD_COLUMNS = [
  'lead_id', 'date_found', 'company_name', 'segment', 'address', 'area', 'phone',
  'website', 'domain', 'email', 'email_source', 'google_rating', 'review_count',
  'google_maps_url', 'relevance_score', 'priority', 'fit_reasoning',
  'recommended_services', 'decision_maker_role', 'personalization_hook',
  'email_subject', 'email_body', 'status', 'draft_id', 'thread_id',
  'draft_created_at', 'sent_at', 'replied_at', 'reply_message_id',
  'reply_category', 'reply_summary', 'followup_draft_id', 'followup_created_at',
  'last_checked_at', 'search_query', 'place_id', 'notes',
];

const REPORT_COLUMNS = [
  'date', 'generated_at', 'found_today', 'qualified_today', 'drafts_today',
  'sent_today', 'replies_today', 'interested_today', 'pending_drafts',
  'total_leads', 'total_sent', 'total_replies', 'reply_rate', 'summary',
];

const STATUS = {
  LOW_FIT: 'Low Fit',
  BACKLOG: 'Qualified - Backlog',
  NO_EMAIL: 'Qualified - No Email',
  DRAFT_READY: 'Draft Ready',
  SENT: 'Sent',
  FOLLOWUP_READY: 'Follow-up Draft Ready',
  FOLLOWUP_SENT: 'Follow-up Sent',
  INTERESTED: 'Replied - Interested',
  QUESTION: 'Replied - Question',
  NOT_INTERESTED: 'Replied - Not Interested',
  OOO: 'Replied - Out of Office',
  REPLIED_OTHER: 'Replied - Other',
  DO_NOT_CONTACT: 'Do Not Contact',
  BOUNCED: 'Bounced',
  DRAFT_DELETED: 'Draft Deleted',
  ERROR: 'Error',
};

function colLetter(n) { // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// URL helpers that do not rely on the URL global (not available in every n8n sandbox).
function splitUrl(url) {
  const m = String(url || '').trim().match(/^(https?:)?\/\/([^/?#:]+)(:\d+)?([^?#]*)/i) || String('https://' + String(url || '').trim()).match(/^(https?:)\/\/([^/?#:]+)(:\d+)?([^?#]*)/i);
  if (!m || !m[2] || !/\./.test(m[2]) && m[2] !== 'localhost') return null;
  return { protocol: (m[1] || 'https:').toLowerCase(), host: m[2].toLowerCase(), port: m[3] || '', path: m[4] || '/' };
}

function normDomain(url) {
  const u = splitUrl(url);
  return u ? u.host.replace(/^www\./, '') : '';
}

function resolveUrl(href, base) {
  href = String(href || '').trim();
  const b = splitUrl(base);
  if (!b) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (/^\/\//.test(href)) return b.protocol + href;
  const origin = b.protocol + '//' + b.host + b.port;
  if (href.startsWith('/')) return origin + href;
  const dir = b.path.replace(/[^/]*$/, '') || '/';
  return origin + dir + href.replace(/^\.\//, '');
}

function normName(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|llp|plc|uk|london|the|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function postcodeOf(address) {
  const m = String(address || '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? m[1] + ' ' + m[2] : '';
}

function areaOf(address) {
  const pc = postcodeOf(address);
  return pc ? pc.split(' ')[0] : '';
}

// Google Sheets values.get response -> array of row objects (with _row = sheet row number)
function rowsFromValues(values) {
  if (!Array.isArray(values) || values.length === 0) return { header: LEAD_COLUMNS.slice(), rows: [] };
  const header = values[0].map((h) => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    if (r.every((c) => c === '' || c == null)) continue;
    const o = { _row: i + 1 };
    header.forEach((h, j) => { if (h) o[h] = r[j] == null ? '' : r[j]; });
    rows.push(o);
  }
  return { header, rows };
}

function rowToValues(obj, header) {
  return header.map((h) => {
    const v = obj[h];
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

function tzDate(d, tz) { // YYYY-MM-DD in the given timezone
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

function daysBetween(isoA, isoB) {
  return (new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000;
}

function b64url(str) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  if (!s) return '';
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function encodeHeader(s) {
  s = String(s || '').replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

function safeHeaderValue(s) { return String(s || '').replace(/[\r\n]+/g, ' ').trim(); }

// Build an RFC 2822 message and return the base64url "raw" string Gmail expects.
function buildRawEmail({ to, from, subject, text, html, inReplyTo, references }) {
  const lines = [];
  if (from) lines.push('From: ' + safeHeaderValue(from));
  lines.push('To: ' + safeHeaderValue(to));
  lines.push('Subject: ' + encodeHeader(subject));
  if (inReplyTo) lines.push('In-Reply-To: ' + safeHeaderValue(inReplyTo));
  if (references) lines.push('References: ' + safeHeaderValue(references));
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: ' + (html ? 'text/html' : 'text/plain') + '; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  const body = Buffer.from(html || text || '', 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  lines.push(body);
  return b64url(lines.join('\r\n'));
}

function signature(CONFIG) {
  return ['', 'Best regards,', CONFIG.senderName, CONFIG.senderTitle, CONFIG.companyName,
    CONFIG.senderPhone, CONFIG.companyWebsite].filter((x) => x !== undefined && x !== null && x !== '').join('\n')
    .replace(/^\n?/, '\n');
}

// Claude Messages API request body (structured JSON output).
function claudeBody(CONFIG, system, user, schema, maxTokens) {
  return {
    model: CONFIG.aiModel,
    max_tokens: maxTokens || 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: CONFIG.aiEffort || 'medium', format: { type: 'json_schema', schema } },
    fallbacks: 'default',
  };
}

// Parse an HTTP Request node "full response" from the Claude API.
function parseClaude(resp) {
  if (!resp) return { ok: false, error: 'no response' };
  if (resp.error && !resp.statusCode) return { ok: false, error: String(resp.error.message || resp.error) };
  let body = resp.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return { ok: false, error: 'invalid JSON from API' }; } }
  if (resp.statusCode && resp.statusCode >= 400) {
    return { ok: false, error: 'HTTP ' + resp.statusCode + ': ' + ((body && body.error && body.error.message) || '') };
  }
  if (!body || !Array.isArray(body.content)) return { ok: false, error: 'unexpected API response' };
  if (body.stop_reason === 'refusal') return { ok: false, error: 'model declined the request' };
  if (body.stop_reason === 'max_tokens') return { ok: false, error: 'response truncated (max_tokens)' };
  const text = body.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return { ok: true, data: JSON.parse(text), model: body.model }; } catch (e) { return { ok: false, error: 'model output was not valid JSON' }; }
}

function parseJsonBody(resp) {
  if (!resp) return null;
  let body = resp.body !== undefined ? resp.body : resp;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return null; } }
  return body;
}

// Access another node's items without throwing when that node did not run.
function safeAll(name) {
  try { return $(name).all(); } catch (e) { return []; }
}

function sheetsUrl(CONFIG, path) {
  return CONFIG.sheetsBase + '/v4/spreadsheets/' + encodeURIComponent(CONFIG.sheetId) + path;
}

function readRangeUrl(CONFIG, tab) {
  return sheetsUrl(CONFIG, '/values/' + encodeURIComponent(tab + '!A1:AZ'));
}

function appendRequest(CONFIG, tab, rows) {
  return {
    url: sheetsUrl(CONFIG, '/values/' + encodeURIComponent(tab + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'),
    body: { values: rows },
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
