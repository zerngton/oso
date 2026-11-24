// Builds one Claude request per lead: qualify the fit + write a tailored email.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relevance_score', 'priority', 'segment', 'fit_reasoning', 'recommended_services', 'decision_maker_role', 'personalization_hook', 'email_subject', 'email_body', 'disqualify_reason'],
  properties: {
    relevance_score: { type: 'integer', description: '0-100: how likely this business needs and buys our services' },
    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
    segment: { type: 'string', enum: ['property_management', 'hotel', 'restaurant', 'commercial_complex', 'other'] },
    fit_reasoning: { type: 'string', description: 'One or two sentences, based only on the facts given' },
    recommended_services: { type: 'array', items: { type: 'string' } },
    decision_maker_role: { type: 'string', description: 'Job title most likely to buy, e.g. Facilities Manager' },
    personalization_hook: { type: 'string', description: 'The specific detail from their website/listing the email refers to' },
    email_subject: { type: 'string' },
    email_body: { type: 'string', description: 'Plain text, no signature, no placeholders' },
    disqualify_reason: { type: 'string', description: 'Empty string unless clearly not a fit' },
  },
};

const SYSTEM = [
  'You are a B2B sales researcher and copywriter for ' + CONFIG.companyName + ', a commercial cleaning company in London.',
  'Services offered: ' + CONFIG.services,
  'Ideal customers: property management / block management companies, hotels, restaurants and commercial complexes (shopping centres, business parks, office buildings) in London with exterior areas, facades, windows, car parks, bin stores, signage or communal spaces to keep clean.',
  'Unique selling points: ' + CONFIG.usp,
  '',
  'Task 1 - Qualify: score 0-100 how relevant our services are to this business, using ONLY the facts provided. Large portfolios, multi-site operators, venues with frontage/outdoor seating and busy public sites score high. Residential-only individuals, competitors (cleaning companies), businesses outside London, and listings that are clearly not a real operating business score low and get a disqualify_reason.',
  'Task 2 - Write a first-touch cold email to the business (to their general inbox, addressed to the right role, e.g. "Hi there," or "Hello [Company] team,").',
  'Email rules: British English; 70-120 words; warm, plain, specific; open with the personalization hook (a real detail from their site or listing - never invent facts, awards, names or numbers); one concrete way we can help them; one low-friction call to action (e.g. a free site visit or quote); final line: "If this isn\'t relevant, just let me know and I won\'t get in touch again." No signature, no placeholders, no emojis, no hype words like "revolutionary".',
  'Subject: under 8 words, specific to them, no clickbait.',
].join('\n');

return $input.all().map((item) => {
  const l = item.json;
  const facts = {
    company_name: l.company_name, search_segment: l.segment, address: l.address,
    website: l.website, google_rating: l.google_rating, google_review_count: l.review_count,
    google_place_types: l.place_types, google_summary: l.editorial_summary,
    website_excerpt: l.site_text, has_email: !!l.email,
  };
  const user = 'Business facts (JSON):\n' + JSON.stringify(facts, null, 2) + '\n\nReturn the JSON object.';
  return { json: Object.assign({}, l, { request: { url: CONFIG.anthropicBase + '/v1/messages', body: claudeBody(CONFIG, SYSTEM, user, SCHEMA, 16000) } }) };
});
