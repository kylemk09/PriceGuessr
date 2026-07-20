// PriceGuessr (aka HomeGuessr) -- Express server.
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
  startNewGame,
  submitGuess,
  getPublicRound,
  getResults,
} = require('./game/engine');

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
    secret: 'priceguessr-dev-secret-change-me',
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

// Fetch the final summary for the results screen (also used on refresh).
app.get('/api/game/results', (req, res) => {
  const results = getResults(req.session);
  if (results.error) {
    return res.status(400).json(results);
  }
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`PriceGuessr running at http://localhost:${PORT}`);
});
