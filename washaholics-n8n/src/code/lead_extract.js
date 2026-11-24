// Picks the best business email from the homepage + contact page.
const PREFERRED = ['facilities', 'operations', 'propertymanagement', 'management', 'enquiries', 'enquiry', 'info', 'hello', 'contact', 'office', 'admin', 'sales', 'reservations', 'bookings', 'events', 'manager', 'gm'];
const AVOID = /^(no-?reply|donotreply|privacy|gdpr|dpo|data|jobs|careers|recruit|hr|press|media|webmaster|abuse|unsubscribe|accounts?payable|invoices?|billing|complaints)/i;
const JUNK_DOMAINS = /(example\.|sentry|wixpress|domain\.com|email\.com|yourcompany|yourdomain|godaddy|squarespace|wordpress|cloudflare|googleapis|schema\.org|w3\.org)/i;

function emailsIn(html) {
  const text = String(html || '').replace(/&#64;|&#x40;|\[at\]|\(at\)/gi, '@').replace(/&#46;|\[dot\]|\(dot\)/gi, '.');
  const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return found.map((e) => e.toLowerCase().replace(/^[^a-z0-9]+/, '').replace(/\.+$/, ''))
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(e) && !JUNK_DOMAINS.test(e.split('@')[1] || ''));
}
function score(email, domain) {
  const [local, d] = email.split('@');
  let s = 0;
  if (d === domain || d.endsWith('.' + domain) || domain.endsWith('.' + d)) s += 100;
  if (AVOID.test(local)) s -= 200;
  const p = PREFERRED.findIndex((k) => local.startsWith(k));
  if (p >= 0) s += 50 - p;
  return s;
}
const prev = $('Find Contact Page').all();
return $input.all().map((item, i) => {
  const lead = Object.assign({}, prev[i].json);
  const contactHtml = typeof item.json.data === 'string' ? item.json.data : '';
  const all = [];
  emailsIn(lead.homepage_html).forEach((e) => all.push({ e, src: 'homepage' }));
  emailsIn(contactHtml).forEach((e) => all.push({ e, src: 'contact page' }));
  const uniq = {};
  all.forEach(({ e, src }) => { if (!uniq[e]) uniq[e] = src; });
  const ranked = Object.keys(uniq).map((e) => ({ e, s: score(e, lead.domain), src: uniq[e] })).sort((a, b) => b.s - a.s);
  const best = ranked.find((r) => r.s >= 0);
  lead.email = best ? best.e : '';
  lead.email_source = best ? best.src + ' (' + lead.contact_url + ')' : '';
  lead.other_emails = ranked.filter((r) => r !== best && r.s >= 0).slice(0, 3).map((r) => r.e).join(', ');
  delete lead.homepage_html;
  return { json: lead };
});
