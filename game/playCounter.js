// A private, file-backed counter of completed games -- not exposed in the UI
// anywhere. Incremented once per finished game (all rounds guessed), same
// trigger point as the leaderboard prompt and each player's own localStorage
// "games played" stat, so the definition of "played" stays consistent
// app-wide. Read back only via the secret-protected route in server.js.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'runtime', 'play-count.json');

function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { totalGamesPlayed: parsed.totalGamesPlayed || 0 };
  } catch (e) {
    return { totalGamesPlayed: 0 };
  }
}

let store = load();

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
}

function incrementGamesPlayed() {
  store.totalGamesPlayed += 1;
  save();
}

function getGamesPlayedCount() {
  return store.totalGamesPlayed;
}

module.exports = { incrementGamesPlayed, getGamesPlayedCount };
