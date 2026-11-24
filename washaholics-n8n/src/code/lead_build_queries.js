// Picks today's Google Places searches, rotating London areas and segments so
// each day explores different parts of the city.
const SEGMENTS = {
  property_management: ['property management company', 'block management company', 'estate management agency', 'facilities management company'],
  hotel: ['hotel', 'boutique hotel', 'aparthotel'],
  restaurant: ['restaurant', 'gastropub', 'restaurant with outdoor seating'],
  commercial_complex: ['shopping centre', 'business park', 'serviced office building', 'commercial property management'],
};
const AREAS = ['Westminster', 'Camden', 'Islington', 'Hackney', 'Tower Hamlets', 'Southwark', 'Lambeth',
  'Kensington and Chelsea', 'Hammersmith and Fulham', 'Wandsworth', 'City of London', 'Canary Wharf',
  'Shoreditch', 'Mayfair', 'Marylebone', 'Paddington', 'Kings Cross', 'Clerkenwell', 'Battersea',
  'Greenwich', 'Lewisham', 'Croydon', 'Wimbledon', 'Richmond', 'Ealing', 'Brent', 'Barnet', 'Haringey',
  'Stratford', 'Hounslow', 'Kingston upon Thames', 'Bromley', 'Harrow', 'Enfield', 'Ilford', 'Sutton'];

// Share of daily searches per segment (property management is the core market).
const PLAN = CONFIG.segmentPlan || ['property_management', 'property_management', 'hotel', 'restaurant', 'commercial_complex', 'property_management'];
const day = Math.floor(new Date(CONFIG.runAt || Date.now()).getTime() / 86400000);
const out = PLAN.map((segment, i) => {
  const terms = SEGMENTS[segment] || [segment];
  const term = terms[(day + i) % terms.length];
  const area = AREAS[(day * 5 + i * 7) % AREAS.length];
  const textQuery = term + ' in ' + area + ', London';
  return { json: { segment, textQuery, request: {
    url: CONFIG.placesBase + '/v1/places:searchText',
    body: {
      textQuery,
      pageSize: 20,
      languageCode: 'en',
      regionCode: 'GB',
      locationRestriction: { rectangle: { low: { latitude: 51.28, longitude: -0.51 }, high: { latitude: 51.70, longitude: 0.33 } } },
    },
  } } };
});
return out;
