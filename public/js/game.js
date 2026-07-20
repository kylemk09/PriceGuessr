// PriceGuessr client — drives the round loop: fetch a round, take a guess,
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

  var money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var moneyShort = function (n) {
    if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(n % 1000000000 ? 1 : 0) + 'B';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(n % 1000000 ? 1 : 0) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + n;
  };

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
  };

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      'liveCounter', 'btnQuickPlay', 'btnDailyPlay', 'prevBest', 'prevStreak', 'prevGames',
      'screen-start', 'screen-game', 'screen-results',
      'progressDots', 'hudScore', 'hudStreak',
      'propertyImage', 'roundBadge', 'propertyAddress', 'propertyLocation', 'famousBadge', 'propertyCredit',
      'statSqft', 'statBeds', 'statBaths', 'statYear',
      'guessSlider', 'guessAmount', 'btnSubmitGuess', 'guessCard', 'propertyCard',
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
    el.guessAmount.textContent = money0.format(state.currentGuess);
    var pct = (v / SLIDER_STEPS) * 100;
    el.guessSlider.style.setProperty('--fill', pct + '%');
  }

  // --- Rounds -----------------------------------------------------------

  function renderRound(round) {
    state.roundNumber = round.roundNumber;
    state.totalRounds = round.totalRounds;
    state.priceRange = round.isFamous ? LANDMARK_RANGE : STANDARD_RANGE;

    el.propertyImage.src = round.image;
    el.propertyImage.alt = 'Photo of ' + round.address;
    el.roundBadge.textContent = 'Round ' + round.roundNumber + '/' + round.totalRounds;
    el.propertyAddress.textContent = round.address;
    el.propertyLocation.textContent = round.city + ', ' + round.state + ' · ' + round.homeType;
    el.statSqft.textContent = round.sqft.toLocaleString('en-US');
    el.statBeds.textContent = round.beds;
    el.statBaths.textContent = round.baths;
    el.statYear.textContent = round.yearBuilt;

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
    el.revealGuess.textContent = money0.format(result.guess);
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
    animateCountUp(el.revealActual, 0, result.actual, 800, money0.format);
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
        var files = blob ? [new File([blob], 'priceguessr-result.png', { type: 'image/png' })] : [];
        var canShareFiles = files.length && navigator.canShare && navigator.canShare({ files: files });
        var payload = canShareFiles
          ? { text: text, files: files, title: 'PriceGuessr' }
          : { text: text, title: 'PriceGuessr' };
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

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    refreshStatsPreview();

    el.guessSlider.addEventListener('input', updateGuessDisplay);
    el.btnSubmitGuess.addEventListener('click', submitGuess);
    el.btnQuickPlay.addEventListener('click', function () { startGame('quick'); });
    el.btnDailyPlay.addEventListener('click', function () { startGame('daily'); });
    el.btnPlayAgain.addEventListener('click', function () { startGame(state.mode); });
    el.btnBackHome.addEventListener('click', function () {
      refreshStatsPreview();
      showScreen('start');
    });

    window.addEventListener('resize', function () {
      var canvas = $('confettiCanvas');
      if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    });
  });
})();
