// Local stand-in for Google Places, Google Sheets, Gmail, the Claude API and a few
// company websites, so the real workflows can be executed end-to-end in n8n
// without touching any real account. Usage: node test/mock-server.mjs <port>
import http from 'node:http';

const PORT = Number(process.argv[2] || 4545);
const state = { sheets: {}, drafts: {}, threads: {}, sent: [], calls: [], fail: {} };
let seq = 1;
const b64urlDecode = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const SITES = {
  'acme-property.test': `<html><head><title>Acme Property Management | Block management across North London</title><meta name="description" content="We manage 120 residential blocks and 15 commercial buildings."></head><body><a href="/contact-us">Contact us</a><p>Award-winning block management in Camden and Islington.</p><img src="logo@2x.png"><a href="mailto:jobs@acme-property.test">Careers</a></body></html>`,
  'acme-property.test/contact-us': `<html><body>Email our team: info@acme-property.test or facilities&#64;acme-property.test. Tracking: abc@sentry.io</body></html>`,
  'grandhotel.test': `<html><head><title>The Grand Hotel Southwark</title></head><body><p>Boutique 80-room hotel with a riverside terrace.</p><a href="/contact">Get in touch</a></body></html>`,
  'grandhotel.test/contact': `<html><body>reservations@grandhotel.test</body></html>`,
  'bistro.test': `<html><head><title>Bistro Lumiere</title></head><body>French bistro with outdoor seating in Shoreditch. No email listed.</body></html>`,
  'bistro.test/contact': `<html><body>Call us!</body></html>`,
  'cleanco.test': `<html><head><title>CleanCo - commercial cleaning London</title></head><body>We are a cleaning company. hello@cleanco.test</body></html>`,
  'cleanco.test/contact': `<html><body></body></html>`,
  'mall.test': `<html><head><title>Riverside Shopping Centre</title></head><body>60 stores, 400-space car park. centre.management@mall.test</body></html>`,
  'mall.test/contact': `<html><body></body></html>`,
};
const place = (id, name, site, reviews, extra = {}) => ({ id, displayName: { text: name }, formattedAddress: `1 High St, London ${extra.pc || 'N1 7AA'}, UK`,
  websiteUri: site ? `http://${site}:${PORT}/` : undefined, nationalPhoneNumber: '020 7000 0000', rating: 4.5, userRatingCount: reviews,
  types: ['point_of_interest'], businessStatus: extra.status || 'OPERATIONAL', googleMapsUri: `https://maps.google.com/?cid=${id}` });
