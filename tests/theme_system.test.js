/**
 * Unit & Integration Tests for BOUNCE Infinite Level Colour Themes System.
 *
 * Verifies:
 * 1. Palette collection size, data validity, and coverage of requested themes.
 * 2. Deterministic level-to-theme mapping.
 * 3. Consecutive level variety and lack of immediate repetition across hundreds of levels.
 * 4. Safe handling of arbitrary high levels, zero, negative, and invalid inputs.
 * 5. ThemeManager interpolation, cloning, and getColors() output integrity.
 * 6. Visual separation and gameplay readability preservation.
 */

const test = require('node:test');
const assert = require('node:assert');

// Setup mock browser globals before requiring game.js
const elements = new Map();

class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.style = {};
    this.classList = {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {},
    };
    this.children = [];
    this.parentElement = { style: {} };
    this.listeners = new Map();
  }
  addEventListener(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }
  removeEventListener() {}
  appendChild(c) { this.children.push(c); return c; }
  querySelector() { return new MockElement(); }
  querySelectorAll() { return [new MockElement()]; }
  setAttribute() {}
  getAttribute() { return null; }
  getContext() {
    return {
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      roundRect: () => {},
      translate: () => {},
      scale: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
  }
}

function getOrCreateElement(id) {
  if (!elements.has(id)) {
    elements.set(id, new MockElement(id));
  }
  return elements.get(id);
}

global.window = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: {
    _store: {},
    getItem(k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
    clear() { this._store = {}; },
  },
  AudioContext: class {
    constructor() { this.state = 'running'; this.destination = {}; }
    createGain() { return { connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }; }
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }; }
    close() {}
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};

global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: (id) => getOrCreateElement(id),
  activeElement: { blur: () => {} },
};

global.localStorage = global.window.localStorage;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

const {
  LEVEL_THEMES,
  ThemeManager,
  getThemeIndexForLevel,
  getThemeForLevel,
  BounceGame,
} = require('../game.js');

test('1. Theme Collection Size & Palette Data Validity', () => {
  assert.ok(Array.isArray(LEVEL_THEMES), 'LEVEL_THEMES is an array');
  assert.ok(LEVEL_THEMES.length >= 16, `Theme collection has at least 16 themes (has ${LEVEL_THEMES.length})`);

  const seenNames = new Set();

  LEVEL_THEMES.forEach((theme, idx) => {
    assert.ok(typeof theme.name === 'string' && theme.name.length > 0, `Theme #${idx} has a non-empty name`);
    assert.ok(!seenNames.has(theme.name), `Theme name "${theme.name}" is unique`);
    seenNames.add(theme.name);

    // Verify all required color vectors are valid [r, g, b] in 0-255 range
    const channels = ['primary', 'secondary', 'rail', 'bodyTop', 'bodyBottom', 'bgTop', 'bgMid', 'bgBottom', 'grid', 'ambientAura'];
    channels.forEach((ch) => {
      assert.ok(Array.isArray(theme[ch]), `Theme "${theme.name}" has array for channel "${ch}"`);
      assert.strictEqual(theme[ch].length, 3, `Theme "${theme.name}" channel "${ch}" has 3 RGB values`);
      theme[ch].forEach((val, cIdx) => {
        assert.ok(
          Number.isInteger(val) && val >= 0 && val <= 255,
          `Theme "${theme.name}" channel "${ch}[${cIdx}]" is a valid RGB byte: ${val}`
        );
      });
    });
  });
});

test('2. Coverage of Required Theme Archetypes', () => {
  const themeNames = LEVEL_THEMES.map((t) => t.name.toLowerCase());

  const requiredArchetypes = [
    { label: 'icy cyan', match: (n) => n.includes('cyan') },
    { label: 'magenta and coral', match: (n) => n.includes('magenta') && n.includes('coral') },
    { label: 'acid lime', match: (n) => n.includes('lime') },
    { label: 'ultraviolet', match: (n) => n.includes('violet') },
    { label: 'electric orange', match: (n) => n.includes('orange') },
    { label: 'turquoise', match: (n) => n.includes('turquoise') },
    { label: 'crimson and ember', match: (n) => n.includes('crimson') && n.includes('ember') },
    { label: 'emerald and gold', match: (n) => n.includes('emerald') && n.includes('gold') },
    { label: 'sunset amber', match: (n) => n.includes('amber') },
    { label: 'chrome silver', match: (n) => n.includes('silver') },
  ];

  requiredArchetypes.forEach(({ label, match }) => {
    const found = themeNames.some(match);
    assert.ok(found, `Theme collection includes required archetype: "${label}"`);
  });
});

test('3. Deterministic Level-to-Theme Mapping', () => {
  // Replaying level 1 must always return the exact same theme
  const t1A = getThemeForLevel(1);
  const t1B = getThemeForLevel(1);
  assert.strictEqual(t1A.name, t1B.name, 'Replaying Level 1 returns identical theme');
  assert.deepStrictEqual(t1A.primary, t1B.primary, 'Replaying Level 1 returns identical primary color');

  // Verify across multiple distinct levels
  const testLevels = [1, 2, 5, 12, 13, 24, 25, 48, 100];
  testLevels.forEach((lvl) => {
    const run1 = getThemeForLevel(lvl);
    const run2 = getThemeForLevel(lvl);
    assert.strictEqual(run1.name, run2.name, `Level ${lvl} deterministically resolves to "${run1.name}"`);
  });
});

