// Generator for data/listings.json.
// Not required at runtime -- re-run with `npm run generate-listings` if you
// want to regenerate, or hand-edit listings.json directly to swap in real
// listing data / a real API response later.
//
// Real, freely-licensed data sources feed this:
//   - data/research/commons-house-photos.json + commons-house-photos-batch2.json:
//     real photographs of real ordinary houses, sourced from Wikimedia
//     Commons under free licenses (public domain / CC0 / CC-BY / CC-BY-SA).
//     Stats (address, sqft, beds, baths, price) for these are procedurally
//     generated and illustrative -- NOT verified facts about the literal
//     house in the photo. See the in-app footer disclaimer.
//   - data/research/commons-commercial-photos.json: same idea, for ordinary
//     commercial buildings (banks, motels, strip malls, small office
//     buildings) -- stats/price also illustrative.
//   - data/research/famous-properties.json + famous-commercial-properties.json:
//     small curated sets of real, famous, publicly documented properties
//     (mansions/estates/penthouses/office towers/hotels) with real photos
//     AND a real publicly reported sale price or estimated value, with a
//     source note shown after each guess.

const fs = require('fs');
const path = require('path');
const { mulberry32 } = require('../lib/prng');
const { currencyForLocation } = require('../lib/currencies');

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
const COMMERCIAL_TYPES = ['Office Building', 'Office Tower', 'Retail Center', 'Hotel', 'Mixed-Use', 'Warehouse'];

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

// Several Commons categories contain many photos of the very same building
// (numbered angles like "(1)"/"(2)") or of a whole tract of near-identical
// houses shot as a numbered sequence. Collapse those down to one photo per
// apparent real building so the same one never appears twice in the game.
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

// Country-only strings ("USA", "Canada") aren't a usable city name -- fall
// back to a real city rather than displaying the country as if it were one.
// Must stay country-appropriate: falling back to a US city for a bare
// "United Kingdom" would show e.g. "Albuquerque, NM" while still correctly
// pricing in GBP (via currencyForLocation, which reads the untouched raw
// string) -- a nonsensical combination. Each non-US country gets its own
// small fallback pool; anything not listed here falls back to the US CITIES
// pool, which is correct for "USA" / "U.S. Virgin Islands" / no location.
const COUNTRY_FALLBACK_CITIES = {
  'united kingdom': [['London', 'England'], ['Manchester', 'England'], ['Edinburgh', 'Scotland']],
  uk: [['London', 'England'], ['Manchester', 'England'], ['Edinburgh', 'Scotland']],
  canada: [['Toronto', 'ON'], ['Vancouver', 'BC'], ['Calgary', 'AB'], ['Montreal', 'QC']],
  germany: [['Berlin', 'Germany'], ['Munich', 'Germany'], ['Hamburg', 'Germany']],
  poland: [['Warsaw', 'Poland'], ['Krakow', 'Poland']],
  sweden: [['Stockholm', 'Sweden'], ['Gothenburg', 'Sweden']],
  france: [['Paris', 'France'], ['Lyon', 'France'], ['Marseille', 'France']],
  netherlands: [['Amsterdam', 'Netherlands'], ['Rotterdam', 'Netherlands'], ['Utrecht', 'Netherlands']],
  italy: [['Rome', 'Italy'], ['Milan', 'Italy'], ['Florence', 'Italy']],
  japan: [['Tokyo', 'Japan'], ['Osaka', 'Japan'], ['Kyoto', 'Japan']],
  spain: [['Madrid', 'Spain'], ['Barcelona', 'Spain'], ['Valencia', 'Spain']],
  norway: [['Oslo', 'Norway'], ['Bergen', 'Norway']],
  portugal: [['Lisbon', 'Portugal'], ['Porto', 'Portugal']],
  switzerland: [['Zurich', 'Switzerland'], ['Geneva', 'Switzerland']],
  brazil: [['São Paulo', 'Brazil'], ['Rio de Janeiro', 'Brazil']],
  india: [['Mumbai', 'India'], ['Delhi', 'India'], ['Bangalore', 'India']],
  'south africa': [['Cape Town', 'South Africa'], ['Johannesburg', 'South Africa']],
};
const COUNTRY_ONLY_NAMES = new Set([
  'usa', 'united states', 'u.s. virgin islands',
  ...Object.keys(COUNTRY_FALLBACK_CITIES),
]);

// A handful of research entries only had a state name, not a city (e.g.
// "Pennsylvania, USA") -- without this, parseLocation would show the state
// name as both city and state ("Pennsylvania, Pennsylvania"). Substitute a
// real city from that state (from CITIES) when we have one, else fall back
// to a random city entirely.
const US_STATE_ABBR = {
  pennsylvania: 'PA', 'new mexico': 'NM', california: 'CA', ohio: 'OH',
  texas: 'TX', florida: 'FL', 'north carolina': 'NC', tennessee: 'TN',
};

function cityForStateAbbr(abbr) {
  const match = CITIES.find(([, state]) => state === abbr);
  return match ? match[0] : null;
}

