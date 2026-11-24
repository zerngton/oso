// Flattens Places results, removes duplicates (within today's batch AND against
// everything already in the Leads sheet) and keeps the best candidates.
const sheet = parseJsonBody($('Read Leads').first().json) || {};
// Rows that failed earlier (status Error) are not blocking: they get retried.
const existing = rowsFromValues(sheet.values).rows.filter((r) => r.status !== STATUS.ERROR);
const seenPlace = new Set(existing.map((r) => r.place_id).filter(Boolean));
const seenDomain = new Set(existing.map((r) => r.domain || normDomain(r.website)).filter(Boolean));
const seenName = new Set(existing.map((r) => normName(r.company_name) + '|' + postcodeOf(r.address)));
const exclude = new Set((CONFIG.excludeDomains || []).map((d) => d.toLowerCase()));

const queries = $('Build Search Queries').all();
const candidates = [];
const placeResponses = $input.all();
const failed = placeResponses.filter((it) => it.json.error || (it.json.statusCode && it.json.statusCode >= 400));
if (placeResponses.length && failed.length === placeResponses.length) {
  const f = failed[0].json;
  const b = parseJsonBody(f) || {};
  throw new Error('Google Places search failed for every query (HTTP ' + (f.statusCode || '?') + '): ' + ((b.error && b.error.message) || f.error && f.error.message || 'check the Places API key / billing'));
}
$input.all().forEach((item, i) => {
  const q = (queries[i] || { json: {} }).json;
  const body = parseJsonBody(item.json) || {};
  (body.places || []).forEach((p) => {
    const name = (p.displayName && p.displayName.text) || '';
    const website = p.websiteUri || '';
    const domain = normDomain(website);
    const address = p.formattedAddress || '';
    const nameKey = normName(name) + '|' + postcodeOf(address);
    if (!name || !p.id) return;
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return;
    if (!domain) return; // no website = no way to find an email or personalise
    if (exclude.has(domain) || [...exclude].some((d) => domain.endsWith('.' + d))) return;
    if (seenPlace.has(p.id) || seenDomain.has(domain) || seenName.has(nameKey)) return;
    seenPlace.add(p.id); seenDomain.add(domain); seenName.add(nameKey);
    candidates.push({
      lead_id: p.id,
      place_id: p.id,
      company_name: name,
      segment: q.segment || '',
      search_query: q.textQuery || '',
      address,
      area: areaOf(address),
      phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
      website,
      domain,
      google_rating: p.rating || '',
      review_count: p.userRatingCount || 0,
      google_maps_url: p.googleMapsUri || '',
      place_types: (p.types || []).join(', '),
      editorial_summary: (p.editorialSummary && p.editorialSummary.text) || '',
    });
  });
});

// Larger, well-reviewed businesses first: more surface area to clean, bigger contracts.
candidates.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
return candidates.slice(0, CONFIG.candidatePool || 40).map((c) => ({ json: c }));
