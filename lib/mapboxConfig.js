// Optional Mapbox config for the Select City map picker. Mirrors the
// isConfigured() pattern in lib/db.js: the token is only ever read from an
// environment variable (never hardcoded), and everything that depends on it
// degrades gracefully when it's absent -- see public/js/citymap.js, which
// shows a "map setup pending" notice instead of trying to load Mapbox GL JS.
//
// Unlike the DB_* vars, Hostinger has no auto-detection/injection behavior
// for this one -- it's a plain env var you set once in hPanel.

function getToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || null;
}

function isConfigured() {
  return !!getToken();
}

module.exports = { getToken, isConfigured };
