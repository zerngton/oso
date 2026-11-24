// Reads each Gmail thread and decides what changed.
function header(msg, name) {
  const h = ((msg.payload && msg.payload.headers) || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}
function bodyText(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) return b64urlDecode(part.body.data);
  for (const p of part.parts || []) { const t = bodyText(p); if (t) return t; }
  if (part.mimeType === 'text/html' && part.body && part.body.data) return b64urlDecode(part.body.data).replace(/<[^>]+>/g, ' ');
  return '';
}
function stripQuoted(t) {
  const lines = String(t).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From: /.test(line)) break;
    if (/^>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
}
const leads = $('Select Leads To Check').all();
const now = new Date().toISOString();
return $input.all().map((item, i) => {
  const lead = Object.assign({}, leads[i].json);
  delete lead.request;
  const res = item.json;
  const upd = { last_checked_at: now };
  let action = 'none';
  const thread = parseJsonBody(res);
  if (res.statusCode === 404) {
    if (lead.status === STATUS.DRAFT_READY) { upd.status = STATUS.DRAFT_DELETED; action = 'update'; }
    return { json: { lead, upd, action } };
  }
  if (!thread || !Array.isArray(thread.messages)) return { json: { lead, upd, action: 'none' } };

  const msgs = thread.messages.slice().sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const sent = msgs.filter((m) => (m.labelIds || []).includes('SENT'));
  const inbound = msgs.filter((m) => !(m.labelIds || []).includes('SENT') && !(m.labelIds || []).includes('DRAFT'));
  const firstSent = sent[0];
  if (firstSent && !lead.sent_at) upd.sent_at = new Date(Number(firstSent.internalDate)).toISOString();
  const sentAt = upd.sent_at || lead.sent_at;
  const latestIn = inbound.filter((m) => firstSent && Number(m.internalDate) > Number(firstSent.internalDate)).pop();

  if (latestIn && latestIn.id !== lead.reply_message_id) {
    const from = header(latestIn, 'From');
    const subj = header(latestIn, 'Subject');
    upd.reply_message_id = latestIn.id;
    upd.replied_at = new Date(Number(latestIn.internalDate)).toISOString();
    if (/mailer-daemon|postmaster/i.test(from) || /undeliver|delivery status|failure notice|returned mail/i.test(subj)) {
      upd.status = STATUS.BOUNCED; upd.reply_category = 'bounce'; upd.reply_summary = subj;
      return { json: { lead, upd, action: 'update' } };
    }
    return { json: { lead, upd, action: 'classify_reply', reply: {
      from, subject: subj, text: stripQuoted(bodyText(latestIn.payload)) || latestIn.snippet || '',
      messageId: header(latestIn, 'Message-ID'), references: header(latestIn, 'References'),
    } } };
  }
  if (lead.status === STATUS.DRAFT_READY && firstSent) { upd.status = STATUS.SENT; action = 'update'; }
  if (lead.status === STATUS.FOLLOWUP_READY && sent.length >= 2) { upd.status = STATUS.FOLLOWUP_SENT; action = 'update'; }
  const status = upd.status || lead.status;
  if (status === STATUS.SENT && !latestIn && !lead.followup_draft_id && sentAt && daysBetween(sentAt, now) >= CONFIG.followupDays) {
    const last = sent[sent.length - 1];
    action = 'followup';
    return { json: { lead, upd, action, original: {
      text: stripQuoted(bodyText(last.payload)), subject: header(last, 'Subject') || lead.email_subject,
      messageId: header(last, 'Message-ID'), references: header(last, 'References'),
    } } };
  }
  return { json: { lead, upd, action } };
});
