// Daily summary: today's activity + pipeline, emailed to the owner only.
const sheet = parseJsonBody($input.first().json) || {};
const { rows } = rowsFromValues(sheet.values);
const today = CONFIG.runDate;
const tz = CONFIG.timezone;
const on = (iso) => iso && tzDate(new Date(iso), tz) === today;
const isReply = (s) => /^Replied|Do Not Contact|Bounced/.test(s || '');

const foundToday = rows.filter((r) => r.date_found === today);
const qualifiedToday = foundToday.filter((r) => [STATUS.DRAFT_READY, STATUS.NO_EMAIL].includes(r.status) || r.draft_id);
const draftsToday = rows.filter((r) => on(r.draft_created_at) || on(r.followup_created_at));
const sentToday = rows.filter((r) => on(r.sent_at));
const repliesToday = rows.filter((r) => on(r.replied_at) && r.reply_category !== 'bounce');
const interestedToday = repliesToday.filter((r) => [STATUS.INTERESTED, STATUS.QUESTION].includes(r.status));
const pending = rows.filter((r) => [STATUS.DRAFT_READY, STATUS.FOLLOWUP_READY].includes(r.status));
const totalSent = rows.filter((r) => r.sent_at).length;
const totalReplies = rows.filter((r) => r.replied_at && r.reply_category !== 'bounce').length;
const replyRate = totalSent ? Math.round((totalReplies / totalSent) * 1000) / 10 + '%' : '-';
const needsAction = rows.filter((r) => [STATUS.INTERESTED, STATUS.QUESTION].includes(r.status));

const bySeg = {};
foundToday.forEach((r) => { bySeg[r.segment || 'other'] = (bySeg[r.segment || 'other'] || 0) + 1; });
const top = qualifiedToday.slice().sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score)).slice(0, 10);

const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheetId;
const td = (s) => '<td style="padding:6px 10px;border-bottom:1px solid #eee">' + escapeHtml(s) + '</td>';
const stat = (label, val) => '<tr>' + td(label) + '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;text-align:right">' + escapeHtml(val) + '</td></tr>';
const table = (list, cols) => list.length ? '<table style="border-collapse:collapse;width:100%;font-size:13px"><tr>' + cols.map((c) => '<th style="text-align:left;padding:6px 10px;background:#f4f6f8">' + c[0] + '</th>').join('') + '</tr>' +
  list.map((r) => '<tr>' + cols.map((c) => td(c[1](r))).join('') + '</tr>').join('') + '</table>' : '<p style="color:#888">None.</p>';

const summary = foundToday.length + ' new leads, ' + qualifiedToday.length + ' qualified, ' + draftsToday.length + ' drafts, ' + sentToday.length + ' sent, ' + repliesToday.length + ' replies (' + interestedToday.length + ' positive).';
const html = '<div style="font-family:Arial,sans-serif;max-width:720px;color:#222">' +
  '<h2 style="margin:0 0 4px">' + escapeHtml(CONFIG.companyName) + ' - Lead Report ' + today + '</h2>' +
  '<p style="margin:0 0 16px;color:#555">' + escapeHtml(summary) + '</p>' +
  '<table style="border-collapse:collapse;font-size:14px;min-width:320px">' +
  stat('New leads found', foundToday.length) + stat('Qualified (score >= ' + CONFIG.minScore + ')', qualifiedToday.length) +
  stat('Leads with new drafts (need your approval)', draftsToday.length) + stat('Emails you sent today', sentToday.length) +
  stat('Replies today', repliesToday.length) + stat('Positive replies today', interestedToday.length) +
  stat('Drafts waiting in Gmail', pending.length) + stat('Total leads in sheet', rows.length) +
  stat('Total sent / replies / reply rate', totalSent + ' / ' + totalReplies + ' / ' + replyRate) + '</table>' +
  '<h3>Needs your attention (positive replies)</h3>' + table(needsAction.slice(0, 15), [['Company', (r) => r.company_name], ['Status', (r) => r.status], ['Summary', (r) => r.reply_summary]]) +
  '<h3>Top new leads today</h3>' + table(top, [['Company', (r) => r.company_name], ['Segment', (r) => r.segment], ['Score', (r) => r.relevance_score], ['Status', (r) => r.status], ['Why', (r) => r.fit_reasoning]]) +
  '<h3>New leads by segment</h3>' + table(Object.entries(bySeg).map(([k, v]) => ({ k, v })), [['Segment', (r) => r.k], ['Count', (r) => r.v]]) +
  '<p style="margin-top:20px"><a href="' + sheetUrl + '">Open the leads sheet</a> &middot; <a href="https://mail.google.com/mail/u/0/#drafts">Review drafts in Gmail</a></p>' +
  '<p style="color:#999;font-size:12px">Drafts are never sent automatically. Review, edit and press Send yourself.</p></div>';

const report = { date: today, generated_at: new Date().toISOString(), found_today: foundToday.length, qualified_today: qualifiedToday.length,
  drafts_today: draftsToday.length, sent_today: sentToday.length, replies_today: repliesToday.length, interested_today: interestedToday.length,
  pending_drafts: pending.length, total_leads: rows.length, total_sent: totalSent, total_replies: totalReplies, reply_rate: replyRate, summary };
const raw = buildRawEmail({ to: CONFIG.ownerEmail, from: CONFIG.fromHeader, subject: 'Lead report ' + today + ': ' + qualifiedToday.length + ' qualified, ' + repliesToday.length + ' replies', html });
return [{ json: { report, emailRequest: { url: CONFIG.gmailBase + '/gmail/v1/users/me/messages/send', body: { raw } },
  appendRequest: appendRequest(CONFIG, 'Reports', [rowToValues(report, REPORT_COLUMNS)]) } }];
