// Core game logic: picking rounds, scoring guesses, tracking streak/score in
// the session. Kept framework-agnostic (no req/res here) so it's easy to
// unit test or reuse if this ever grows a real API layer.

const { listings, getListingById } = require('../data/listingsStore');
const { mulberry32, hashString } = require('../lib/prng');
const { getCurrency, randomCurrencyCode } = require('../lib/currencies');
const { incrementGamesPlayed } = require('./playCounter');

const ROUNDS_PER_GAME = 5;
const MAX_POINTS_PER_ROUND = 1000;

// Accuracy tiers, expressed as "guess within X% of actual price".
// Tune these to make the game easier/harder.
const TIERS = [
  { max: 0.05, id: 'nailed', emoji: '\u{1F3AF}', label: 'Nailed it!' }, // 🎯
  { max: 0.15, id: 'close', emoji: '\u{1F7E2}', label: 'Close!' }, //     🟢
  { max: 0.3, id: 'okay', emoji: '\u{1F7E1}', label: 'Okay' }, //         🟡
  { max: Infinity, id: 'off', emoji: '\u{1F534}', label: 'Way Off' }, // 🔴
];

// A streak only continues on "close" or better (<= 15% off).
const STREAK_THRESHOLD = 0.15;

function tierForError(errorRatio) {
  return TIERS.find((t) => errorRatio <= t.max);
}

function pointsForError(errorRatio) {
  // Linear decay to 0 at 60% error or worse; full marks at a perfect guess.
  const falloff = 0.6;
  const raw = MAX_POINTS_PER_ROUND * (1 - Math.min(errorRatio, falloff) / falloff);
  return Math.max(0, Math.round(raw));
}

function shuffled(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function pickListingIds(mode) {
  const allIds = listings.map((l) => l.id);
  if (mode === 'daily') {
    // v2 idea: incorporate a stable puzzle number (days since launch) into
    // the share text ("ValueGuessr #47") instead of the raw date -- see
    // views/index.ejs for where that display number would slot in.
    const key = todayKey();
    const rng = mulberry32(hashString(`valueguessr-${key}`));
    return { ids: shuffled(allIds, rng).slice(0, ROUNDS_PER_GAME), dailyKey: key };
  }
  const rng = Math.random;
  return { ids: shuffled(allIds, rng).slice(0, ROUNDS_PER_GAME), dailyKey: null };
}

// --- Public API --------------------------------------------------------

function startNewGame(session, mode) {
  const { ids, dailyKey } = pickListingIds(mode);
  session.game = {
    mode,
    dailyKey,
    listingIds: ids,
    currentIndex: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    roundResults: [],
    rollUsed: false,
  };
  return session.game;
}

// Strips the price out of a listing so the client never sees the answer.
// `currency` is the property's own real-world currency (see lib/currencies)
// -- players guess in whatever currency the listing is actually priced in.
function getPublicRound(game, index) {
  const listing = getListingById(game.listingIds[index]);
  return {
    roundNumber: index + 1,
    totalRounds: ROUNDS_PER_GAME,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    homeType: listing.homeType,
    category: listing.category || 'residential',
    sqft: listing.sqft,
    beds: listing.beds,
    baths: listing.baths,
    floors: listing.floors || null,
    yearBuilt: listing.yearBuilt,
    image: listing.image,
    imageCredit: listing.imageCredit || null,
    isFamous: !!listing.isFamous,
    currency: getCurrency(listing.currency),
    rollAvailable: !game.rollUsed,
    // NOTE: priceSource is withheld here (it usually names the actual sale
    // price in prose, e.g. "Sold 2016 for $100M") -- it's only revealed in
    // the guess result below, alongside the real price.
  };
}

// The one-per-game "Roll": swaps the CURRENT round's guessing currency for a
// random one (possibly unrelated to the property's real country) -- a fun
// wildcard, not a correction. Scoring is untouched either way since it's
// always computed in USD; this only affects what currency the player enters
// their guess in for this one round.
function useRoll(session) {
  const game = session.game;
  if (!game) return { error: 'No active game. Start a new one.' };
  if (game.currentIndex >= game.listingIds.length) {
    return { error: 'Game already finished.' };
  }
  if (game.rollUsed) {
    return { error: 'Roll already used this game.' };
  }
  const listing = getListingById(game.listingIds[game.currentIndex]);
  game.rollUsed = true;
  const code = randomCurrencyCode(listing.currency);
  return { currency: getCurrency(code) };
}

function submitGuess(session, guess) {
  const game = session.game;
  if (!game) return { error: 'No active game. Start a new one.' };
  if (game.currentIndex >= game.listingIds.length) {
    return { error: 'Game already finished.' };
  }

  const listing = getListingById(game.listingIds[game.currentIndex]);
  const actual = listing.price;
  const errorRatio = Math.abs(guess - actual) / actual;
  const tier = tierForError(errorRatio);
  const points = pointsForError(errorRatio);

  game.score += points;
  if (errorRatio <= STREAK_THRESHOLD) {
    game.streak += 1;
    game.bestStreak = Math.max(game.bestStreak, game.streak);
  } else {
    game.streak = 0;
  }

  game.roundResults.push({
    listingId: listing.id,
    address: listing.address,
    city: listing.city,
    guess,
    actual,
    errorPct: Math.round(errorRatio * 1000) / 10, // one decimal place
    tierId: tier.id,
    tierEmoji: tier.emoji,
    tierLabel: tier.label,
    points,
    isFamous: !!listing.isFamous,
    priceSource: listing.isFamous ? listing.priceSource : null,
  });

  game.currentIndex += 1;
  const isLastRound = game.currentIndex >= game.listingIds.length;
  if (isLastRound) {
    session.gamesCompleted = (session.gamesCompleted || 0) + 1;
    incrementGamesPlayed();
  }

  return {
    actual,
    guess,
    errorPct: Math.round(errorRatio * 1000) / 10,
    tierId: tier.id,
    tierEmoji: tier.emoji,
    tierLabel: tier.label,
    points,
    isFamous: !!listing.isFamous,
    priceSource: listing.isFamous ? listing.priceSource : null,
    totalScore: game.score,
    streak: game.streak,
    bestStreak: game.bestStreak,
    roundNumber: game.currentIndex,
    totalRounds: ROUNDS_PER_GAME,
    isLastRound,
    isFirstGame: isLastRound ? session.gamesCompleted === 1 : undefined,
    nextRound: isLastRound ? null : getPublicRound(game, game.currentIndex),
  };
}

function getResults(session) {
  const game = session.game;
  if (!game) return { error: 'No active game.' };
  if (game.currentIndex < game.listingIds.length) {
    return { error: 'Game still in progress.' };
  }
  return {
    mode: game.mode,
    dailyKey: game.dailyKey,
    score: game.score,
    maxScore: ROUNDS_PER_GAME * MAX_POINTS_PER_ROUND,
    bestStreak: game.bestStreak,
    roundResults: game.roundResults,
    isFirstGame: session.gamesCompleted === 1,
  };
}

module.exports = {
  ROUNDS_PER_GAME,
  MAX_POINTS_PER_ROUND,
  todayKey,
  startNewGame,
  submitGuess,
  getPublicRound,
  getResults,
  useRoll,
};
