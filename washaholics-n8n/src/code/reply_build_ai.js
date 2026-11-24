// Claude requests: classify new replies, or write a polite follow-up.
const REPLY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['category', 'summary', 'should_draft_reply', 'reply_body'],
  properties: {
    category: { type: 'string', enum: ['interested', 'question', 'not_interested', 'unsubscribe', 'out_of_office', 'other'] },
    summary: { type: 'string', description: 'One sentence summary of what they said' },
    should_draft_reply: { type: 'boolean' },
    reply_body: { type: 'string', description: 'Plain-text reply without signature; empty if no reply is needed' },
  },
};
const FOLLOWUP_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['followup_body'],
  properties: { followup_body: { type: 'string', description: 'Plain text, no signature' } },
};
const CONTEXT = 'You work for ' + CONFIG.companyName + ', a London commercial cleaning company. Services: ' + CONFIG.services + '. Write in British English, warm and concise. Never promise prices, dates or facts you were not given; offer a call or a free site visit instead.';

const out = [];
for (const item of $input.all()) {
  const j = item.json;
  if (j.action === 'classify_reply') {
    const user = 'We emailed ' + j.lead.company_name + ' with subject "' + j.lead.email_subject + '":\n---\n' + j.lead.email_body +
      '\n---\nThey replied (from ' + j.reply.from + '):\n---\n' + j.reply.text + '\n---\nClassify the reply. If they are interested or asked a question, draft a helpful reply (under 120 words) that moves toward a call or site visit. Set should_draft_reply=false for unsubscribe, not_interested, out_of_office and auto-replies.';
    out.push({ json: Object.assign({}, j, { request: { url: CONFIG.anthropicBase + '/v1/messages', body: claudeBody(CONFIG, CONTEXT, user, REPLY_SCHEMA, 8000) } }) });
  } else if (j.action === 'followup') {
    const user = 'We emailed ' + j.lead.company_name + ' ' + Math.round(daysBetween(j.upd.sent_at || j.lead.sent_at, new Date().toISOString())) + ' days ago and got no reply. Original email:\n---\n' + (j.original.text || j.lead.email_body) +
      '\n---\nWrite a short, friendly follow-up (40-70 words) that adds one new useful angle and repeats the low-friction offer. End with: "If now isn\'t a good time, no problem - just let me know."';
    out.push({ json: Object.assign({}, j, { request: { url: CONFIG.anthropicBase + '/v1/messages', body: claudeBody(CONFIG, CONTEXT, user, FOLLOWUP_SCHEMA, 8000) } }) });
  }
}
return out.length ? out : [{ json: { skip: true } }];
