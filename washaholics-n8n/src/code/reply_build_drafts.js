// Applies Claude's output and prepares reply / follow-up drafts in the same thread.
const CAT = { interested: STATUS.INTERESTED, question: STATUS.QUESTION, not_interested: STATUS.NOT_INTERESTED,
  unsubscribe: STATUS.DO_NOT_CONTACT, out_of_office: STATUS.OOO, other: STATUS.REPLIED_OTHER };
const prev = $('Build AI Requests').all();
const results = [];
const drafts = [];
$input.all().forEach((item, i) => {
  const j = Object.assign({}, prev[i].json);
  delete j.request;
  const upd = Object.assign({}, j.upd);
  const r = parseClaude(item.json);
  if (j.action === 'classify_reply') {
    if (!r.ok) { upd.status = STATUS.REPLIED_OTHER; upd.reply_summary = 'New reply - AI classification failed: ' + r.error; }
    else {
      upd.status = CAT[r.data.category] || STATUS.REPLIED_OTHER;
      upd.reply_category = r.data.category;
      upd.reply_summary = r.data.summary;
      if (r.data.should_draft_reply && r.data.reply_body) {
        drafts.push({ lead_id: j.lead.lead_id, kind: 'reply', to: j.reply.from, subject: j.reply.subject, text: r.data.reply_body,
          inReplyTo: j.reply.messageId, references: [j.reply.references, j.reply.messageId].filter(Boolean).join(' ') });
      }
    }
  } else if (j.action === 'followup') {
    if (r.ok && r.data.followup_body) {
      drafts.push({ lead_id: j.lead.lead_id, kind: 'followup', to: j.lead.email, subject: j.original.subject, text: r.data.followup_body,
        inReplyTo: j.original.messageId, references: [j.original.references, j.original.messageId].filter(Boolean).join(' ') });
    } else { upd.notes = ((j.lead.notes || '') + ' | Follow-up AI failed: ' + (r.error || 'empty')).replace(/^ \| /, ''); }
  }
  results.push({ lead: j.lead, upd, action: j.action });
});
const out = drafts.map((d) => {
  const subject = /^re:/i.test(d.subject || '') ? d.subject : 'Re: ' + (d.subject || '');
  const raw = buildRawEmail({ to: d.to, from: CONFIG.fromHeader, subject, text: d.text.trim() + '\n' + signature(CONFIG), inReplyTo: d.inReplyTo, references: d.references });
  const lead = results.find((x) => x.lead.lead_id === d.lead_id).lead;
  return { json: { lead_id: d.lead_id, kind: d.kind, request: { url: CONFIG.gmailBase + '/gmail/v1/users/me/drafts', body: { message: { raw, threadId: lead.thread_id } } } } };
});
// Results are re-read by "Prepare Sheet Updates" from this node's static data via $('Build Reply Drafts').
return out.length ? out.map((o, idx) => (idx === 0 ? { json: Object.assign(o.json, { results }) } : o))
  : [{ json: { skip: true, results } }];
