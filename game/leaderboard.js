// Leaderboard storage: two boards, "quick" (all-time top scores) and "daily"
// (one board per calendar date, keyed by the same dailyKey used for the
// Daily Challenge itself, so it naturally resets each day).
//
// Uses MySQL when configured (see lib/db.js) -- this is what actually
// survives a redeploy in production. Falls back to a small JSON file when
// no database is configured, purely so local development works with zero
// setup. Callers always get a Promise back regardless of which backend is
// active.

const fs = require('fs');
const path = require('path');
const { isConfigured, getPool } = require('../lib/db');

const FILE = path.join(__dirname, '..', 'data', 'runtime', 'leaderboard.json');
const MAX_STORED_PER_BOARD = 50;
const MAX_NAME_LENGTH = 20;
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

function sanitizeName(name) {
  const cleaned = String(name || '')
    .replace(CONTROL_CHARS_RE, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || 'Anonymous';
}

// --- File-backed fallback (local dev only) ---------------------------------

function loadFileStore() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { quick: parsed.quick || [], daily: parsed.daily || {} };
  } catch (e) {
    return { quick: [], daily: {} };
  }
}

function saveFileStore(store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

let fileStore = loadFileStore();

function submitScoreToFile({ mode, dailyKey, name, score, streak }) {
  const entry = { name: sanitizeName(name), score, streak, date: new Date().toISOString() };

  if (mode === 'daily' && dailyKey) {
    if (!fileStore.daily[dailyKey]) fileStore.daily[dailyKey] = [];
    fileStore.daily[dailyKey].push(entry);
    fileStore.daily[dailyKey].sort((a, b) => b.score - a.score);
    fileStore.daily[dailyKey] = fileStore.daily[dailyKey].slice(0, MAX_STORED_PER_BOARD);
  } else {
    fileStore.quick.push(entry);
    fileStore.quick.sort((a, b) => b.score - a.score);
    fileStore.quick = fileStore.quick.slice(0, MAX_STORED_PER_BOARD);
  }

  saveFileStore(fileStore);
  return entry;
}

function getTopFromFile(mode, dailyKey, limit) {
  const board = mode === 'daily' ? fileStore.daily[dailyKey] || [] : fileStore.quick;
  return board.slice(0, limit);
}

// --- MySQL-backed (production) ----------------------------------------------

async function submitScoreToDb({ mode, dailyKey, name, score, streak }) {
  const cleanName = sanitizeName(name);
  const isDaily = mode === 'daily' && !!dailyKey;
  const db = getPool();
  await db.query(
    'INSERT INTO leaderboard_entries (mode, daily_key, name, score, streak) VALUES (?, ?, ?, ?, ?)',
    [isDaily ? 'daily' : 'quick', isDaily ? dailyKey : null, cleanName, score, streak]
  );
  return { name: cleanName, score, streak, date: new Date().toISOString() };
}

async function getTopFromDb(mode, dailyKey, limit) {
  const db = getPool();
  const isDaily = mode === 'daily';
  const [rows] = isDaily
    ? await db.query(
        'SELECT name, score, streak, created_at AS date FROM leaderboard_entries WHERE mode = ? AND daily_key = ? ORDER BY score DESC LIMIT ?',
        ['daily', dailyKey, limit]
      )
    : await db.query(
        'SELECT name, score, streak, created_at AS date FROM leaderboard_entries WHERE mode = ? AND daily_key IS NULL ORDER BY score DESC LIMIT ?',
        ['quick', limit]
      );
  return rows;
}

// --- Public API --------------------------------------------------------

async function submitScore(args) {
  return isConfigured() ? submitScoreToDb(args) : submitScoreToFile(args);
}

async function getTop(mode, dailyKey, limit = 10) {
  return isConfigured() ? getTopFromDb(mode, dailyKey, limit) : getTopFromFile(mode, dailyKey, limit);
}

module.exports = { submitScore, getTop };
