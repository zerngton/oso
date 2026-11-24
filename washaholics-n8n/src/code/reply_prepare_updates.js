// Combines every change into ONE batchUpdate call on the Leads sheet.
const analyzed = $('Analyze Threads').all().map((i) => i.json);
const built = safeAll('Build Reply Drafts');
const aiResults = built.length ? (built[0].json.results || []) : [];
const draftReqs = built.filter((i) => !i.json.skip);
const draftResps = safeAll('Create Reply Drafts');

const byLead = {};
analyzed.forEach((a) => { byLead[a.lead.lead_id] = { lead: a.lead, upd: Object.assign({}, a.upd), action: a.action }; });
aiResults.forEach((r) => { if (byLead[r.lead.lead_id]) byLead[r.lead.lead_id].upd = Object.assign({}, r.upd); });
draftReqs.forEach((req, i) => {
  const entry = byLead[req.json.lead_id];
  const resp = draftResps[i] ? draftResps[i].json : null;
  const body = parseJsonBody(resp);
  const ok = resp && (!resp.statusCode || resp.statusCode < 300) && body && body.id;
  if (!entry) return;
  if (req.json.kind === 'followup') {
    if (ok) { entry.upd.followup_draft_id = body.id; entry.upd.followup_created_at = new Date().toISOString(); entry.upd.status = STATUS.FOLLOWUP_READY; }
    else entry.upd.notes = 'Follow-up draft failed in Gmail';
  } else if (!ok) {
    entry.upd.notes = 'Reply draft failed in Gmail';
  } else {
    entry.upd.notes = ((entry.lead.notes ? entry.lead.notes + ' | ' : '') + 'Reply draft ready in Gmail');
  }
});

const sheet = parseJsonBody($('Read Leads').first().json) || {};
const header = (sheet.values && sheet.values[0]) || LEAD_COLUMNS;
const lastCol = colLetter(header.length);
const data = [];
const changes = {};
Object.values(byLead).forEach((e) => {
  const keys = Object.keys(e.upd).filter((k) => k !== 'last_checked_at');
  if (!keys.length && e.action === 'none') return; // nothing new; skip the write
  const row = Object.assign({}, e.lead, e.upd);
  if (e.upd.status && e.upd.status !== e.lead.status) changes[e.upd.status] = (changes[e.upd.status] || 0) + 1;
  data.push({ range: 'Leads!A' + e.lead._row + ':' + lastCol + e.lead._row, values: [rowToValues(row, header)] });
});
if (!data.length) return [{ json: { skip: true, checked: analyzed.length } }];
return [{ json: { checked: analyzed.length, updated: data.length, changes, request: {
  url: sheetsUrl(CONFIG, '/values:batchUpdate'), body: { valueInputOption: 'RAW', data } } } }];