const PLACES = {
  property_management: [place('p_acme', 'Acme Property Management Ltd', 'acme-property.test', 210), place('p_clean', 'CleanCo London', 'cleanco.test', 90),
    place('p_closed', 'Old Lettings', 'old.test', 5, { status: 'CLOSED_PERMANENTLY' }), place('p_nosite', 'No Website Estates', null, 40)],
  hotel: [place('p_grand', 'The Grand Hotel Southwark', 'grandhotel.test', 1800, { pc: 'SE1 9AA' }), place('p_acme', 'Acme Property Management Ltd', 'acme-property.test', 210)],
  restaurant: [place('p_bistro', 'Bistro Lumiere', 'bistro.test', 640, { pc: 'E2 7AA' })],
  commercial_complex: [place('p_mall', 'Riverside Shopping Centre', 'mall.test', 5000, { pc: 'SE10 0AA' })],
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function parseRange(range) { // Leads!A5:AK5 or Leads!A1:AZ or Leads!A1
  const [tab, cells] = decodeURIComponent(range).split('!');
  const m = (cells || '').match(/^[A-Z]+(\d+)/);
  return { tab, row: m ? Number(m[1]) : 1 };
}
function anthropic(body, headers) {
  if (!headers['x-api-key']) return [401, { type: 'error', error: { type: 'authentication_error', message: 'missing key' } }];
  if (!headers['anthropic-version']) return [400, { type: 'error', error: { message: 'missing anthropic-version' } }];
  if (!body.output_config || !body.output_config.format || body.output_config.format.type !== 'json_schema') return [400, { error: { message: 'no schema' } }];
  const user = body.messages[0].content;
  let out;
  if (/B2B sales researcher/.test(body.system)) {
    const facts = JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1));
    const isCleaner = /clean/i.test(facts.company_name);
    const scores = { 'Acme Property Management Ltd': 92, 'The Grand Hotel Southwark': 85, 'Bistro Lumiere': 70, 'Riverside Shopping Centre': 45 };
    out = { relevance_score: isCleaner ? 10 : (scores[facts.company_name] || 50), priority: 'high', segment: 'other',
      fit_reasoning: `Manages buildings with exterior areas (${facts.company_name}).`, recommended_services: ['Pressure washing', 'Window cleaning'],
      decision_maker_role: 'Facilities Manager', personalization_hook: 'your riverside terrace', email_subject: `Exterior cleaning for ${facts.company_name}`,
      email_body: `Hello ${facts.company_name} team,\n\nI noticed your riverside terrace — a quick note from a London exterior cleaning firm.\n\nIf this isn't relevant, just let me know and I won't get in touch again.`,
      disqualify_reason: isCleaner ? 'Competitor (cleaning company)' : '' };
  } else if (/Classify the reply/.test(user)) {
    out = { category: 'interested', summary: 'Asked for a quote for the car park.', should_draft_reply: true, reply_body: 'Thanks for coming back to us! Could we pop over next week for a free survey?' };
  } else {
    out = { followup_body: 'Just following up on my note last week about exterior cleaning.' };
  }
  return [200, { id: 'msg_' + seq++, type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] }];
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const host = (req.headers.host || '').split(':')[0];
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    state.calls.push({ method: req.method, host, path: url.pathname, auth: req.headers.authorization || req.headers['x-api-key'] || req.headers['x-goog-api-key'] || '' });

    // ---- fake company websites
    if (SITES[host] !== undefined || host.endsWith('.test')) {
      const key = url.pathname === '/' ? host : host + url.pathname.replace(/\/$/, '');
      return SITES[key] ? send(res, 200, SITES[key], 'text/html') : send(res, 404, 'not found', 'text/html');
    }
    // ---- test control
    if (url.pathname === '/__state') return send(res, 200, state);
    if (url.pathname === '/__control' && req.method === 'POST') {
      if (body.fail) state.fail = body.fail;
      for (const ev of body.events || []) { // simulate the user sending drafts / leads replying
        const d = Object.values(state.drafts).find((x) => x.leadEmail === ev.email);
        if (!d) continue;
        const t = state.threads[d.message.threadId];
        const ts = Date.now() - (ev.daysAgo || 0) * 86400000;
        if (ev.type === 'sent') { t.messages = t.messages.filter((m) => !m.labelIds.includes('DRAFT')); t.messages.push({ id: 'm' + seq++, internalDate: String(ts), labelIds: ['SENT'], payload: { headers: [{ name: 'Subject', value: d.subject }, { name: 'Message-ID', value: '<orig' + seq + '@mail>' }], mimeType: 'text/plain', body: { data: b64url('Original email text') } } }); }
        if (ev.type === 'reply') t.messages.push({ id: 'm' + seq++, internalDate: String(Date.now()), labelIds: ['INBOX', 'UNREAD'], snippet: 'Yes please',
          payload: { mimeType: 'multipart/alternative', headers: [{ name: 'From', value: `Jane <${ev.email}>` }, { name: 'Subject', value: 'Re: ' + d.subject }, { name: 'Message-ID', value: '<reply1@mail>' }],
            parts: [{ mimeType: 'text/plain', body: { data: b64url('Yes please send a quote for our car park.\n\nOn Mon, someone wrote:\n> old text') } }] } });
      }
      return send(res, 200, { ok: true });
    }
    // ---- Google Places
    if (url.pathname === '/v1/places:searchText') {
      if (!req.headers['x-goog-api-key']) return send(res, 403, { error: { message: 'API key missing' } });
      if (!req.headers['x-goog-fieldmask']) return send(res, 400, { error: { message: 'FieldMask missing' } });
      const q = body.textQuery || '';
      const seg = /hotel/i.test(q) ? 'hotel' : /restaurant|gastropub/i.test(q) ? 'restaurant' : /shopping|business park|serviced|commercial/i.test(q) ? 'commercial_complex' : 'property_management';
      return send(res, 200, { places: PLACES[seg] });
    }
    // ---- Google Sheets
    if (url.pathname.startsWith('/v4/spreadsheets')) {
      if (!/^Bearer /.test(req.headers.authorization || '')) return send(res, 401, { error: { message: 'no oauth token' } });
      if (state.fail.sheets) return send(res, 500, { error: { message: 'boom' } });
      if (url.pathname === '/v4/spreadsheets' && req.method === 'POST') {
        const id = 'sheet' + seq++;
        state.sheets[id] = {};
        for (const s of body.sheets) state.sheets[id][s.properties.title] = [s.data[0].rowData[0].values.map((v) => v.userEnteredValue.stringValue)];
        return send(res, 200, { spreadsheetId: id, spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + id });
      }
      const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values(?::batchUpdate|\/(.+))$/);
      if (!m) return send(res, 404, {});
      const sheet = state.sheets[decodeURIComponent(m[1])];
      if (!sheet) return send(res, 404, { error: { message: 'Requested entity was not found.' } });
      if (url.pathname.endsWith(':batchUpdate')) {
        for (const d of body.data) { const { tab, row } = parseRange(d.range); sheet[tab][row - 1] = d.values[0]; }
        return send(res, 200, { totalUpdatedRows: body.data.length });
      }
      const rangePart = m[2];
      if (rangePart.endsWith(':append')) {
        const { tab } = parseRange(rangePart.replace(/:append$/, ''));
        sheet[tab].push(...body.values);
        return send(res, 200, { updates: { updatedRows: body.values.length } });
      }
      const { tab } = parseRange(rangePart);
      return send(res, 200, { range: tab, values: sheet[tab] });
    }
    // ---- Gmail
    if (url.pathname.startsWith('/gmail/v1/users/me')) {
      if (!/^Bearer /.test(req.headers.authorization || '')) return send(res, 401, { error: { message: 'no oauth token' } });
      if (url.pathname.endsWith('/drafts') && req.method === 'POST') {
        const mime = b64urlDecode(body.message.raw);
        const to = (mime.match(/^To: (.*)$/m) || [])[1];
        const subjRaw = (mime.match(/^Subject: (.*)$/m) || [])[1] || '';
        const subject = subjRaw.startsWith('=?UTF-8?B?') ? Buffer.from(subjRaw.slice(10, -2), 'base64').toString('utf8') : subjRaw;
        const text = Buffer.from(mime.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
        const threadId = body.message.threadId || 't' + seq++;
        const d = { id: 'r' + seq++, message: { id: 'm' + seq++, threadId, labelIds: ['DRAFT'] }, leadEmail: to, subject, text, mime };
        state.drafts[d.id] = d;
        state.threads[threadId] = state.threads[threadId] || { id: threadId, messages: [] };
        state.threads[threadId].messages.push({ id: d.message.id, internalDate: String(Date.now()), labelIds: ['DRAFT'], payload: { headers: [{ name: 'Subject', value: subject }] } });
        return send(res, 200, { id: d.id, message: d.message });
      }
      const tm = url.pathname.match(/\/threads\/([^/]+)$/);
      if (tm) { const t = state.threads[decodeURIComponent(tm[1])]; return t ? send(res, 200, t) : send(res, 404, { error: { message: 'Not Found' } }); }
      if (url.pathname.endsWith('/messages/send')) { state.sent.push(b64urlDecode(body.raw)); return send(res, 200, { id: 'sent' + seq++, threadId: 'ts' }); }
    }
    // ---- Claude
    if (url.pathname === '/v1/messages') { const [code, out] = anthropic(body, req.headers); return send(res, code, out); }
    send(res, 404, { error: 'no mock for ' + req.method + ' ' + url.pathname });
  });
});
server.listen(PORT, () => console.log('mock listening on ' + PORT));
