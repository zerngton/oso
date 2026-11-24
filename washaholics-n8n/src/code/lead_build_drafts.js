// Gmail drafts for qualified leads that have an email. Nothing is ever sent.
const out = [];
for (const item of $input.all()) {
  const l = item.json;
  if (l.status !== STATUS.DRAFT_READY) continue;
  const text = l.email_body.trim() + '\n' + signature(CONFIG);
  const raw = buildRawEmail({ to: l.email, from: CONFIG.fromHeader, subject: l.email_subject, text });
  out.push({ json: { lead_id: l.lead_id, request: { url: CONFIG.gmailBase + '/gmail/v1/users/me/drafts', body: { message: { raw } } } } });
}
return out.length ? out : [{ json: { skip: true } }];
