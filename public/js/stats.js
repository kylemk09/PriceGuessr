// Client-side stat persistence (localStorage) so "best score" / "games
// played" / "best streak" survive between visits without needing a database
// or user accounts. Session-level score/streak still live server-side.
(function () {
  'use strict';

  var STORAGE_KEY = 'valueguessr:stats:v1';

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      var parsed = JSON.parse(raw);
      return Object.assign(defaults(), parsed);
    } catch (e) {
      return defaults();
    }
  }

  function defaults() {
    return { bestScore: 0, bestStreak: 0, gamesPlayed: 0, lastDailyKey: null };
  }

  function save(stats) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
      /* localStorage unavailable (private mode / disabled) -- ignore */
    }
  }

  function recordGame(result) {
    var stats = load();
    stats.bestScore = Math.max(stats.bestScore, result.score || 0);
    stats.bestStreak = Math.max(stats.bestStreak, result.bestStreak || 0);
    stats.gamesPlayed += 1;
    if (result.mode === 'daily' && result.dailyKey) {
      stats.lastDailyKey = result.dailyKey;
    }
    save(stats);
    return stats;
  }

  function playedDailyToday(dailyKey) {
    return load().lastDailyKey === dailyKey;
  }

  window.PGStats = {
    load: load,
    recordGame: recordGame,
    playedDailyToday: playedDailyToday,
  };
})();
