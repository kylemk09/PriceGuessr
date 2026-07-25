// Optional MySQL connection pool. Only active once connection details are
// available as environment variables (i.e. in production, where Hostinger's
// MySQL database is available) -- game/leaderboard.js and game/playCounter.js
// both fall back to local file storage when this isn't configured, so
// `npm start` still works with zero setup for local development.
//
// Why this exists at all: this app's `data/runtime/` files are gitignored
// on purpose (they're not source code), but that also means a fresh git
// deploy has no way to know about them -- every redeploy starts with an
// empty `data/runtime/`, silently resetting the leaderboard and play
// counter. A real database, external to the deployed codebase, is the only
// thing that actually survives a redeploy.
//
// Hostinger auto-detects a MySQL database created for this site and
// re-injects its own DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME on every
// deploy, overriding anything typed into those exact names (confirmed: even
// deleting and recreating them under a different name, VG_DB_*, still saw
// the plain DB_* set reappear). Rather than fight that, we read whichever
// set is actually present -- VG_DB_* first if someone manages to make it
// stick, otherwise the auto-injected DB_* -- and fix the one real problem
// with the auto-injected values in code: "localhost" can resolve to the
// IPv6 loopback (::1), which most MySQL grants don't recognize even with
// the correct password, producing a confusing "Access denied" error. We
// rewrite it to the IPv4 loopback address here, which needs no DNS
// resolution at all and sidesteps the ambiguity entirely.

const mysql = require('mysql2/promise');

function envHost() { return process.env.VG_DB_HOST || process.env.DB_HOST; }
function envPort() { return process.env.VG_DB_PORT || process.env.DB_PORT; }
function envUser() { return process.env.VG_DB_USER || process.env.DB_USER; }
function envPassword() { return process.env.VG_DB_PASSWORD || process.env.DB_PASSWORD; }
function envName() { return process.env.VG_DB_NAME || process.env.DB_NAME; }

let pool = null;

function isConfigured() {
  return !!envHost();
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) {
    const rawHost = envHost();
    const host = rawHost === 'localhost' ? '127.0.0.1' : rawHost;
    pool = mysql.createPool({
      host,
      port: envPort() ? Number(envPort()) : 3306,
      user: envUser(),
      password: envPassword(),
      database: envName(),
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

async function initSchema() {
  const db = getPool();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS leaderboard_entries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mode VARCHAR(16) NOT NULL,
      daily_key VARCHAR(16) NULL,
      name VARCHAR(20) NOT NULL,
      score INT NOT NULL,
      streak INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mode_daily_score (mode, daily_key, score)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS games_played (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('MySQL schema ready (leaderboard_entries, games_played).');
}

module.exports = { isConfigured, getPool, initSchema };
