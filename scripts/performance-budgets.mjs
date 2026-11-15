/**
 * One source of truth for critical-path transfer and source-size budgets.
 * These figures represent uncompressed source bytes; transport size is reported
 * independently because Brotli/HTTP caching can vary by browser and server.
 */
export const PERFORMANCE_BUDGETS = Object.freeze({
  "index.html":11000,
  "styles.css":19000,
  "app.js":3000,
  "assets/shield-logo-transparent.svg":136000,
  "assets/ui-icons.svg":3000,
  "private/private.css":112000,
  "private/locker-motion.js":3500,
  "private/vault-entry.js":14000
});
