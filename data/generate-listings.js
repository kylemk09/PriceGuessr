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

// --- Geocoding: approximate lat/lng for Select City mode -------------------
// Only US/Canada listings get coordinates (Select City is scoped to those
// two countries -- see lib/currencies.js's country detection for the same
// last-comma-segment approach used here). City-center coordinates are an
// accepted v1 tradeoff -- multiple listings in the same city share one
// point. IMPORTANT: this must never consume `rand()` -- it's a pure lookup
// appended after every other field is already generated, so it can't
// perturb the deterministic PRNG sequence the rest of the dataset depends on.

const US_ONLY_LAST_SEGMENTS = new Set(['usa', 'united states', 'u.s. virgin islands']);

// Mirrors currencyForLocation's last-comma-segment approach, but unambiguous
// about US vs "defaulted to USD because we didn't recognize the country" --
// currencyForLocation itself can't be reused here since unrecognized
// countries also default to USD.
function isUsCanadaLocation(roughLocation) {
  if (!roughLocation) return true; // parseLocation's own no-location default is a random US city
  const parts = roughLocation.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  return US_ONLY_LAST_SEGMENTS.has(last) || last === 'canada';
}

// City-center coordinates, keyed by lowercased city name, for every US/Canada
// city currently in the photo pool. No cross-country name collisions exist in
// this dataset today; if a future research batch introduces one, or a city
// simply isn't in this table yet, REGION_CENTROIDS below still gives that
// listing a usable (if less precise) point instead of leaving it uncoded.
const CITY_COORDS = {
  brooklyn: [40.6782, -73.9442], 'deer isle': [44.2201, -68.6772],
  northfield: [44.4583, -93.1616], 'saint paul': [44.9537, -93.0900],
  tuckerton: [39.6009, -74.3388], 'williams bay': [42.5766, -88.5432],
  milwaukee: [43.0389, -87.9065], madison: [43.0731, -89.4012],
  midland: [43.6156, -84.2472], phoenix: [33.4484, -112.0740],
  roseburg: [43.2165, -123.3417], minden: [32.6152, -93.2865],
  ashland: [42.1946, -122.7095], 'west jordan': [40.6097, -111.9391],
  marshfield: [44.6689, -90.1718], paducah: [37.0834, -88.6000],
  lancaster: [37.6173, -84.5799], washington: [38.9072, -77.0369],
  tallahassee: [30.4383, -84.2807], baltimore: [39.2904, -76.6122],
  cincinnati: [39.1031, -84.5120], tacoma: [47.2529, -122.4443],
  cambridge: [42.3736, -71.1097], philadelphia: [39.9526, -75.1652],
  'salt lake city': [40.7608, -111.8910], columbia: [34.0007, -81.0348],
  seattle: [47.6062, -122.3321], carnation: [47.6484, -121.9165],
  'sodus bay': [43.2378, -76.9769], boston: [42.3601, -71.0589],
  raleigh: [35.7796, -78.6382], chicago: [41.8781, -87.6298],
  portland: [45.5152, -122.6784], tampa: [27.9506, -82.4572],
  'kansas city': [39.0997, -94.5786], downingtown: [40.0065, -75.7024],
  'bowling green': [41.3748, -83.6513], pittsburgh: [40.4406, -79.9959],
  conyers: [33.6698, -84.0171], southington: [41.6009, -72.8781],
  holyoke: [42.2042, -72.6162], fairfield: [41.1408, -73.2637],
  albuquerque: [35.0844, -106.6504], savannah: [32.0809, -81.0912],
  sacramento: [38.5816, -121.4944], chappaqua: [41.1598, -73.7871],
  detroit: [42.3314, -83.0458], 'west memphis': [35.1465, -90.1848],
  minneapolis: [44.9778, -93.2650], tujunga: [34.2606, -118.2870],
  lubbock: [33.5779, -101.8552], wayland: [42.5673, -77.5936],
  fredericksburg: [30.2752, -98.8720], 'glen rose': [32.2360, -97.7561],
  levelland: [33.5873, -102.3782], danbury: [41.3948, -73.4540],
  'del mar': [32.9595, -117.2653], austin: [30.2672, -97.7431],
  denison: [33.7557, -96.5361], carthage: [32.1554, -94.3388],
  ennis: [32.3293, -96.6250], carrollton: [32.9537, -96.8903],
  'carmel-by-the-sea': [36.5552, -121.9233], 'sea ranch': [38.7146, -123.4522],
  denver: [39.7392, -104.9903], sweetwater: [35.6006, -84.4610],
  boise: [43.6150, -116.2023], nashua: [42.7654, -71.4676],
  'east commack': [40.8437, -73.2929], morrison: [38.4392, -91.7857],
  wexford: [40.6323, -80.0570], 'new orleans': [29.9511, -90.0715],
  norfolk: [36.8508, -76.2859], morristown: [36.2140, -83.2952],
  gulfport: [30.3674, -89.0928], toccoa: [34.5773, -83.3324],
  buffalo: [42.8864, -78.8784], littleton: [39.6133, -105.0166],
  lakewood: [39.7047, -105.0814], dayton: [39.7589, -84.1916],
  'oklahoma city': [35.4676, -97.5164], harrisonburg: [38.4496, -78.8689],
  montebello: [34.0165, -118.1131], swansea: [41.7509, -71.1798],
  waco: [31.5493, -97.1467], 'camp hill': [40.2334, -76.9269],
  salisbury: [38.3607, -75.5994], bloomington: [40.4842, -88.9937],
  bryan: [30.6744, -96.3700], ypsilanti: [42.2411, -83.6130],
  'west bend': [43.4252, -88.1834],
  // Canada
  winnipeg: [49.8951, -97.1384], 'saint john': [45.2733, -66.0633],
  calgary: [51.0447, -114.0719], toronto: [43.6532, -79.3832],
  essex: [42.1728, -82.8228], stanley: [46.2965, -66.7473],
  markham: [43.8561, -79.3370], vancouver: [49.2827, -123.1207],
  montreal: [45.5019, -73.5674],
};

