const config = require('./jest-e2e.config');
// scripts/test-local.mjs prepara las migraciones sobre PGlite en memoria.
module.exports = { ...config, globalSetup: undefined, testTimeout: 60000 };
