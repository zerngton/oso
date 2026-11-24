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

// ---------------------------------------------------------------------------
// No-AI mode (AI_ENABLED=false): rule-based scoring, template emails and
// keyword reply classification, so the system runs without a Claude API key.
// ---------------------------------------------------------------------------
const SEGMENT_BASE = { property_management: 75, commercial_complex: 70, hotel: 70, restaurant: 62 };
const HOOKS = [
  [/car ?park|parking/i, 'car park', 'Pressure washing of car parks and forecourts'],
  [/terrace|outdoor seating|al fresco|beer garden|courtyard/i, 'outdoor seating area', 'Patio and terrace jet washing'],
  [/fa[cç]ade|cladding|frontage|shopfront/i, 'building frontage', 'Facade and cladding cleaning'],
  [/communal|blocks?\b|residential blocks|estates?\b|portfolio/i, 'portfolio of buildings', 'Communal area and bin store cleaning'],
  [/stores|shops|retail|shopping/i, 'busy retail space', 'Walkway and entrance cleaning, gum removal'],
  [/rooms|guests|hotel|suites/i, 'guest-facing entrance', 'Entrance, window and signage cleaning'],
];
const SEGMENT_LABEL = { property_management: 'property management', commercial_complex: 'commercial site', hotel: 'hotel', restaurant: 'restaurant' };

function ruleQualify(lead, CONFIG) {
  const text = [lead.company_name, lead.site_text, lead.editorial_summary, lead.place_types].join(' ');
  const firstWords = String(lead.company_name || '') + ' ' + String(lead.site_text || '').slice(0, 300);
  if (/clean(ing|ers)|janitorial|pressure wash|window clean/i.test(firstWords)) {
    return { relevance_score: 5, priority: 'low', segment: lead.segment, fit_reasoning: 'Looks like a cleaning company (competitor).',
      recommended_services: [], decision_maker_role: '', personalization_hook: '', email_subject: '', email_body: '', disqualify_reason: 'Competitor (cleaning company)' };
  }
  let score = SEGMENT_BASE[lead.segment] || 55;
  const reviews = Number(lead.review_count) || 0;
  if (reviews >= 1000) score += 10; else if (reviews >= 300) score += 6; else if (reviews >= 100) score += 3; else if (reviews < 15) score -= 10;
  const hits = HOOKS.filter(([re]) => re.test(text));
  score += Math.min(hits.length * 4, 12);
  if (!lead.website_ok) score -= 8;
  score = Math.max(0, Math.min(100, score));
  const hook = hits[0] ? hits[0][1] : '';
  const services = (hits.length ? hits.map((h) => h[2]) : ['Pressure washing', 'Window cleaning']).slice(0, 3);
  const role = lead.segment === 'restaurant' ? 'General Manager' : lead.segment === 'hotel' ? 'Operations Manager' : 'Facilities Manager';
  const where = lead.area ? ' in ' + lead.area : '';
  const kind = SEGMENT_LABEL[lead.segment] || 'business';
  const subject = 'Exterior cleaning for ' + lead.company_name;
  const opener = hook ? 'I came across ' + lead.company_name + where + ' and noticed your ' + hook + '.'
    : 'I came across ' + lead.company_name + where + ' while looking at ' + kind + 's across London.';
  const body = 'Hello ' + lead.company_name + ' team,\n\n' + opener + ' ' + CONFIG.companyName + ' is a London exterior cleaning company - we help ' + kind + 's keep '
    + (hook ? 'areas like that' : 'their sites') + ' looking their best with ' + services.slice(0, 2).join(' and ').toLowerCase() + '.\n\n'
    + 'Would you be open to a free site visit and quote? We work out of hours, so there is no disruption to your ' + (lead.segment === 'restaurant' || lead.segment === 'hotel' ? 'guests' : 'tenants or visitors') + '.\n\n'
    + "If this isn't relevant, just let me know and I won't get in touch again.";
  return { relevance_score: score, priority: score >= 80 ? 'high' : score >= 65 ? 'medium' : 'low', segment: lead.segment,
    fit_reasoning: 'Rule-based: ' + kind + (reviews ? ', ' + reviews + ' Google reviews' : '') + (hits.length ? ', mentions ' + hits.map((h) => h[1]).join(', ') : '') + '.',
    recommended_services: services, decision_maker_role: role, personalization_hook: hook, email_subject: subject, email_body: body, disqualify_reason: '' };
}

function ruleClassifyReply(text) {
  const t = String(text || '').toLowerCase();
  let category = 'other';
  if (/unsubscribe|remove me|take me off|do not (contact|email)|don't (contact|email)|stop emailing/.test(t)) category = 'unsubscribe';
  else if (/out of (the )?office|annual leave|on holiday|away until|automatic reply|auto-?reply|limited access to email/.test(t)) category = 'out_of_office';
  else if (/not interested|no thanks|no thank you|already have (a|an)|we are covered|not at this time|not required/.test(t)) category = 'not_interested';
  else if (/\?/.test(t) && !/interested|quote|visit/.test(t)) category = 'question';
  else if (/interested|quote|pric|cost|call me|give me a call|visit|survey|yes|sounds good|tell me more|availability|available/.test(t)) category = 'interested';
  const draft = category === 'interested' || category === 'question';
  return { category, summary: 'Keyword match: ' + category + ' - "' + String(text || '').replace(/\s+/g, ' ').slice(0, 120) + '"',
    should_draft_reply: draft,
    reply_body: draft ? 'Thank you for getting back to us. I would be happy to help - could we arrange a quick call or a free site visit this week or next? Let me know a day and time that suits you, and the best number to reach you on.' : '' };
}

function templateFollowup(lead, CONFIG) {
  return 'Hello again,\n\nJust following up on my note about exterior cleaning for ' + lead.company_name + '. We are currently booking free site visits across London, and can work out of hours so there is no disruption.\n\nIf now isn\'t a good time, no problem - just let me know.';
}
