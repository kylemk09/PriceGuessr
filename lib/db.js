// Optional MySQL connection pool. Only active when VG_DB_HOST is set as an
// environment variable (i.e. in production, where Hostinger's MySQL
// database is available) -- game/leaderboard.js and game/playCounter.js
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
// Deliberately namespaced env var names (VG_DB_* rather than the more
// generic DB_HOST/DB_USER/etc.) -- some hosts auto-detect and silently
// overwrite "well-known" database env var names when a database is linked
// to the app, which fought us here on plain DB_HOST reverting to
// "localhost" on every redeploy no matter what was typed in.

const mysql = require('mysql2/promise');

let pool = null;

function isConfigured() {
  return !!process.env.VG_DB_HOST;
}

function getPool() {
  if (!isConfigured()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.VG_DB_HOST,
      port: process.env.VG_DB_PORT ? Number(process.env.VG_DB_PORT) : 3306,
      user: process.env.VG_DB_USER,
      password: process.env.VG_DB_PASSWORD,
      database: process.env.VG_DB_NAME,
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
