// ValueGuessr client — drives the round loop: fetch a round, take a guess,
// animate the reveal, and hand off to the results screen.
//
// v2 idea: the server already supports a seeded "daily" mode (same 5 houses
// for everyone, keyed by date — see game/engine.js). A real v2 could add a
// countdown-to-next-daily timer here and lock repeat daily plays client-side
// (PGStats.playedDailyToday already tracks that) instead of just allowing replay.
(function () {
  'use strict';

  // Regular houses guess in the tens of thousands to a few million; famous
  // "landmark" properties (real mansions/penthouses) can run into the
  // hundreds of millions -- each round picks the range that fits its listing
  // so the slider stays usable at both ends.
  var STANDARD_RANGE = { min: 20000, max: 3000000 };
  var LANDMARK_RANGE = { min: 1000000, max: 500000000 };
  var SLIDER_STEPS = 1000;

  // All listing prices are stored/scored in USD server-side. The server
  // tells each round which real-world currency to guess in -- a property's
  // OWN country's currency (USA -> USD, UK -> GBP, etc; see lib/currencies.js
  // for the full accurate table) -- and this client only ever converts for
  // *display*: the slider itself always operates in USD internally, so
  // scoring (percentage-error based) is unaffected regardless of currency.
  var DEFAULT_CURRENCY = { code: 'USD', symbol: '$', name: 'US Dollar', flag: '\u{1F1FA}\u{1F1F8}', rate: 1 };

  function displayPrecisionFor(amount) {
    if (amount >= 100000000) return 1000000;
    if (amount >= 10000000) return 100000;
    if (amount >= 1000000) return 10000;
    if (amount >= 10000) return 100;
    if (amount >= 100) return 10;
    return 1;
  }

  function toDisplay(usdAmount) {
    var raw = usdAmount * state.currency.rate;
    var precision = displayPrecisionFor(raw);
    return Math.round(raw / precision) * precision;
  }

  function formatMoney(usdAmount) {
    var amount = toDisplay(usdAmount);
    return state.currency.symbol + amount.toLocaleString('en-US') + ' ' + state.currency.code;
  }

  function moneyShort(usdAmount) {
    var n = toDisplay(usdAmount);
    var sym = state.currency.symbol;
    var code = state.currency.code;
    if (n >= 1000000000) return sym + (n / 1000000000).toFixed(n % 1000000000 ? 1 : 0) + 'B ' + code;
    if (n >= 1000000) return sym + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M ' + code;
    if (n >= 1000) return sym + Math.round(n / 1000) + 'K ' + code;
    return sym + n + ' ' + code;
  }

  var el = {}; // populated on DOMContentLoaded
  var state = {
    mode: 'quick',
    dailyKey: null,
    roundNumber: 1,
    totalRounds: 5,
    score: 0,
    streak: 0,
    priceRange: STANDARD_RANGE,
    currentGuess: STANDARD_RANGE.min,
    currency: DEFAULT_CURRENCY,
    rollAvailable: true,
    rolledThisRound: false,
    inGame: false,
  };

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      'logoBtn', 'quitConfirmOverlay', 'btnCancelQuit', 'btnConfirmQuit',
      'leaderboardSubmitOverlay', 'leaderboardNameInput', 'leaderboardSubmitError',
      'btnSubmitName', 'btnSkipLeaderboard',
      'btnViewLeaderboard', 'leaderboardViewOverlay', 'leaderboardSubtitle',
      'leaderboardList', 'btnCloseLeaderboard', 'btnTabDaily', 'btnTabQuick',
      'liveCounter', 'btnQuickPlay', 'btnDailyPlay', 'prevBest', 'prevStreak', 'prevGames',
      'screen-start', 'screen-game', 'screen-results',
      'progressDots', 'hudScore', 'hudStreak',
      'propertyImage', 'roundBadge', 'propertyAddress', 'propertyLocation', 'famousBadge', 'propertyCredit',
      'statSqft', 'statBeds', 'statBaths', 'statYear', 'pstatBedsIcon', 'pstatBedsLabel', 'pstatBaths',
      'guessSlider', 'guessAmount', 'btnSubmitGuess', 'guessCard', 'propertyCard', 'currencyBadge', 'btnRollCurrency',
      'sliderMinLabel', 'sliderMaxLabel',
      'revealOverlay', 'revealEmoji', 'revealLabel', 'revealGuess', 'revealActual',
      'revealBarFill', 'revealBarMarker', 'revealError', 'revealPoints', 'revealSource', 'btnNextRound',
      'resultsEyebrow', 'resultsScore', 'resultsScoreMax', 'resultsEmojiRow',
      'resultsStreak', 'resultsRank', 'shareCanvas', 'btnCopyResult', 'btnShareResult',
      'btnPlayAgain', 'btnBackHome', 'copyToast', 'sfxSubmit', 'sfxReveal',
    ].forEach(function (id) { el[id] = $(id); });
  }

  function showScreen(name) {
    ['start', 'game', 'results'].forEach(function (s) {
      el['screen-' + s].hidden = s !== name;
    });
  }

  function playSfx(audioEl) {
    if (!audioEl) return;
    try {
      audioEl.currentTime = 0;
      var p = audioEl.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* no-op: sound file likely missing, that's fine */ }
  }

  // --- Slider: linear 0..SLIDER_STEPS mapped to a log-scale price -----------
  // Prices span 100x (20k-3M); a plain linear slider makes cheap homes
  // impossible to target precisely, so we map slider position exponentially.

  function sliderToPrice(v) {
    var range = state.priceRange;
    var t = v / SLIDER_STEPS;
    var price = range.min * Math.pow(range.max / range.min, t);
    var precision = price >= 10000000 ? 100000 : price >= 1000000 ? 10000 : 1000;
    return Math.round(price / precision) * precision;
  }

  function updateGuessDisplay() {
    var v = Number(el.guessSlider.value);
    state.currentGuess = sliderToPrice(v);
    el.guessAmount.textContent = formatMoney(state.currentGuess);
    var pct = (v / SLIDER_STEPS) * 100;
    el.guessSlider.style.setProperty('--fill', pct + '%');
  }

  // --- Currency + Roll ----------------------------------------------------
  // Every round is priced in the property's own real-world currency (its
  // country's currency -- see lib/currencies.js). The one-per-game "Roll"
  // swaps the CURRENT round's currency for a random one as a wildcard twist;
  // scoring never changes since it's always computed in USD server-side.

  function updateCurrencyBadge() {
    el.currencyBadge.textContent = state.currency.flag + ' Guessing in ' + state.currency.code;
    el.currencyBadge.classList.toggle('rolled', !!state.rolledThisRound);
  }

  function updateRollButton() {
    el.btnRollCurrency.disabled = !state.rollAvailable;
    el.btnRollCurrency.textContent = state.rollAvailable ? '\u{1F3B2} Roll Available' : '\u{1F3B2} Roll used';
  }

  function rollCurrency() {
    if (!state.rollAvailable) return;
    el.btnRollCurrency.disabled = true;
    fetch('/api/game/roll', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        state.currency = data.currency;
        state.rollAvailable = false;
        state.rolledThisRound = true;
        updateCurrencyBadge();
        updateRollButton();
        // Re-render the guess amount + slider labels in the new currency.
        updateGuessDisplay();
        el.sliderMinLabel.textContent = moneyShort(state.priceRange.min);
        el.sliderMaxLabel.textContent = moneyShort(state.priceRange.max);
      })
      .catch(function () {
        updateRollButton();
      });
  }

  // --- Rounds -----------------------------------------------------------

  function renderRound(round) {
    state.roundNumber = round.roundNumber;
    state.totalRounds = round.totalRounds;
    state.priceRange = round.isFamous ? LANDMARK_RANGE : STANDARD_RANGE;
    state.currency = round.currency || DEFAULT_CURRENCY;
    state.rollAvailable = !!round.rollAvailable;
    state.rolledThisRound = false;
    updateCurrencyBadge();
    updateRollButton();

    el.propertyImage.src = round.image;
    el.propertyImage.alt = 'Photo of ' + round.address;
    el.roundBadge.textContent = 'Round ' + round.roundNumber + '/' + round.totalRounds;
    el.propertyAddress.textContent = round.address;
    el.propertyLocation.textContent = round.city + ', ' + round.state + ' · ' + round.homeType;
    el.statSqft.textContent = round.sqft.toLocaleString('en-US');
    el.statYear.textContent = round.yearBuilt;

    if (round.category === 'commercial') {
      el.pstatBedsIcon.textContent = '\u{1F3E2}'; // 🏢
      el.statBeds.textContent = round.floors;
      el.pstatBedsLabel.textContent = round.floors === 1 ? 'floor' : 'floors';
      el.pstatBaths.hidden = true;
    } else {
      el.pstatBedsIcon.textContent = '\u{1F6CF}️'; // 🛏️
      el.statBeds.textContent = round.beds;
      el.pstatBedsLabel.textContent = 'bd';
      el.pstatBaths.hidden = false;
      el.statBaths.textContent = round.baths;
    }

    el.famousBadge.hidden = !round.isFamous;
    el.propertyCredit.textContent = round.imageCredit ? 'Photo: ' + round.imageCredit : '';
    el.propertyCredit.hidden = !round.imageCredit;

    el.sliderMinLabel.textContent = moneyShort(state.priceRange.min);
    el.sliderMaxLabel.textContent = moneyShort(state.priceRange.max);

    // Reset the slider to the middle of the log scale each round.
    el.guessSlider.value = SLIDER_STEPS / 2;
    updateGuessDisplay();

    renderProgressDots();
    el.propertyCard.classList.remove('shake', 'glow-pulse');
    // Retrigger the CSS entrance animation on the card.
    void el.propertyCard.offsetWidth;
  }

  function renderProgressDots() {
    var html = '';
    for (var i = 1; i <= state.totalRounds; i++) {
      var cls = 'dot';
      if (i < state.roundNumber) cls += ' filled';
      if (i === state.roundNumber) cls += ' current';
      html += '<span class="' + cls + '"></span>';
    }
    el.progressDots.innerHTML = html;
  }

  function updateHud() {
    el.hudScore.textContent = state.score.toLocaleString('en-US');
    el.hudStreak.textContent = state.streak + ' \u{1F525}';
  }

  // --- Game flow ----------------------------------------------------------

  function startGame(mode) {
    state.mode = mode;
    fetch('/api/game/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: mode }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.dailyKey = data.dailyKey;
        state.score = 0;
        state.streak = 0;
        state.totalRounds = data.totalRounds;
        state.inGame = true;
        updateHud();
        showScreen('game');
        renderRound(Object.assign({ roundNumber: data.roundNumber, totalRounds: data.totalRounds }, data.round));
      })
      .catch(function (err) {
        console.error('Failed to start game', err);
        alert('Could not start a new game. Please refresh and try again.');
      });
  }

  function submitGuess() {
    el.btnSubmitGuess.disabled = true;
    playSfx(el.sfxSubmit);

    fetch('/api/game/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: state.currentGuess }),
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        el.btnSubmitGuess.disabled = false;
        if (result.error) throw new Error(result.error);
        state.score = result.totalScore;
        state.streak = result.streak;
        showReveal(result);
      })
      .catch(function (err) {
        el.btnSubmitGuess.disabled = false;
        console.error('Failed to submit guess', err);
      });
  }

  function showReveal(result) {
    playSfx(el.sfxReveal);
    updateHud();

    el.revealEmoji.textContent = result.tierEmoji;
    el.revealLabel.textContent = result.tierLabel;
    el.revealGuess.textContent = formatMoney(result.guess);
    el.revealError.textContent = 'Off by ' + result.errorPct + '%';
    el.revealSource.textContent = result.priceSource || '';
    el.revealSource.hidden = !result.priceSource;

    var rangeMin = Math.min(result.guess, result.actual) * 0.85;
    var rangeMax = Math.max(result.guess, result.actual) * 1.15;
    var span = Math.max(1, rangeMax - rangeMin);
    var actualPct = ((result.actual - rangeMin) / span) * 100;
    var guessPct = ((result.guess - rangeMin) / span) * 100;

    el.revealBarFill.style.width = '0%';
    el.revealBarMarker.style.left = guessPct + '%';
    el.revealPoints.textContent = '+0 pts';

    el.revealOverlay.hidden = false;

    // Animate the actual-price counter + bar fill + points together.
    animateCountUp(el.revealActual, 0, result.actual, 800, formatMoney);
    animatePoints(result.points, 800);
    requestAnimationFrame(function () {
      el.revealBarFill.style.width = actualPct + '%';
    });

    if (result.tierId === 'nailed') {
      el.revealOverlay.querySelector('.reveal-card').classList.add('glow-pulse');
      burstConfetti();
    }

    el.btnNextRound.textContent = result.isLastRound ? 'See Results →' : 'Next Round →';
    el.btnNextRound.onclick = function () {
      el.revealOverlay.hidden = true;
      el.revealOverlay.querySelector('.reveal-card').classList.remove('glow-pulse');
      if (result.isLastRound) {
        loadResults();
      } else {
        renderRound(result.nextRound);
      }
    };
  }

  function animateCountUp(node, from, to, duration, formatter) {
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = Math.round(from + (to - from) * eased);
      node.textContent = formatter(value);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function animatePoints(to, duration) {
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = Math.round(to * eased);
      el.revealPoints.textContent = '+' + value.toLocaleString('en-US') + ' pts';
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // --- Results --------------------------------------------------------------

  function loadResults() {
    fetch('/api/game/results')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        renderResults(data);
      })
      .catch(function (err) {
        console.error('Failed to load results', err);
      });
  }

  function gradeFor(pct) {
    if (pct >= 0.92) return 'S';
    if (pct >= 0.8) return 'A';
    if (pct >= 0.65) return 'B';
    if (pct >= 0.45) return 'C';
    return 'D';
  }

  function renderResults(data) {
    state.inGame = false;
    showScreen('results');
    el.resultsEyebrow.textContent = data.mode === 'daily' ? 'Daily Challenge Complete' : 'Game Complete';
    el.resultsScoreMax.textContent = 'out of ' + data.maxScore.toLocaleString('en-US');
    el.resultsEmojiRow.textContent = data.roundResults.map(function (r) { return r.tierEmoji; }).join(' ');
    el.resultsStreak.textContent = data.bestStreak;
    el.resultsRank.textContent = gradeFor(data.score / data.maxScore);
    el.resultsScore.textContent = '0';
    animateCountUp(el.resultsScore, 0, data.score, 1100, function (v) { return v.toLocaleString('en-US'); });

    var shareData = {
      mode: data.mode,
      dailyKey: data.dailyKey,
      score: data.score,
      maxScore: data.maxScore,
      bestStreak: data.bestStreak,
      roundResults: data.roundResults,
    };
    if (window.PGShareCard) window.PGShareCard.render(el.shareCanvas, shareData);

    el.btnCopyResult.onclick = function () { copyResult(shareData); };
    el.btnShareResult.onclick = function () { shareResult(shareData); };

    if (window.PGStats) window.PGStats.recordGame(data);
    refreshStatsPreview();

    if (data.isFirstGame) showLeaderboardPrompt();
  }

  // --- Leaderboard --------------------------------------------------------

  function showLeaderboardPrompt() {
    el.leaderboardNameInput.value = '';
    el.leaderboardSubmitError.hidden = true;
    el.leaderboardSubmitOverlay.hidden = false;
  }

  function submitLeaderboardName() {
    var name = el.leaderboardNameInput.value.trim();
    if (!name) {
      el.leaderboardSubmitError.textContent = 'Please enter a name.';
      el.leaderboardSubmitError.hidden = false;
      return;
    }
    el.btnSubmitName.disabled = true;
    fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        el.btnSubmitName.disabled = false;
        if (data.error) throw new Error(data.error);
        el.leaderboardSubmitOverlay.hidden = true;
        openLeaderboard(state.mode === 'daily' ? 'daily' : 'quick');
      })
      .catch(function () {
        el.btnSubmitName.disabled = false;
        el.leaderboardSubmitError.textContent = 'Could not submit right now. Please try again.';
        el.leaderboardSubmitError.hidden = false;
      });
  }

  // Builds rows via DOM APIs (not innerHTML) so a leaderboard name can never
  // be interpreted as markup -- these names come from other players.
  function renderLeaderboardList(entries) {
    el.leaderboardList.innerHTML = '';
    if (!entries.length) {
      var empty = document.createElement('li');
      empty.className = 'leaderboard-empty';
      empty.textContent = 'No scores yet — be the first!';
      el.leaderboardList.appendChild(empty);
      return;
    }
    var medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    entries.forEach(function (entry, i) {
      var row = document.createElement('li');
      row.className = 'leaderboard-row' + (i < 3 ? ' top-3' : '');

      var rank = document.createElement('span');
      rank.className = 'leaderboard-rank';
      rank.textContent = i < 3 ? medals[i] : (i + 1) + '.';

      var name = document.createElement('span');
      name.className = 'leaderboard-name';
      name.textContent = entry.name;

      var score = document.createElement('span');
      score.className = 'leaderboard-score';
      score.textContent = entry.score.toLocaleString('en-US') + ' pts';

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      el.leaderboardList.appendChild(row);
    });
  }

  function loadLeaderboardTab(tab) {
    el.btnTabDaily.classList.toggle('active', tab === 'daily');
    el.btnTabQuick.classList.toggle('active', tab === 'quick');
    el.leaderboardSubtitle.textContent = tab === 'daily' ? "Today's Daily Challenge" : 'Quick Play — All-Time';
    fetch('/api/leaderboard?mode=' + tab)
      .then(function (r) { return r.json(); })
      .then(function (data) { renderLeaderboardList(data.entries); })
      .catch(function () { renderLeaderboardList([]); });
  }

  function openLeaderboard(preferredTab) {
    el.leaderboardViewOverlay.hidden = false;
    loadLeaderboardTab(preferredTab || 'daily');
  }

  function flashToast() {
    el.copyToast.hidden = false;
    clearTimeout(flashToast._t);
    flashToast._t = setTimeout(function () { el.copyToast.hidden = true; }, 2200);
  }

  function copyResult(shareData) {
    var text = window.PGShareCard ? window.PGShareCard.buildText(shareData) : '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flashToast).catch(function () {
        window.prompt('Copy your result:', text);
      });
    } else {
      window.prompt('Copy your result:', text);
    }
  }

  function shareResult(shareData) {
    var text = window.PGShareCard ? window.PGShareCard.buildText(shareData) : '';
    if (navigator.share) {
      window.PGShareCard.toBlob(el.shareCanvas).then(function (blob) {
        var files = blob ? [new File([blob], 'valueguessr-result.png', { type: 'image/png' })] : [];
        var canShareFiles = files.length && navigator.canShare && navigator.canShare({ files: files });
        var payload = canShareFiles
          ? { text: text, files: files, title: 'ValueGuessr' }
          : { text: text, title: 'ValueGuessr' };
        navigator.share(payload).catch(function () { /* user cancelled share sheet */ });
      });
    } else {
      copyResult(shareData);
    }
  }

  function refreshStatsPreview() {
    if (!window.PGStats) return;
    var stats = window.PGStats.load();
    el.prevBest.textContent = stats.gamesPlayed ? stats.bestScore.toLocaleString('en-US') : '—';
    el.prevStreak.textContent = stats.gamesPlayed ? stats.bestStreak : '—';
    el.prevGames.textContent = stats.gamesPlayed || 0;
  }

  // --- Confetti (lightweight, no external libs) -------------------------------

  function burstConfetti() {
    var canvas = $('confettiCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');
    var colors = ['#00ff9d', '#00c97d', '#ffffff', '#a855f7'];
    var particles = Array.from({ length: 90 }, function () {
      return {
        x: canvas.width / 2 + (Math.random() - 0.5) * 120,
        y: canvas.height * 0.35,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -10 - 4,
        size: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
      };
    });

    var gravity = 0.35;
    var duration = 1600;
    var start = performance.now();

    function frame(now) {
      var elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(function (p) {
        p.vy += gravity * 0.5;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(frame);
  }

  // --- Wire up --------------------------------------------------------------

  function goHome() {
    state.inGame = false;
    refreshStatsPreview();
    showScreen('start');
  }

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    refreshStatsPreview();

    el.guessSlider.addEventListener('input', updateGuessDisplay);
    el.btnSubmitGuess.addEventListener('click', submitGuess);
    el.btnRollCurrency.addEventListener('click', rollCurrency);
    el.btnQuickPlay.addEventListener('click', function () { startGame('quick'); });
    el.btnDailyPlay.addEventListener('click', function () { startGame('daily'); });
    el.btnPlayAgain.addEventListener('click', function () { startGame(state.mode); });
    el.btnBackHome.addEventListener('click', goHome);

    el.logoBtn.addEventListener('click', function () {
      if (state.inGame) {
        el.quitConfirmOverlay.hidden = false;
      } else {
        goHome();
      }
    });
    el.btnCancelQuit.addEventListener('click', function () {
      el.quitConfirmOverlay.hidden = true;
    });
    el.btnConfirmQuit.addEventListener('click', function () {
      el.quitConfirmOverlay.hidden = true;
      el.revealOverlay.hidden = true;
      goHome();
    });

    el.btnSubmitName.addEventListener('click', submitLeaderboardName);
    el.btnSkipLeaderboard.addEventListener('click', function () {
      el.leaderboardSubmitOverlay.hidden = true;
    });
    el.leaderboardNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitLeaderboardName();
    });

    el.btnViewLeaderboard.addEventListener('click', function () {
      openLeaderboard(state.mode === 'daily' ? 'daily' : 'quick');
    });
    el.btnCloseLeaderboard.addEventListener('click', function () {
      el.leaderboardViewOverlay.hidden = true;
    });
    el.btnTabDaily.addEventListener('click', function () { loadLeaderboardTab('daily'); });
    el.btnTabQuick.addEventListener('click', function () { loadLeaderboardTab('quick'); });

    window.addEventListener('resize', function () {
      var canvas = $('confettiCanvas');
      if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    });
  });
})();
