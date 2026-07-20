// Fake-but-plausible social proof: a live player counter that drifts up/down,
// and a scrolling activity ticker of randomly generated "recent plays".
// Purely cosmetic / client-side -- none of this is real telemetry.
(function () {
  'use strict';

  var NAMES = [
    'Sarah', 'Mike', 'Jordan', 'Priya', 'Diego', 'Emma', 'Noah', 'Aisha',
    'Liam', 'Sofia', 'Ravi', 'Chloe', 'Marcus', 'Yuki', 'Fatima', 'Ethan',
    'Zoe', 'Carlos', 'Nina', 'Tyler', 'Amara', 'Leo', 'Grace', 'Omar',
  ];
  var CITIES = [
    'Austin', 'Boise', 'Nashville', 'Denver', 'Phoenix', 'Tampa', 'Portland',
    'Charlotte', 'Seattle', 'Atlanta', 'Raleigh', 'Boston', 'Salt Lake City',
    'Kansas City', 'Sacramento', 'Milwaukee', 'Richmond', 'Orlando',
  ];

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function money(n) { return '$' + n.toLocaleString('en-US'); }

  var TEMPLATES = [
    function () { return rand(NAMES) + ' from ' + rand(CITIES) + ' just scored ' + randInt(700, 1000) * 5 + ' pts \u{1F3C6}'; },
    function () { return rand(NAMES) + ' nailed a ' + money(randInt(200, 1400) * 1000) + ' guess! \u{1F3AF}'; },
    function () { return rand(NAMES) + ' is on a ' + randInt(3, 9) + '-round streak \u{1F525}'; },
    function () { return rand(NAMES) + ' from ' + rand(CITIES) + ' just played the Daily Challenge \u{1F4C5}'; },
    function () { return rand(NAMES) + ' beat their best score! \u{1F389}'; },
    function () { return rand(NAMES) + ' guessed within 2% of the real price \u{1F632}'; },
  ];

  function buildTickerItems(count) {
    var items = [];
    for (var i = 0; i < count; i++) {
      items.push(rand(TEMPLATES)());
    }
    return items;
  }

  function mountTicker() {
    var el = document.getElementById('ticker');
    if (!el) return;
    var items = buildTickerItems(14);
    // Duplicate the list back-to-back so the CSS marquee (-50% translateX)
    // loops seamlessly with no visible seam.
    var html = items.concat(items).map(function (text) {
      return '<span class="ticker-item">' + text + '</span>';
    }).join('');
    el.innerHTML = html;
  }

  function mountLiveCounter() {
    var el = document.getElementById('liveCount');
    if (!el) return;
    var count = randInt(11000, 15000);
    el.textContent = count.toLocaleString('en-US');

    setInterval(function () {
      var delta = randInt(-35, 55);
      count = Math.max(8200, Math.min(24500, count + delta));
      el.textContent = count.toLocaleString('en-US');
    }, randInt(2500, 4500));
  }

  document.addEventListener('DOMContentLoaded', function () {
    mountTicker();
    mountLiveCounter();
    // Refresh the ticker's message pool periodically so it doesn't feel static.
    setInterval(mountTicker, 45000);
  });
})();