// Precise coordinates for specific famous properties -- more accurate than a
// city center since these are single well-known buildings, keyed by the
// property's `name` field in the famous-properties research files.
const FAMOUS_COORDS = {
  'Playboy Mansion': [34.0968, -118.4331],
  '220 Central Park South Penthouse': [40.7674, -73.9807],
  'One57 Penthouse': [40.7648, -73.9808],
  Graceland: [35.0457, -90.0226],
  'Biltmore Estate': [35.5410, -82.5515],
  Fallingwater: [39.9067, -79.4676],
  '432 Park Avenue Penthouse': [40.7617, -73.9718],
  'Willis Tower': [41.8789, -87.6359],
  'General Motors Building': [40.7639, -73.9734],
  'Waldorf Astoria New York': [40.7566, -73.9741],
  'Chrysler Building': [40.7516, -73.9755],
};

// State/province centroids -- safety net for any city not in CITY_COORDS
// (e.g. a future research batch) so a listing still gets usable coordinates
// instead of silently being excluded from Select City's candidate pool.
const STATE_CENTROID_LIST = [
  ['Alabama', 'AL', 32.8067, -86.7911], ['Alaska', 'AK', 61.3707, -152.4044],
  ['Arizona', 'AZ', 34.1682, -111.9309], ['Arkansas', 'AR', 34.7519, -92.1313],
  ['California', 'CA', 36.1162, -119.6816], ['Colorado', 'CO', 39.0598, -105.3111],
  ['Connecticut', 'CT', 41.5978, -72.7554], ['Delaware', 'DE', 39.3185, -75.5071],
  ['Florida', 'FL', 27.7663, -81.6868], ['Georgia', 'GA', 33.0406, -83.6431],
  ['Hawaii', 'HI', 21.0943, -157.4983], ['Idaho', 'ID', 44.2405, -114.4788],
  ['Illinois', 'IL', 40.3495, -88.9861], ['Indiana', 'IN', 39.8494, -86.2583],
  ['Iowa', 'IA', 42.0115, -93.2105], ['Kansas', 'KS', 38.5266, -96.7265],
  ['Kentucky', 'KY', 37.6681, -84.6701], ['Louisiana', 'LA', 31.1695, -91.8678],
  ['Maine', 'ME', 44.6939, -69.3819], ['Maryland', 'MD', 39.0639, -76.8021],
  ['Massachusetts', 'MA', 42.2302, -71.5301], ['Michigan', 'MI', 43.3266, -84.5361],
  ['Minnesota', 'MN', 45.6945, -93.9002], ['Mississippi', 'MS', 32.7416, -89.6787],
  ['Missouri', 'MO', 38.4561, -92.2884], ['Montana', 'MT', 46.9219, -110.4544],
  ['Nebraska', 'NE', 41.1254, -98.2681], ['Nevada', 'NV', 38.3135, -117.0554],
  ['New Hampshire', 'NH', 43.4525, -71.5639], ['New Jersey', 'NJ', 40.2989, -74.5210],
  ['New Mexico', 'NM', 34.8405, -106.2485], ['New York', 'NY', 42.1657, -74.9481],
  ['North Carolina', 'NC', 35.6301, -79.8064], ['North Dakota', 'ND', 47.5289, -99.7840],
  ['Ohio', 'OH', 40.3888, -82.7649], ['Oklahoma', 'OK', 35.5653, -96.9289],
  ['Oregon', 'OR', 44.5720, -122.0709], ['Pennsylvania', 'PA', 40.5908, -77.2098],
  ['Rhode Island', 'RI', 41.6809, -71.5118], ['South Carolina', 'SC', 33.8569, -80.9450],
  ['South Dakota', 'SD', 44.2998, -99.4388], ['Tennessee', 'TN', 35.7478, -86.6923],
  ['Texas', 'TX', 31.0545, -97.5635], ['Utah', 'UT', 40.1500, -111.8624],
  ['Vermont', 'VT', 44.0459, -72.7107], ['Virginia', 'VA', 37.7693, -78.1700],
  ['Washington', 'WA', 47.4009, -121.4905], ['West Virginia', 'WV', 38.4912, -80.9545],
  ['Wisconsin', 'WI', 44.2685, -89.6165], ['Wyoming', 'WY', 42.7560, -107.3025],
  ['District of Columbia', 'D.C.', 38.9072, -77.0369],
  // Canada provinces/territories
  ['Alberta', 'AB', 55.0001, -115.0001], ['British Columbia', 'BC', 53.7267, -127.6476],
  ['Manitoba', 'MB', 53.7609, -98.8139], ['New Brunswick', 'NB', 46.5653, -66.4619],
  ['Newfoundland and Labrador', 'NL', 53.1355, -57.6604], ['Nova Scotia', 'NS', 44.6820, -63.7443],
  ['Ontario', 'ON', 51.2538, -85.3232], ['Prince Edward Island', 'PE', 46.5107, -63.4168],
  ['Quebec', 'QC', 52.9399, -73.5491], ['Saskatchewan', 'SK', 52.9399, -106.4509],
  ['Northwest Territories', 'NT', 64.8255, -124.8457], ['Nunavut', 'NU', 70.2998, -83.1076],
  ['Yukon', 'YT', 64.2823, -135.0000],
  ['Canada', 'CANADA', 56.1304, -106.3468],
];
const REGION_CENTROIDS = STATE_CENTROID_LIST.reduce((map, [full, abbr, lat, lng]) => {
  map[full.toLowerCase()] = [lat, lng];
  map[abbr.toLowerCase()] = [lat, lng];
  return map;
}, {});

function geocode(city, state) {
  const cityKey = (city || '').toLowerCase().trim();
  if (CITY_COORDS[cityKey]) {
    const [lat, lng] = CITY_COORDS[cityKey];
    return { lat, lng };
  }
  const stateKey = (state || '').toLowerCase().trim();
  if (REGION_CENTROIDS[stateKey]) {
    const [lat, lng] = REGION_CENTROIDS[stateKey];
    return { lat, lng };
  }
  return {};
}

function geocodeFamous(name, state) {
  if (FAMOUS_COORDS[name]) {
    const [lat, lng] = FAMOUS_COORDS[name];
    return { lat, lng };
  }
  const stateKey = (state || '').toLowerCase().trim();
  if (REGION_CENTROIDS[stateKey]) {
    const [lat, lng] = REGION_CENTROIDS[stateKey];
    return { lat, lng };
  }
  return {};
}

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
    ...(isUsCanadaLocation(photo.roughLocation) ? geocode(city, state) : {}),
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
    ...(isUsCanadaLocation(photo.roughLocation) ? geocode(city, state) : {}),
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
    ...geocodeFamous(prop.name, prop.state),
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
    ...geocodeFamous(prop.name, prop.state),
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
