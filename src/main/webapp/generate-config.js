#!/usr/bin/env node

/**
 * Generate runtime configuration file for Angular app.
 * Reads WIREMOCK_BACKEND (one or more URLs separated by ;).
 *
 * Usage:
 *   node generate-config.js                          → defaults (/__admin)
 *   WIREMOCK_BACKEND=http://localhost:8080 npm start
 *   WIREMOCK_BACKEND="http://host1:8080;http://host2:8080" npm start
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Charge .env.local en priorité (non commité), puis .env comme fallback
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const wiremockBackend = process.env.WIREMOCK_BACKEND || '';

const config = {
  wiremockApiUrl: '/__admin',
  wiremockBackend: wiremockBackend
};

// Ensure public directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write config.json
const configPath = path.join(publicDir, 'config.json');
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`✅ config.json generated at ${configPath}`);
console.log(`   WIREMOCK_BACKEND: ${wiremockBackend || '(not set)'}`);
