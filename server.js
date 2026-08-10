// ValueGuessr -- Express server.
//
// Game state (score/streak/current round) lives in the express-session
// (in-memory store), keyed per-browser via a cookie. There is no database in
// v1: `data/listings.json` is the entire "backend". Long-term stat history
// (games played, best score, streak record) is persisted client-side in
// localStorage -- see public/js/stats.js.

const path = require('path');
const express = require('express');
const session = require('express-session');

const { listings } = require('./data/listingsStore');
const {
  ROUNDS_PER_GAME,
  todayKey,
  startNewGame,
  submitGuess,
  getPublicRound,
  getResults,
  useRoll,
} = require('./game/engine');
const { submitScore, getTop } = require('./game/leaderboard');
const { getGamesPlayedCount } = require('./game/playCounter');
const { initSchema } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    // Falls back to a dev-only placeholder locally; set a real SESSION_SECRET
    // env var wherever this is actually deployed.
    secret: process.env.SESSION_SECRET || 'valueguessr-dev-secret-change-me',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 6 }, // 6 hours
  })
);

// ---- Views ----------------------------------------------------------------

app.get('/', (req, res) => {
  res.render('index', {
    totalListings: listings.length,
    roundsPerGame: ROUNDS_PER_GAME,
  });
});

// ---- API --------------------------------------------------------------

// Start (or restart) a game. mode: "quick" (fully random) | "daily"
// (same 5 houses for everyone today, Wordle-style) | "city" (5 rounds drawn
// from a 50km circle the player positioned on the map -- requires lat/lng).
app.post('/api/game/new', (req, res) => {
  const body = req.body || {};
  let mode = body.mode === 'daily' ? 'daily' : body.mode === 'city' ? 'city' : 'quick';
  let center;
  if (mode === 'city') {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Invalid map location.' });
    }
    center = { lat, lng };
  }
  const game = startNewGame(req.session, mode, center);
  res.json({
    mode: game.mode,
    dailyKey: game.dailyKey || null,
    roundNumber: 1,
    totalRounds: ROUNDS_PER_GAME,
    round: getPublicRound(game, 0),
  });
});

// Submit a guess for the current round.
app.post('/api/game/guess', (req, res) => {
  const guess = Number(req.body && req.body.guess);
  if (!Number.isFinite(guess) || guess < 0) {
    return res.status(400).json({ error: 'Invalid guess.' });
  }

  const result = submitGuess(req.session, guess);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Use the game's one-per-game "Roll": swaps the current round's guessing
// currency for a random one. Server-authoritative (once-per-game enforced
// here, not trusted from the client) and the random pick itself happens
// server-side too.
app.post('/api/game/roll', (req, res) => {
  const result = useRoll(req.session);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Fetch the final summary for the results screen (also used on refresh).
app.get('/api/game/results', (req, res) => {
  const results = getResults(req.session);
  if (results.error) {
    return res.status(400).json(results);
  }
  res.json(results);
});

// ---- Leaderboard --------------------------------------------------------

// Submit the CURRENT session's just-finished game to the leaderboard. The
// score is read from the session (set by the server during play), never
// trusted from the client request body -- so a player can't just POST an
// arbitrary high score.
app.post('/api/leaderboard/submit', async (req, res) => {
  const game = req.session.game;
  if (!game || game.currentIndex < game.listingIds.length) {
    return res.status(400).json({ error: 'No completed game to submit.' });
  }
  if (game.mode === 'city') {
    // Select City doesn't have its own leaderboard yet, and its games
    // shouldn't be folded into the Quick Play board either.
    return res.status(400).json({ error: 'Select City games aren\'t eligible for the leaderboard yet.' });
  }
  const name = req.body && req.body.name;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const entry = await submitScore({
      mode: game.mode,
      dailyKey: game.dailyKey,
      name,
      score: game.score,
      streak: game.bestStreak,
    });
    const top = await getTop(game.mode, game.dailyKey);
    res.json({ ok: true, entry, top });
  } catch (err) {
    console.error('Leaderboard submit failed:', err);
    res.status(500).json({ error: 'Could not submit score right now.' });
  }
});

// Fetch a leaderboard. mode=daily uses `date` (defaults to today) as the key;
// mode=quick is a single all-time board.
app.get('/api/leaderboard', async (req, res) => {
  const mode = req.query.mode === 'daily' ? 'daily' : 'quick';
  const dailyKey = typeof req.query.date === 'string' ? req.query.date : todayKey();
  try {
    const entries = await getTop(mode, dailyKey);
    res.json({ mode, dailyKey, entries });
  } catch (err) {
    console.error('Leaderboard fetch failed:', err);
    res.status(500).json({ error: 'Could not load leaderboard right now.' });
  }
});

// ---- Private stats (not linked from the UI anywhere) ---------------------

// Total completed games, for the site owner's own reference only. Requires
// a secret key (ADMIN_SECRET env var) as a query param; wrong/missing key
// gets a plain 404 rather than 401/403, so the route doesn't announce its
// own existence to anyone probing the site.
app.get('/api/internal/stats', async (req, res) => {
  const expected = process.env.ADMIN_SECRET || 'valueguessr-dev-admin-secret-change-me';
  if (req.query.key !== expected) {
    return res.status(404).end();
  }
  try {
    res.json({ totalGamesPlayed: await getGamesPlayedCount() });
  } catch (err) {
    console.error('Stats fetch failed:', err);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ValueGuessr running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    // Don't let a DB hiccup at boot take the whole app down -- leaderboard.js
    // and playCounter.js both fall back to file storage if MySQL isn't
    // reachable, so it's still safe to start the server either way.
    console.error('DB schema init failed, starting anyway:', err.message);
    app.listen(PORT, () => {
      console.log(`ValueGuessr running at http://localhost:${PORT}`);
    });
  });
