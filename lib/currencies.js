// Real-world currency data for every country represented in the listings
// dataset, plus the "Roll" wildcard feature (see game/engine.js). Rates are
// approximate USD conversion rates captured at build time (mid-market,
// July 2026) -- illustrative, not a live feed, same spirit as the rest of
// this app's disclaimed pricing data.
//
// A listing's `currency` field (set in data/generate-listings.js) is just a
// code (e.g. "GBP"); the full display metadata (symbol, name, flag, rate)
// always comes from this single table, looked up at request time -- so
// there is exactly one place to update if a rate needs refreshing.

const CURRENCY_TABLE = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', flag: '\u{1F1FA}\u{1F1F8}', rate: 1 },
  CAD: { code: 'CAD', symbol: '$', name: 'Canadian Dollar', flag: '\u{1F1E8}\u{1F1E6}', rate: 1.40 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', flag: '\u{1F1EC}\u{1F1E7}', rate: 0.74 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', flag: '\u{1F1EA}\u{1F1FA}', rate: 0.87 },
  AUD: { code: 'AUD', symbol: '$', name: 'Australian Dollar', flag: '\u{1F1E6}\u{1F1FA}', rate: 1.43 },
  NOK: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '\u{1F1F3}\u{1F1F4}', rate: 9.66 },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '\u{1F1F8}\u{1F1EA}', rate: 9.63 },
  DKK: { code: 'DKK', symbol: 'kr', name: 'Danish Krone', flag: '\u{1F1E9}\u{1F1F0}', rate: 6.53 },
  PLN: { code: 'PLN', symbol: 'zł', name: 'Polish Złoty', flag: '\u{1F1F5}\u{1F1F1}', rate: 3.79 },
  HUF: { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', flag: '\u{1F1ED}\u{1F1FA}', rate: 317 },
  MXN: { code: 'MXN', symbol: '$', name: 'Mexican Peso', flag: '\u{1F1F2}\u{1F1FD}', rate: 17.5 },
  IDR: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '\u{1F1EE}\u{1F1E9}', rate: 17965 },
  HKD: { code: 'HKD', symbol: '$', name: 'Hong Kong Dollar', flag: '\u{1F1ED}\u{1F1F0}', rate: 7.84 },
  EGP: { code: 'EGP', symbol: '£', name: 'Egyptian Pound', flag: '\u{1F1EA}\u{1F1EC}', rate: 51.24 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '\u{1F1FF}\u{1F1E6}', rate: 16.56 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '\u{1F1E7}\u{1F1F7}', rate: 5.07 },
  NZD: { code: 'NZD', symbol: '$', name: 'New Zealand Dollar', flag: '\u{1F1F3}\u{1F1FF}', rate: 1.72 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '\u{1F1EF}\u{1F1F5}', rate: 163 },
  CHF: { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', flag: '\u{1F1E8}\u{1F1ED}', rate: 0.81 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '\u{1F1EE}\u{1F1F3}', rate: 96.49 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '\u{1F1F0}\u{1F1F7}', rate: 1480 },
  VND: { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', flag: '\u{1F1FB}\u{1F1F3}', rate: 26310 },
  CZK: { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', flag: '\u{1F1E8}\u{1F1FF}', rate: 21.19 },
  BSD: { code: 'BSD', symbol: '$', name: 'Bahamian Dollar', flag: '\u{1F1E7}\u{1F1F8}', rate: 1 },
  NPR: { code: 'NPR', symbol: '₨', name: 'Nepalese Rupee', flag: '\u{1F1F3}\u{1F1F5}', rate: 144.55 },
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '\u{1F1F5}\u{1F1ED}', rate: 61.75 },
  SRD: { code: 'SRD', symbol: '$', name: 'Surinamese Dollar', flag: '\u{1F1F8}\u{1F1F7}', rate: 37.67 },
};

// Keyed by the exact final comma-separated segment of a location string
// (e.g. "Wagga Wagga, New South Wales, Australia" -> "australia"). Matching
// only the final segment -- rather than substring-searching the whole
// string -- avoids false positives like "New Mexico" containing "mexico" or
// "New South Wales" containing "wales". Anything that doesn't match exactly
// defaults to USD, correct for the USA/territories that make up most of the
// dataset.
const EXACT_COUNTRY_CURRENCY = {
  usa: 'USD', 'united states': 'USD', 'u.s. virgin islands': 'USD',
  canada: 'CAD',
  uk: 'GBP', 'united kingdom': 'GBP', england: 'GBP', scotland: 'GBP', wales: 'GBP', 'channel islands': 'GBP', guernsey: 'GBP',
  ireland: 'EUR', germany: 'EUR', spain: 'EUR', italy: 'EUR', netherlands: 'EUR', france: 'EUR',
  belgium: 'EUR', greece: 'EUR', austria: 'EUR', portugal: 'EUR',
  denmark: 'DKK',
  norway: 'NOK',
  sweden: 'SEK',
  poland: 'PLN',
  hungary: 'HUF',
  egypt: 'EGP',
  mexico: 'MXN',
  indonesia: 'IDR',
  australia: 'AUD',
  'hong kong': 'HKD',
  'south africa': 'ZAR',
  brazil: 'BRL',
  'new zealand': 'NZD',
  japan: 'JPY',
  switzerland: 'CHF',
  india: 'INR',
  'south korea': 'KRW',
  vietnam: 'VND',
  'czech republic': 'CZK', czechia: 'CZK',
  bahamas: 'BSD',
  nepal: 'NPR',
  philippines: 'PHP',
  suriname: 'SRD',
  // Zimbabwe runs a USD/ZiG dual-currency system where USD is the dominant,
  // preferred currency in practice -- USD is the accurate everyday choice,
  // not a fallback default.
  zimbabwe: 'USD',
};

function currencyForLocation(roughLocation) {
  if (!roughLocation) return 'USD';
  const parts = roughLocation.split(',').map((s) => s.trim()).filter(Boolean);
  const lastSegment = (parts[parts.length - 1] || '').toLowerCase();
  return EXACT_COUNTRY_CURRENCY[lastSegment] || 'USD';
}

function getCurrency(code) {
  return CURRENCY_TABLE[code] || CURRENCY_TABLE.USD;
}

function randomCurrencyCode(excludeCode) {
  const codes = Object.keys(CURRENCY_TABLE).filter((c) => c !== excludeCode);
  return codes[Math.floor(Math.random() * codes.length)];
}

module.exports = { CURRENCY_TABLE, currencyForLocation, getCurrency, randomCurrencyCode };
