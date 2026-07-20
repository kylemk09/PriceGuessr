// A tiny file-backed leaderboard store -- no external database needed for
// this app's scale. Two boards: "quick" (all-time top scores) and "daily"
// (one board per calendar date, keyed by the same dailyKey used for the
// Daily Challenge itself, so it naturally resets each day).
//
// v2 idea: swap this module for a real database-backed one (e.g. SQLite or
// Postgres) if concurrent write volume ever outgrows a single JSON file --
// nothing outside this file knows or cares how scores are persisted.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'runtime', 'leaderboard.json');
const MAX_STORED_PER_BOARD = 50;
const MAX_NAME_LENGTH = 20;
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

function loadStore() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { quick: parsed.quick || [], daily: parsed.daily || {} };
  } catch (e) {
    return { quick: [], daily: {} };
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

// In-memory cache, written through to disk on every change. Fine at this
// app's traffic scale (single process, no clustering).
let store = loadStore();

function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || 'Anonymous';
}

function submitScore({ mode, dailyKey, name, score, streak }) {
  const entry = {
    name: sanitizeName(name),
    score,
    streak,
    date: new Date().toISOString(),
  };

  if (mode === 'daily' && dailyKey) {
    if (!store.daily[dailyKey]) store.daily[dailyKey] = [];
    store.daily[dailyKey].push(entry);
    store.daily[dailyKey].sort((a, b) => b.score - a.score);
    store.daily[dailyKey] = store.daily[dailyKey].slice(0, MAX_STORED_PER_BOARD);
  } else {
    store.quick.push(entry);
    store.quick.sort((a, b) => b.score - a.score);
    store.quick = store.quick.slice(0, MAX_STORED_PER_BOARD);
  }

  saveStore(store);
  return entry;
}

function getTop(mode, dailyKey, limit = 10) {
  const board = mode === 'daily' ? store.daily[dailyKey] || [] : store.quick;
  return board.slice(0, limit);
}

module.exports = { submitScore, getTop };
