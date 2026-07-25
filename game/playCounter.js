// A private counter of completed games -- not exposed in the UI anywhere.
// Incremented once per finished game (all rounds guessed), same trigger
// point as the leaderboard prompt and each player's own localStorage "games
// played" stat, so the definition of "played" stays consistent app-wide.
// Read back only via the secret-protected route in server.js.
//
// Uses MySQL when configured (see lib/db.js) so the count survives a
// redeploy in production; falls back to a local JSON file when no database
// is configured, purely so local development needs zero setup.

const fs = require('fs');
const path = require('path');
const { isConfigured, getPool } = require('../lib/db');

const FILE = path.join(__dirname, '..', 'data', 'runtime', 'play-count.json');

function loadFile() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { totalGamesPlayed: parsed.totalGamesPlayed || 0 };
  } catch (e) {
    return { totalGamesPlayed: 0 };
  }
}

let fileStore = loadFile();

function saveFile() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(fileStore, null, 2));
}

async function incrementGamesPlayed() {
  if (isConfigured()) {
    const db = getPool();
    await db.query('INSERT INTO games_played (created_at) VALUES (NOW())');
    return;
  }
  fileStore.totalGamesPlayed += 1;
  saveFile();
}

async function getGamesPlayedCount() {
  if (isConfigured()) {
    const db = getPool();
    const [rows] = await db.query('SELECT COUNT(*) AS count FROM games_played');
    return rows[0].count;
  }
  return fileStore.totalGamesPlayed;
}

module.exports = { incrementGamesPlayed, getGamesPlayedCount };
