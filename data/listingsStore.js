// Thin loader around data/listings.json. Kept as its own module so
// server.js and game/engine.js share one in-memory copy, and so this is the
// single place to change if listings.json is later replaced by a real
// MLS/API-backed source.

const listings = require('./listings.json');

const listingsById = new Map(listings.map((l) => [l.id, l]));

module.exports = {
  listings,
  getListingById: (id) => listingsById.get(id),
};
