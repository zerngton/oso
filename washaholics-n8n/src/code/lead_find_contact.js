// Reads each homepage, keeps a text summary and finds the contact page link.
function strip(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
const leads = $('Normalize & Dedupe').all();
return $input.all().map((item, i) => {
  const lead = Object.assign({}, leads[i].json);
  const html = typeof item.json.data === 'string' ? item.json.data : '';
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '';
  let contactUrl = '';
  const links = html.match(/<a\s[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || [];
  for (const a of links) {
    const href = (a.match(/href=["']([^"']+)["']/i) || [])[1] || '';
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    if (/contact|get-in-touch|enquir/i.test(href) || /contact us|get in touch|enquir/i.test(strip(a))) {
      contactUrl = resolveUrl(href, lead.website);
      if (contactUrl && normDomain(contactUrl) === lead.domain) break;
      contactUrl = '';
    }
  }
  if (!contactUrl) contactUrl = resolveUrl('/contact', lead.website) || lead.website;
  lead.homepage_html = html.slice(0, 300000);
  lead.site_text = (title.trim() + ' | ' + desc.trim() + ' | ' + strip(html)).slice(0, 3500);
  lead.contact_url = contactUrl;
  lead.website_ok = html.length > 200;
  return { json: lead };
});
