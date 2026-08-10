// Client-side settings persistence (localStorage), same pattern as
// public/js/stats.js. v1 is just a sound effects on/off toggle.
(function () {
  'use strict';

  var STORAGE_KEY = 'valueguessr:settings:v1';

  function defaults() {
    return { soundEnabled: true };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function save(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      /* localStorage unavailable (private mode / disabled) -- ignore */
    }
  }

  function isSoundEnabled() {
    return load().soundEnabled;
  }

  function setSoundEnabled(enabled) {
    var settings = load();
    settings.soundEnabled = !!enabled;
    save(settings);
  }

  window.PGSettings = {
    isSoundEnabled: isSoundEnabled,
    setSoundEnabled: setSoundEnabled,
  };
})();
