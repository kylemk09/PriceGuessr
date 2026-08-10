// Select City map picker: a Mapbox GL map bounded to the US/Canada, with a
// draggable 50km-radius circle the player positions before confirming.
// No-ops entirely (leaving the "map setup pending" placeholder from
// views/index.ejs untouched) until MAPBOX_ACCESS_TOKEN is configured --
// see lib/mapboxConfig.js and the mapboxConfigured flag on
// window.__PRICEGUESSR__ that server.js injects.
(function () {
  'use strict';

  if (!window.__PRICEGUESSR__ || !window.__PRICEGUESSR__.mapboxConfigured) return;
  if (typeof mapboxgl === 'undefined') return; // CDN script failed to load -- fail quiet, keep the placeholder

  var RADIUS_KM = 50;
  var EARTH_RADIUS_KM = 6371;
  // Generous US/Canada bounding box (covers Alaska/Hawaii and all provinces).
  var BOUNDS = [[-172, 14], [-49, 75]];
  var INITIAL_CENTER = [-98.5, 39.8];
  var INITIAL_ZOOM = 3;

  mapboxgl.accessToken = window.__PRICEGUESSR__.mapboxToken;

  var map = null;
  var center = { lat: INITIAL_CENTER[1], lng: INITIAL_CENTER[0] };
  var dragging = false;
  var built = false;

  // Great-circle destination point (direct geodesic problem): same
  // haversine-family math as game/engine.js's candidate filtering, used
  // here in reverse to draw the circle rather than measure distance to it.
  function destinationPoint(lat, lng, bearingDeg, distanceKm) {
    var d = distanceKm / EARTH_RADIUS_KM;
    var bearing = (bearingDeg * Math.PI) / 180;
    var lat1 = (lat * Math.PI) / 180;
    var lng1 = (lng * Math.PI) / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    var lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  function circlePolygon(lat, lng, radiusKm) {
    var steps = 64;
    var points = [];
    for (var i = 0; i <= steps; i++) {
      points.push(destinationPoint(lat, lng, (360 / steps) * i, radiusKm));
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [points] } };
  }

  function clampToBounds(lat, lng) {
    return {
      lat: Math.max(BOUNDS[0][1], Math.min(BOUNDS[1][1], lat)),
      lng: Math.max(BOUNDS[0][0], Math.min(BOUNDS[1][0], lng)),
    };
  }

  function updateCircle() {
    var src = map.getSource('city-circle');
    if (src) src.setData(circlePolygon(center.lat, center.lng, RADIUS_KM));
  }

  function buildMapUI() {
    if (built) return;
    built = true;
    var placeholder = document.getElementById('citymapPlaceholder');
    if (!placeholder) return;
    placeholder.outerHTML =
      '<div class="citymap-container" id="cityMapContainer"></div>' +
      '<p class="citymap-hint">Drag the circle, then confirm to play 5 rounds from that area.</p>' +
      '<button class="btn btn-primary btn-lg" id="btnConfirmCity" type="button">Play This Area →</button>';
  }

  function initMap() {
    if (map) return;
    var container = document.getElementById('cityMapContainer');
    if (!container) return;

    map = new mapboxgl.Map({
      container: container,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 2,
      maxZoom: 10,
      maxBounds: BOUNDS,
    });

    map.on('load', function () {
      map.addSource('city-circle', { type: 'geojson', data: circlePolygon(center.lat, center.lng, RADIUS_KM) });
      map.addLayer({
        id: 'city-circle-fill',
        type: 'fill',
        source: 'city-circle',
        paint: { 'fill-color': '#d7ff3e', 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'city-circle-line',
        type: 'line',
        source: 'city-circle',
        paint: { 'line-color': '#d7ff3e', 'line-width': 2.5 },
      });
      map.getCanvas().style.cursor = 'grab';
    });

    function startDrag() {
      dragging = true;
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!dragging || !e.lngLat) return;
      center = clampToBounds(e.lngLat.lat, e.lngLat.lng);
      updateCircle();
    }
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      map.dragPan.enable();
      map.getCanvas().style.cursor = 'grab';
    }

    map.on('mousedown', 'city-circle-fill', startDrag);
    map.on('touchstart', 'city-circle-fill', startDrag);
    map.on('mousemove', onMove);
    map.on('touchmove', onMove);
    map.on('mouseup', endDrag);
    map.on('touchend', endDrag);
    map.on('mouseleave', endDrag);
  }

  function wireConfirm() {
    var btn = document.getElementById('btnConfirmCity');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = 'true';
    var originalLabel = btn.textContent;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      fetch('/api/game/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'city', lat: center.lat, lng: center.lng }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btn.disabled = false;
          btn.textContent = originalLabel;
          if (data.error) throw new Error(data.error);
          if (window.PGGame) window.PGGame.beginGame(data);
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = originalLabel;
          console.error('Failed to start Select City game', err);
          alert('Could not start a game for this area. Please try again.');
        });
    });
  }

  function attachTrigger() {
    var trigger = document.getElementById('btnSelectCity');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      // The screen is unhidden by game.js's own click handler on this same
      // button (attached first, so it runs first within this same click).
      // Deferred a tick so the container has real layout dimensions before
      // Mapbox GL tries to measure it -- setTimeout rather than
      // requestAnimationFrame, since rAF is paused in backgrounded/hidden
      // tabs and this shouldn't depend on the tab being foregrounded.
      setTimeout(function () {
        buildMapUI();
        initMap();
        wireConfirm();
      }, 0);
    });
  }

  // This script loads with `defer`, so DOMContentLoaded normally hasn't
  // fired yet -- but check readyState anyway rather than assume, since the
  // event won't fire a second time for a listener registered after the fact.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachTrigger);
  } else {
    attachTrigger();
  }
})();
