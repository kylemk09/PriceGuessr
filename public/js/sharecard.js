// Wordle-style shareable result: a canvas-rendered image card plus a plain
// text summary for "Copy Result" / Web Share API.
(function () {
  'use strict';

  var DAILY_EPOCH = Date.UTC(2026, 0, 1); // arbitrary "PriceGuessr Day 1"

  function puzzleNumber(dailyKey) {
    if (!dailyKey) return null;
    var parts = dailyKey.split('-').map(Number);
    var ms = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    return Math.max(1, Math.floor((ms - DAILY_EPOCH) / 86400000) + 1);
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function buildText(data) {
    var num = puzzleNumber(data.dailyKey);
    var titleLine = data.mode === 'daily' && num
      ? 'PriceGuessr #' + num + ' \u{1F3E0}'
      : 'PriceGuessr \u{1F3E0}';
    var emojis = data.roundResults.map(function (r) { return r.tierEmoji; }).join('');
    var link = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

    return [
      titleLine,
      'Score: ' + data.score.toLocaleString('en-US') + '/' + data.maxScore.toLocaleString('en-US'),
      emojis,
      'Play at ' + link,
    ].join('\n');
  }

  function render(canvas, data) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;

    // Background
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#101014');
    grad.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, 0, 0, w, h, 28);
    ctx.fill();

    // Soft accent glow blob
    var glow = ctx.createRadialGradient(w * 0.5, h * 0.18, 10, w * 0.5, h * 0.18, w * 0.6);
    glow.addColorStop(0, 'rgba(0,255,157,0.20)');
    glow.addColorStop(1, 'rgba(0,255,157,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';

    // Wordmark
    ctx.fillStyle = '#f5f6f7';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    var num = puzzleNumber(data.dailyKey);
    var title = data.mode === 'daily' && num ? 'PriceGuessr #' + num : 'PriceGuessr';
    ctx.fillText('\u{1F3E0} ' + title, w / 2, 90);

    // Mode label
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillText(data.mode === 'daily' ? 'Daily Challenge' : 'Quick Play', w / 2, 122);

    // Score
    ctx.fillStyle = '#00ff9d';
    ctx.font = '700 96px "Space Grotesk", sans-serif';
    ctx.shadowColor = 'rgba(0,255,157,0.5)';
    ctx.shadowBlur = 30;
    ctx.fillText(data.score.toLocaleString('en-US'), w / 2, 260);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#6b6b74';
    ctx.font = '500 22px Inter, sans-serif';
    ctx.fillText('out of ' + data.maxScore.toLocaleString('en-US'), w / 2, 300);

    // Emoji row
    ctx.font = '54px sans-serif';
    ctx.fillStyle = '#f5f6f7';
    var emojis = data.roundResults.map(function (r) { return r.tierEmoji; });
    var spacing = 66;
    var startX = w / 2 - ((emojis.length - 1) * spacing) / 2;
    emojis.forEach(function (e, i) {
      ctx.fillText(e, startX + i * spacing, 400);
    });

    // Streak chip
    drawRoundedRect(ctx, w / 2 - 140, 440, 280, 56, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.stroke();
    ctx.fillStyle = '#f5f6f7';
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillText('\u{1F525} Best streak: ' + data.bestStreak, w / 2, 476);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(60, 560);
    ctx.lineTo(w - 60, 560);
    ctx.stroke();

    // Footer
    ctx.fillStyle = '#6b6b74';
    ctx.font = '500 20px Inter, sans-serif';
    var link = (typeof window !== 'undefined' && window.location) ? window.location.host : 'priceguessr.app';
    ctx.fillText('Play at ' + link, w / 2, 600);

    ctx.fillStyle = '#4a4a52';
    ctx.font = '400 15px Inter, sans-serif';
    ctx.fillText('Illustrative sample data — not real valuations', w / 2, 640);
  }

  function toBlob(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/png');
    });
  }

  window.PGShareCard = { render: render, buildText: buildText, toBlob: toBlob, puzzleNumber: puzzleNumber };
})();