function parseLocation(roughLocation) {
  if (!roughLocation) {
    const [city, state] = pick(CITIES);
    return { city, state };
  }
  const parts = roughLocation.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2 && US_STATE_ABBR[parts[0].toLowerCase()] && parts[1].toUpperCase() === 'USA') {
    const abbr = US_STATE_ABBR[parts[0].toLowerCase()];
    const city = cityForStateAbbr(abbr);
    if (city) return { city, state: abbr };
    const [fallbackCity, fallbackState] = pick(CITIES);
    return { city: fallbackCity, state: fallbackState };
  }
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (last.toUpperCase() === 'USA') {
      if (parts.length >= 3) {
        // "City, State, USA" -- proper 3+ part US address.
        return { city: parts[0], state: parts[parts.length - 2] };
      }
      // "X, USA" where X isn't a recognized full state name (that's handled
      // above) -- X is an ambiguous region/descriptor (e.g. "Southern
      // California"), not a usable city+state pair by itself. Falling back
      // to parts[0] for both would show the same value as city AND state;
      // use a random real city instead.
      const [fallbackCity, fallbackState] = pick(CITIES);
      return { city: fallbackCity, state: fallbackState };
    }
    // International "City, Country" (or "City, Region, Country" -- we only
    // need city + country here).
    return { city: parts[0], state: last };
  }
  if (parts.length === 1 && COUNTRY_ONLY_NAMES.has(parts[0].toLowerCase())) {
    const countryPool = COUNTRY_FALLBACK_CITIES[parts[0].toLowerCase()];
    const [city, state] = countryPool ? pick(countryPool) : pick(CITIES);
    return { city, state };
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
    category: 'residential',
    currency: currencyForLocation(photo.roughLocation),
    price,
    sqft,
    beds,
    baths,
    floors: null,
    yearBuilt,
    image: photo.imageUrl,
    imageCredit: `${photo.attribution} — ${photo.license}, via Wikimedia Commons`,
    isFamous: false,
  };
}

function buildCommercialListing(id, photo) {
  const buildingType = COMMERCIAL_TYPES.includes(photo.suggestedBuildingType) ? photo.suggestedBuildingType : 'Office Building';
  const { city, state } = parseLocation(photo.roughLocation);
  const mult = multiplierFor(photo.roughLocation);

  const floors = photo.suggestedFloors && photo.suggestedFloors > 0 ? photo.suggestedFloors : randInt(1, 3);
  const sqftPerFloor = randInt(4000, 14000);
  const sqft = Math.round((floors * sqftPerFloor) / 100) * 100;
  const yearBuilt = randInt(1920, 2022);

  // Same illustrative-only approach as residential, with a commercial
  // per-sqft baseline instead (lower $/sqft than prime housing, but much
  // larger footprints, so totals still land in a meaningfully different --
  // and usually higher -- range than a house).
  const ageFactor = yearBuilt > 2010 ? 1.08 : yearBuilt < 1960 ? 0.9 : 1.0;
  const basePricePerSqft = randInt(90, 220);
  let price = sqft * basePricePerSqft * mult * ageFactor;
  price *= 0.9 + rand() * 0.2;
  price = humanizePrice(price);

  const streetNum = randInt(100, 9999);
  const address = `${streetNum} ${pick(STREET_NAMES)} ${pick(STREET_TYPES)}`;

  return {
    id,
    address,
    city,
    state,
    homeType: buildingType,
    category: 'commercial',
    currency: currencyForLocation(photo.roughLocation),
    price,
    sqft,
    beds: null,
    baths: null,
    floors,
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
    category: 'residential',
    currency: prop.currency || 'USD', // explicit per-property; defaults to USD for older entries that predate international famous properties
    price: prop.price,
    sqft: prop.sqft,
    beds: prop.beds,
    baths: prop.baths,
    floors: null,
    yearBuilt: prop.yearBuilt,
    image: prop.image,
    imageCredit: prop.imageCredit,
    isFamous: true,
    priceSource: prop.priceSource,
  };
}

function buildFamousCommercialListing(id, prop) {
  return {
    id,
    address: prop.name,
    city: `${prop.streetAddress}, ${prop.city}`,
    state: prop.state,
    homeType: prop.buildingType,
    category: 'commercial',
    currency: prop.currency || 'USD', // explicit per-property; defaults to USD for older entries that predate international famous properties
    price: prop.price,
    sqft: prop.sqft,
    beds: null,
    baths: null,
    floors: prop.floors,
    yearBuilt: prop.yearBuilt,
    image: prop.image,
    imageCredit: prop.imageCredit,
    isFamous: true,
    priceSource: prop.priceSource,
  };
}

const residentialPhotosBatch1 = require('./research/commons-house-photos.json');
const residentialPhotosBatch2 = require('./research/commons-house-photos-batch2.json');
const residentialPhotosBatch3 = require('./research/commons-house-photos-batch3.json');
const commercialPhotosBatch1 = require('./research/commons-commercial-photos.json');
const commercialPhotosBatch2 = require('./research/commons-commercial-photos-batch2.json');
const famousProperties = require('./research/famous-properties.json');
const famousCommercialProperties = require('./research/famous-commercial-properties.json');

const dedupedResidentialPhotos = dedupePhotos([...residentialPhotosBatch1, ...residentialPhotosBatch2, ...residentialPhotosBatch3]);
const dedupedCommercialPhotos = dedupePhotos([...commercialPhotosBatch1, ...commercialPhotosBatch2]);

let nextId = 1;
const residentialListings = dedupedResidentialPhotos.map((photo) => buildRegularListing(nextId++, photo));
const commercialListings = dedupedCommercialPhotos.map((photo) => buildCommercialListing(nextId++, photo));
const famousListings = famousProperties.map((prop) => buildFamousListing(nextId++, prop));
const famousCommercialListings = famousCommercialProperties.map((prop) => buildFamousCommercialListing(nextId++, prop));

const listings = [...residentialListings, ...commercialListings, ...famousListings, ...famousCommercialListings];

fs.writeFileSync(
  path.join(__dirname, 'listings.json'),
  JSON.stringify(listings, null, 2) + '\n'
);

console.log(
  `Generated ${listings.length} listings -> data/listings.json ` +
    `(${dedupedResidentialPhotos.length} residential + ${dedupedCommercialPhotos.length} commercial + ` +
    `${famousListings.length} famous residential + ${famousCommercialListings.length} famous commercial)`
);
