// Generator for data/listings.json.
// Not required at runtime -- re-run with `npm run generate-listings` if you
// want to regenerate, or hand-edit listings.json directly to swap in real
// listing data / a real API response later.
//
// Two real, freely-licensed data sources feed this:
//   - data/research/commons-house-photos.json: real photographs of real
//     ordinary houses, sourced from Wikimedia Commons under free licenses
//     (public domain / CC0 / CC-BY / CC-BY-SA). Stats (address, sqft, beds,
//     baths, price) for these are procedurally generated and illustrative --
//     NOT verified facts about the literal house in the photo. See the
//     in-app footer disclaimer.
//   - data/research/famous-properties.json: a small curated set of real,
//     famous, publicly documented properties (mansions/estates/penthouses)
//     with real photos AND a real publicly reported sale price or estimated
//     value, with a source note shown after each guess.

const fs = require('fs');
const path = require('path');
const { mulberry32 } = require('../lib/prng');

// Deterministic PRNG so the generated set is reproducible across machines.
const rand = mulberry32(42);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

// city: [displayName, state, costMultiplier relative to national baseline]
const CITIES = [
  ['Austin', 'TX', 1.15], ['Boise', 'ID', 0.95], ['Nashville', 'TN', 1.05],
  ['Columbus', 'OH', 0.8], ['Phoenix', 'AZ', 1.0], ['Denver', 'CO', 1.3],
  ['Raleigh', 'NC', 0.95], ['Tampa', 'FL', 1.0], ['Sacramento', 'CA', 1.4],
  ['Portland', 'OR', 1.3], ['Charlotte', 'NC', 0.95], ['Salt Lake City', 'UT', 1.1],
  ['Indianapolis', 'IN', 0.7], ['Kansas City', 'MO', 0.75], ['Cleveland', 'OH', 0.65],
  ['San Antonio', 'TX', 0.85], ['Orlando', 'FL', 1.0], ['Richmond', 'VA', 0.9],
  ['Milwaukee', 'WI', 0.8], ['Albuquerque', 'NM', 0.8], ['Boston', 'MA', 1.9],
  ['Seattle', 'WA', 1.7], ['Minneapolis', 'MN', 0.95], ['Pittsburgh', 'PA', 0.75],
  ['Atlanta', 'GA', 1.05],
];
// Extra multipliers for real photo locations outside the CITIES pool above
// (used only for price-model bias; falls back to 1.0 if nothing matches).
const EXTRA_CITY_MULTIPLIERS = {
  'new york': 2.2, brooklyn: 1.9, 'los angeles': 1.9, 'san francisco': 2.1,
  chicago: 1.2, philadelphia: 1.1, memphis: 0.75, miami: 1.5,
  'saint paul': 0.9, 'st. paul': 0.9, baltimore: 0.85, detroit: 0.6,
};
const CITY_MULTIPLIER_MAP = Object.assign(
  {},
  EXTRA_CITY_MULTIPLIERS,
  Object.fromEntries(CITIES.map(([name, , mult]) => [name.toLowerCase(), mult]))
);
function multiplierFor(locationString) {
  if (!locationString) return 1.0;
  const lower = locationString.toLowerCase();
  const hit = Object.keys(CITY_MULTIPLIER_MAP).find((key) => lower.includes(key));
  return hit ? CITY_MULTIPLIER_MAP[hit] : 1.0;
}

const STREET_NAMES = [
  'Maple', 'Oak', 'Cedar', 'Elm', 'Birch', 'Willow', 'Sunset', 'Meadow',
  'Ridge', 'Hillcrest', 'Lakeview', 'Riverside', 'Pinehurst', 'Magnolia',
  'Aspen', 'Prairie', 'Canyon', 'Harbor', 'Orchard', 'Vista', 'Foxglove',
  'Juniper', 'Sycamore', 'Bellwood', 'Windsor',
];
const STREET_TYPES = ['St', 'Ave', 'Ln', 'Dr', 'Ct', 'Way', 'Blvd', 'Rd', 'Ter'];

const HOME_TYPES = ['Single Family', 'Townhouse', 'Condo', 'Bungalow', 'Ranch'];

// Real listings are rarely priced at a flat round number -- agents commonly
// price psychologically (ending in ,900 / ,500) or the market just lands on
// an odd figure. Round to the nearest $100 and nudge suspiciously round
// numbers (exact multiples of $50,000) so they don't look synthetic.
function humanizePrice(raw) {
  let price = Math.round(raw / 100) * 100;
  const pattern = rand();
  if (pattern < 0.3) {
    price = Math.floor(price / 1000) * 1000 + 900;
  } else if (pattern < 0.55) {
    price = Math.floor(price / 1000) * 1000 + 500;
  } else if (pattern < 0.7) {
    price = Math.floor(price / 100) * 100 + pick([50, 150, 250, 350, 650, 750]);
  }
  if (price % 50000 === 0) {
    price += randInt(1, 40) * 100;
  }
  return price;
}

