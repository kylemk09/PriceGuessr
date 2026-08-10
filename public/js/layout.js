// Toggles a `data-layout` attribute on <body> between "mobile" and "desktop"
// based on a live viewport check -- not a device-type sniff -- so resizing
// the browser window switches the arrangement immediately, same as the
// underlying CSS breakpoint it drives. See style.css's
// [data-layout="desktop"] rules for what actually changes (a genuine
// two-pane grid for the game screen, not just a wider single column).
(function () {
  'use strict';

  var BREAKPOINT = 900;
  var mql = window.matchMedia('(min-width: ' + BREAKPOINT + 'px)');

  function applyLayout(matches) {
    document.body.setAttribute('data-layout', matches ? 'desktop' : 'mobile');
  }

  applyLayout(mql.matches);
  if (mql.addEventListener) {
    mql.addEventListener('change', function (e) { applyLayout(e.matches); });
  } else if (mql.addListener) {
    // Safari < 14 fallback
    mql.addListener(function (e) { applyLayout(e.matches); });
  }
})();
