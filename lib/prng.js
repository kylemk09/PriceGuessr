// Deterministic PRNG helpers shared by listing generation, the daily-challenge
// shuffle, and procedural house-image rendering -- same algorithm everywhere
// so "seed X" always produces the same sequence across all three call sites.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

function rngFromSeedString(str) {
  return mulberry32(hashString(str));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

module.exports = { mulberry32, hashString, rngFromSeedString, pick, randInt, randRange };
