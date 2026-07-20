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

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    // Dev-only secret. Replace with an env var (process.env.SESSION_SECRET)
    // before deploying anywhere real.
    secret: 'valueguessr-dev-secret-change-me',
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
// (same 5 houses for everyone today, Wordle-style).
app.post('/api/game/new', (req, res) => {
  const mode = req.body && req.body.mode === 'daily' ? 'daily' : 'quick';
  const game = startNewGame(req.session, mode);
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
app.post('/api/leaderboard/submit', (req, res) => {
  const game = req.session.game;
  if (!game || game.currentIndex < game.listingIds.length) {
    return res.status(400).json({ error: 'No completed game to submit.' });
  }
  const name = req.body && req.body.name;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  const entry = submitScore({
    mode: game.mode,
    dailyKey: game.dailyKey,
    name,
    score: game.score,
    streak: game.bestStreak,
  });
  res.json({ ok: true, entry, top: getTop(game.mode, game.dailyKey) });
});

// Fetch a leaderboard. mode=daily uses `date` (defaults to today) as the key;
// mode=quick is a single all-time board.
app.get('/api/leaderboard', (req, res) => {
  const mode = req.query.mode === 'daily' ? 'daily' : 'quick';
  const dailyKey = typeof req.query.date === 'string' ? req.query.date : todayKey();
  res.json({ mode, dailyKey, entries: getTop(mode, dailyKey) });
});

app.listen(PORT, () => {
  console.log(`ValueGuessr running at http://localhost:${PORT}`);
});
