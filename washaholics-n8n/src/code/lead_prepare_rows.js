// Merges Gmail draft ids into the leads and builds ONE append call for the sheet.
const leads = $('Parse AI Results').all().map((i) => Object.assign({}, i.json));
const requests = safeAll('Build Draft Requests').filter((i) => !i.json.skip);
const responses = safeAll('Create Gmail Drafts');
const byId = {};
requests.forEach((req, i) => { byId[req.json.lead_id] = responses[i] ? responses[i].json : null; });

const sheet = parseJsonBody($('Read Leads').first().json) || {};
const header = (sheet.values && sheet.values[0] && sheet.values[0].length) ? sheet.values[0] : LEAD_COLUMNS;

for (const l of leads) {
  if (l.status !== STATUS.DRAFT_READY) continue;
  const resp = byId[l.lead_id];
  const body = parseJsonBody(resp);
  if (resp && (!resp.statusCode || resp.statusCode < 300) && body && body.id) {
    l.draft_id = body.id;
    l.thread_id = (body.message && body.message.threadId) || '';
    l.draft_created_at = new Date().toISOString();
  } else {
    l.status = STATUS.ERROR;
    l.notes = 'Gmail draft failed' + (resp && resp.statusCode ? ' (HTTP ' + resp.statusCode + ')' : '') + '. Email text is saved in this row.';
  }
}
const counts = {};
leads.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
const append = appendRequest(CONFIG, 'Leads', leads.map((l) => rowToValues(l, header)));
return [{ json: { summary: counts, total: leads.length, request: append } }];