// Several Commons categories contain many photos of the very same house
// (numbered angles like "(1)"/"(2)") or of a whole tract of near-identical
// houses shot as a numbered sequence. Collapse those down to one photo per
// apparent real building so the same house never appears twice in the game.
function dedupeKey(entry) {
  const file = decodeURIComponent(entry.imageUrl.split('/').pop() || '');
  const base = file
    .replace(/\.[a-zA-Z]+$/, '')
    .replace(/[_\s]?\(\d+\)$/, '')
    .replace(/[_\s]?\d{1,3}$/, '');
  return `${base}::${entry.roughLocation || ''}`;
}

function dedupePhotos(photos) {
  const seen = new Set();
  const result = [];
  for (const p of photos) {
    const key = dedupeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

function parseLocation(roughLocation) {
  if (!roughLocation) {
    const [city, state] = pick(CITIES);
    return { city, state };
  }
  const parts = roughLocation.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const state = last.toUpperCase() === 'USA' ? parts[parts.length - 2] || '' : last;
    return { city: parts[0], state };
  }
  return { city: parts[0] || 'Unknown', state: '' };
}

function buildRegularListing(id, photo) {
  const homeType = HOME_TYPES.includes(photo.suggestedHomeType) ? photo.suggestedHomeType : 'Single Family';
  const { city, state } = parseLocation(photo.roughLocation);
  const mult = multiplierFor(photo.roughLocation);

  const beds = randInt(1, 6);
  const baths = Math.max(1, Math.min(5, beds - randInt(0, 1) + (rand() > 0.5 ? 1 : 0)));
  const baseSqftPerBed = randInt(380, 620);
  const sqft = Math.round((beds * baseSqftPerBed + randInt(-150, 400)) / 10) * 10;
  const yearBuilt = randInt(1910, 2024);

  // Rough, illustrative price model: base $/sqft, adjusted by a location cost
  // multiplier, a small age discount/premium, and noise. This is NOT a real
  // valuation model, and it is NOT the verified sale price of the pictured
  // house -- just enough spread to make guessing meaningful. See the footer
  // disclaimer.
  const ageFactor = yearBuilt > 2015 ? 1.12 : yearBuilt < 1960 ? 0.92 : 1.0;
  const basePricePerSqft = randInt(140, 260);
  let price = sqft * basePricePerSqft * mult * ageFactor;
  price *= 0.9 + rand() * 0.2; // +/-10% noise
  price = humanizePrice(price);

  const streetNum = randInt(100, 9999);
  const address = `${streetNum} ${pick(STREET_NAMES)} ${pick(STREET_TYPES)}`;

  return {
    id,
    address,
    city,
    state,
    homeType,
    price,
    sqft,
    beds,
    baths,
    yearBuilt,
    image: photo.imageUrl,
    imageCredit: `${photo.attribution} — ${photo.license}, via Wikimedia Commons`,
    isFamous: false,
  };
}

function buildFamousListing(id, prop) {
  return {
    id,
    address: prop.name,
    city: `${prop.streetAddress}, ${prop.city}`,
    state: prop.state,
    homeType: prop.homeType,
    price: prop.price,
    sqft: prop.sqft,
    beds: prop.beds,
    baths: prop.baths,
    yearBuilt: prop.yearBuilt,
    image: prop.image,
    imageCredit: prop.imageCredit,
    isFamous: true,
    priceSource: prop.priceSource,
  };
}

const rawPhotos = require('./research/commons-house-photos.json');
const famousProperties = require('./research/famous-properties.json');

const dedupedPhotos = dedupePhotos(rawPhotos);

let nextId = 1;
const regularListings = dedupedPhotos.map((photo) => buildRegularListing(nextId++, photo));
const famousListings = famousProperties.map((prop) => buildFamousListing(nextId++, prop));

const listings = [...regularListings, ...famousListings];

fs.writeFileSync(
  path.join(__dirname, 'listings.json'),
  JSON.stringify(listings, null, 2) + '\n'
);

console.log(
  `Generated ${listings.length} listings -> data/listings.json ` +
    `(${rawPhotos.length} raw photos -> ${dedupedPhotos.length} unique regular + ${famousListings.length} famous)`
);
