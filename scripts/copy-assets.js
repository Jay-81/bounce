/**
 * Minimal build script to sync root game files into www/ for Capacitor bundling.
 * Keeps root game files as the single source of truth without any frontend framework.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'www');

// Ensure www exists and is clean
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Core files
const filesToCopy = ['index.html', 'style.css', 'game.js'];
for (const file of filesToCopy) {
  const src = path.join(rootDir, file);
  const dest = path.join(outDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// Asset and font directories
const dirsToCopy = ['assets', 'fonts'];
for (const dir of dirsToCopy) {
  const src = path.join(rootDir, dir);
  const dest = path.join(outDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

console.log('✓ Successfully prepared www/ directory for Capacitor.');