test('4. Variety Across Consecutive Levels (No Immediate Repetition)', () => {
  // Across 150 consecutive levels, no level should share a theme with the immediately preceding level
  for (let lvl = 1; lvl <= 150; lvl++) {
    const currentTheme = getThemeForLevel(lvl);
    const nextTheme = getThemeForLevel(lvl + 1);
    assert.notStrictEqual(
      currentTheme.name,
      nextTheme.name,
      `Consecutive levels ${lvl} and ${lvl + 1} have distinct themes ("${currentTheme.name}" vs "${nextTheme.name}")`
    );
  }

  // World 1 (Levels 1–12): all 12 levels must have completely unique themes
  const world1Themes = new Set();
  for (let lvl = 1; lvl <= 12; lvl++) {
    world1Themes.add(getThemeForLevel(lvl).name);
  }
  assert.strictEqual(world1Themes.size, 12, 'World 1 (Levels 1–12) provides 12 distinct themes with zero repetition');
});

test('5. Boundary Conditions and Arbitrary High Level Numbers', () => {
  const highLevels = [999, 1000, 10000, 500000, 10000000];
  highLevels.forEach((lvl) => {
    const idx = getThemeIndexForLevel(lvl);
    assert.ok(idx >= 0 && idx < LEVEL_THEMES.length, `High level ${lvl} index ${idx} within bounds`);
    const theme = getThemeForLevel(lvl);
    assert.ok(theme && theme.name, `High level ${lvl} has valid theme: "${theme?.name}"`);
    assert.ok(Array.isArray(theme.primary), `High level ${lvl} has valid primary color array`);
  });

  // Invalid or edge inputs
  const edgeCases = [0, -1, -99, NaN, null, undefined, 'abc'];
  edgeCases.forEach((val) => {
    const idx = getThemeIndexForLevel(val);
    assert.strictEqual(idx, 0, `Invalid level ${val} safely defaults to index 0`);
    const theme = getThemeForLevel(val);
    assert.strictEqual(theme.name, LEVEL_THEMES[0].name, `Invalid level ${val} safely defaults to Theme 0`);
  });
});

test('6. ThemeManager Interpolation & getColors() Output Integrity', () => {
  const tm = new ThemeManager();
  assert.strictEqual(tm.currentLevel, 1, 'Initial level is 1');

  // Verify getColors() contract
  const colors = tm.getColors();
  assert.ok(colors.primary.startsWith('rgb('), 'primary is a valid rgb string');
  assert.ok(colors.secondary.startsWith('rgb('), 'secondary is a valid rgb string');
  assert.ok(colors.rail.startsWith('rgb('), 'rail is a valid rgb string');
  assert.ok(colors.bodyTop.startsWith('rgb('), 'bodyTop is a valid rgb string');
  assert.ok(colors.bodyBottom.startsWith('rgb('), 'bodyBottom is a valid rgb string');

  assert.strictEqual(typeof colors.primaryAlpha, 'function', 'primaryAlpha is a callable function');
  assert.ok(colors.primaryAlpha(0.5).startsWith('rgba('), 'primaryAlpha returns rgba string');
  assert.strictEqual(typeof colors.gridAlpha, 'function', 'gridAlpha is a callable function');
  assert.ok(colors.gridAlpha(0.04).startsWith('rgba('), 'gridAlpha returns rgba string');
  assert.strictEqual(typeof colors.ambientAlpha, 'function', 'ambientAlpha is a callable function');
  assert.ok(colors.ambientAlpha(0.1).startsWith('rgba('), 'ambientAlpha returns rgba string');

  // Instant switch
  tm.setLevel(5, true);
  assert.strictEqual(tm.currentLevel, 5, 'setLevel updates currentLevel');
  const theme5 = getThemeForLevel(5);
  assert.deepStrictEqual(tm.current.primary, theme5.primary, 'Instant level switch immediately sets current primary');

  // Smooth interpolation transition
  tm.setLevel(6, false); // Target is Theme 6, current is still Theme 5
  assert.deepStrictEqual(tm.current.primary, theme5.primary, 'Current primary remains Theme 5 before update');
  tm.update(0.05); // Step forward in time
  assert.notDeepStrictEqual(tm.current.primary, theme5.primary, 'Current primary interpolated away from Theme 5');
  // Update enough to settle
  for (let i = 0; i < 60; i++) {
    tm.update(0.05);
  }
  const theme6 = getThemeForLevel(6);
  assert.deepStrictEqual(
    tm.current.primary.map(Math.round),
    theme6.primary,
    'Current primary converges onto Theme 6'
  );
});

test('7. Visual Readability & Safe Platform vs Hazard Contrast', () => {
  // Hazard spike base color in game is #ff1744 / #b70020 with caution yellow #ffcc00
  // Safe platforms in any theme must maintain high luminance contrast rails and distinct borders
  LEVEL_THEMES.forEach((theme) => {
    // Top impact rail should have sufficient brightness (max channel >= 180) for landing zone visibility
    const railMax = Math.max(...theme.rail);
    assert.ok(
      railMax >= 180,
      `Theme "${theme.name}" has bright impact rail (max channel ${railMax} >= 180)`
    );

    // Primary neon border should be vibrant (max channel >= 180)
    const primaryMax = Math.max(...theme.primary);
    assert.ok(
      primaryMax >= 180,
      `Theme "${theme.name}" has vibrant primary neon color (max channel ${primaryMax} >= 180)`
    );

    // Platform body gradient should be dark enough (<= 65) for clear contrast against the bright neon border
    const bodyTopMax = Math.max(...theme.bodyTop);
    assert.ok(
      bodyTopMax <= 65,
      `Theme "${theme.name}" platform bodyTop is dark for high border contrast (${bodyTopMax} <= 65)`
    );
  });
});
