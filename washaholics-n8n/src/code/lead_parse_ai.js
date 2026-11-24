// Applies Claude's verdict, ranks leads and decides today's status for each.
const prev = $('Build AI Requests').all();
const leads = $input.all().map((item, i) => {
  const lead = Object.assign({}, prev[i].json);
  delete lead.request;
  const r = CONFIG.aiEnabled ? parseClaude(item.json) : { ok: true, data: ruleQualify(lead, CONFIG) };
  lead.date_found = CONFIG.runDate;
  if (!r.ok) {
    lead.status = STATUS.ERROR;
    lead.notes = 'AI step failed: ' + r.error;
    lead.relevance_score = '';
    return lead;
  }
  const a = r.data;
  Object.assign(lead, {
    relevance_score: a.relevance_score,
    priority: a.priority,
    segment: a.segment && a.segment !== 'other' ? a.segment : lead.segment,
    fit_reasoning: a.fit_reasoning,
    recommended_services: (a.recommended_services || []).join(', '),
    decision_maker_role: a.decision_maker_role,
    personalization_hook: a.personalization_hook,
    email_subject: a.email_subject,
    email_body: a.email_body,
    notes: a.disqualify_reason ? 'Disqualified: ' + a.disqualify_reason : (lead.other_emails ? 'Other emails: ' + lead.other_emails : ''),
  });
  return lead;
});

if (leads.length && leads.every((l) => l.status === STATUS.ERROR)) {
  throw new Error((CONFIG.aiEnabled ? 'Claude API' : 'Scoring') + ' failed for every lead - nothing was saved. First error: ' + leads[0].notes);
}
leads.sort((a, b) => (Number(b.relevance_score) || -1) - (Number(a.relevance_score) || -1));
let qualified = 0;
for (const l of leads) {
  if (l.status === STATUS.ERROR) continue;
  const good = Number(l.relevance_score) >= CONFIG.minScore && !/^Disqualified/.test(l.notes || '');
  if (!good) { l.status = STATUS.LOW_FIT; continue; }
  if (qualified >= CONFIG.dailyMax) { l.status = STATUS.BACKLOG; continue; }
  qualified++;
  l.status = l.email ? STATUS.DRAFT_READY : STATUS.NO_EMAIL; // Draft Ready is confirmed after Gmail answers
}
return leads.map((l) => ({ json: l }));
