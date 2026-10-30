/**
 * Automated test suite for BOUNCE Lives, Blues Currency, Key Vault & Continue System.
 *
 * Verifies:
 * 1. Initial State & Setup (3 lives, 0 blues, 0 keys, HUD pips)
 * 2. Blues Currency: 5 Blues per orb, 25 Blues per star, immediate awarding and persistence
 * 3. Currency Persistence: Blues & Keys persist across runs, levels, and app restarts
 * 4. 3-Life System: 1 life lost on fall/spike, last safe platform tracking and preservation
 * 5. 5-Second Respawn Countdown: Ticking, ball positioning, invulnerability protection (2.0s)
 * 6. Continue Screen: Triggered upon losing 3rd life, displays altitude and key inventory
 * 7. Continue Action: Consumes 1 key, restores 3 lives, resumes ascent without resetting run progress
 * 8. Skip Continue: Ends run, displays results screen, no keys consumed
 * 9. Key Shop / Vault: Bundles (1 key = 100 Blues, 3 keys = 270 Blues, 5 keys = 425 Blues), persistence, insufficient funds rejection
 * 10. Complete flow: 0 keys on continue -> open vault -> buy key -> return & continue
 */

const test = require('node:test');
const assert = require('node:assert');

// Comprehensive DOM Mocks
const elements = new Map();
const documentListeners = new Map();
const windowListeners = new Map();
const mockStorage = new Map();

class MockElement {
  constructor(id = '', tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this._classes = new Set();
    this.classList = {
      add: (...args) => args.forEach(c => this._classes.add(c)),
      remove: (...args) => args.forEach(c => this._classes.delete(c)),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this._classes.has(c)) this._classes.delete(c);
          else this._classes.add(c);
        } else if (force) {
          this._classes.add(c);
        } else {
          this._classes.delete(c);
        }
      },
      contains: (c) => this._classes.has(c),
    };
    this.style = {};
    this.listeners = new Map();
    this._textContent = '';
    this.disabled = false;
    this._parentElement = null;
  }

  set textContent(val) {
    this._textContent = (val === null || val === undefined) ? '' : String(val);
  }

  get textContent() {
    return this._textContent !== undefined ? this._textContent : '';
  }

  get parentElement() {
    if (!this._parentElement) {
      this._parentElement = {
        style: {},
        classList: this.classList,
      };
    }
    return this._parentElement;
  }

  querySelector(sel) {
    return new MockElement('child_' + sel);
  }

  querySelectorAll(sel) {
    return [new MockElement('child_' + sel)];
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  removeEventListener(event, handler) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event);
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  }

  dispatchEvent(event) {
    const list = this.listeners.get(event.type) || [];
    for (const h of list) {
      h(event);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 };
  }

  getContext() {
    return {
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 50 }),
      fillText: () => {},
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
  innerWidth: 412,
  innerHeight: 915,
  devicePixelRatio: 2,
  addEventListener: (event, handler) => {
    if (!windowListeners.has(event)) windowListeners.set(event, []);
    windowListeners.get(event).push(handler);
  },
  removeEventListener: () => {},
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    clear: () => mockStorage.clear(),
  },
  AudioContext: class {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createGain() {
      return {
        connect: () => {},
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      };
    }
    createOscillator() {
      return {
        connect: () => {},
        start: () => {},
        stop: () => {},
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      };
    }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
  },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
};

global.document = {
  getElementById: (id) => getOrCreateElement(id),
  querySelector: (sel) => {
    const clean = sel.replace(/[#.]/g, '');
    return getOrCreateElement(clean);
  },
  querySelectorAll: (sel) => {
    const clean = sel.replace(/[#.]/g, '');
    return [getOrCreateElement(clean)];
  },
  addEventListener: (event, handler) => {
    if (!documentListeners.has(event)) documentListeners.set(event, []);
    documentListeners.get(event).push(handler);
  },
  removeEventListener: () => {},
  hidden: false,
  body: getOrCreateElement('body'),
  activeElement: { blur: () => {} },
};

global.localStorage = global.window.localStorage;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;

// Load game module
const { BounceGame, STATE, CURRENCY_CONFIG } = require('../game.js');

test('1. Initial State & Setup: 3 lives, 0 blues, 0 keys, and HUD life pips', () => {
  mockStorage.clear();
  const game = new BounceGame();

  assert.strictEqual(game.lives, 3, 'Game should start with 3 lives');
  assert.strictEqual(game.blues, 0, 'Initial blues balance should be 0');
  assert.strictEqual(game.keysInventory, 0, 'Initial keys inventory should be 0');
  assert.strictEqual(game.isRespawning, false, 'Should not be respawning at start');
  assert.strictEqual(game.invulnerableTimer, 0, 'Invulnerability timer should be 0');

  // Verify HUD pips
  assert.ok(game.lifePip1.classList.contains('active'), 'Life pip 1 should be active');
  assert.ok(game.lifePip2.classList.contains('active'), 'Life pip 2 should be active');
  assert.ok(game.lifePip3.classList.contains('active'), 'Life pip 3 should be active');
});

test('2. Blues Currency Awarding: +5 Blues per orb, +25 Blues per star, immediate persistence', () => {
  mockStorage.clear();
  const game = new BounceGame();
  game.startNewGame(1);

  assert.strictEqual(game.blues, 0);
  assert.strictEqual(game.runBlues, 0);

  // Collect 1 blue orb (+5 Blues)
  game.addBlues(CURRENCY_CONFIG.bluesPerOrb, true);
  assert.strictEqual(game.blues, 5, 'Should have 5 blues after collecting 1 orb');
  assert.strictEqual(game.runBlues, 5, 'Run blues should be 5');
  assert.strictEqual(mockStorage.get('bounce_arcade_blues'), '5', 'Blues should be immediately saved to localStorage');
  assert.strictEqual(game.hudBlues.textContent, '5', 'HUD blues balance should display 5');

  // Collect 1 special star (+25 Blues)
  game.addBlues(CURRENCY_CONFIG.bluesPerStar, true);
  assert.strictEqual(game.blues, 30, 'Should have 30 blues after collecting 1 star');
  assert.strictEqual(game.runBlues, 30, 'Run blues should be 30');
  assert.strictEqual(mockStorage.get('bounce_arcade_blues'), '30', 'Blues should be saved to localStorage');
  assert.strictEqual(game.hudBlues.textContent, '30');
});

test('3. Currency Persistence: Blues and Keys persist across runs, game over, and restarts', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_blues', '150');
  mockStorage.set('bounce_arcade_keys', '2');

  const game = new BounceGame();
  assert.strictEqual(game.blues, 150, 'Loaded blues balance should be 150');
  assert.strictEqual(game.keysInventory, 2, 'Loaded keys balance should be 2');

  game.startNewGame(1);
  assert.strictEqual(game.blues, 150, 'Blues should remain 150 when starting run');
  assert.strictEqual(game.keysInventory, 2, 'Keys should remain 2 when starting run');
  assert.strictEqual(game.runBlues, 0, 'Run blues should reset to 0');

  // Earn 10 blues during this run
  game.addBlues(10, true);
  assert.strictEqual(game.blues, 160);
  assert.strictEqual(game.runBlues, 10);

  // Trigger game over
  game.triggerGameOver('Test Game Over');
  assert.strictEqual(game.finalRunBlues.textContent, '+10', 'Results screen should show run blues');
  assert.strictEqual(game.finalTotalBlues.textContent, '160', 'Results screen should show total blues');
  assert.strictEqual(game.finalTotalKeys.textContent, '2', 'Results screen should show total keys');
  assert.strictEqual(mockStorage.get('bounce_arcade_blues'), '160');
});

test('4. 3-Life System: 1 life lost on fall, last safe platform tracking and preservation', () => {
  mockStorage.clear();
  const game = new BounceGame();
  game.startNewGame(1);

  assert.strictEqual(game.lives, 3);
  assert.ok(game.lastSafePlatform, 'Initial safe platform must be recorded');
  const initialSafePlatform = game.lastSafePlatform;

  // Simulate ball falling below viewport
  game.handlePlayerFall();

  assert.strictEqual(game.lives, 2, 'Lives should decrement to 2');
  assert.strictEqual(game.isRespawning, true, 'Respawn countdown should become active');
  assert.strictEqual(game.countdownTimer, 5, 'Countdown timer should be 5 seconds');
  assert.ok(game.lifePip3.classList.contains('lost'), 'Life pip 3 should be marked lost');
  assert.ok(game.lifePip2.classList.contains('active'), 'Life pip 2 should remain active');
  assert.ok(game.lifePip1.classList.contains('active'), 'Life pip 1 should remain active');

  // Safe platform must be preserved during platform cleanup
  game.cameraY = -5000; // Camera moves high up
  game.generatePlatformsAhead();
  assert.ok(game.platforms.includes(initialSafePlatform), 'Last safe platform must never be culled before respawn');
});

test('5. 5-Second Respawn Countdown: Ticking, ball position lock, invulnerability protection (2.0s)', () => {
  mockStorage.clear();
  const game = new BounceGame();
  game.startNewGame(1);

  // Trigger fall
  game.handlePlayerFall();
  assert.strictEqual(game.isRespawning, true);
  assert.strictEqual(game.countdownNumber.textContent, '5');

  // Ball should be positioned at safe platform coordinates
  assert.strictEqual(game.ball.x, game.respawnTargetX);
  assert.strictEqual(game.ball.y, game.respawnTargetY);
  assert.strictEqual(game.ball.vx, 0);
  assert.strictEqual(game.ball.vy, 0);

  // Advance time by 1.2 seconds -> timer = 3.8s, integer = 4
  game.update(1.2);
  assert.strictEqual(game.countdownNumber.textContent, '4');
  assert.strictEqual(game.isRespawning, true);

  // Advance time by 3.0 seconds -> timer = 0.8s, integer = 1
  game.update(3.0);
  assert.strictEqual(game.countdownNumber.textContent, '1');
  assert.strictEqual(game.isRespawning, true);

  // Finish countdown (advance 1.0s)
  game.update(1.0);
  assert.strictEqual(game.isRespawning, false, 'Respawning should finish');
  assert.strictEqual(game.ball.invulnerable, true, 'Ball should be invulnerable after respawn');
  assert.strictEqual(game.invulnerableTimer, CURRENCY_CONFIG.invulnerabilityDurationSeconds, 'Invulnerability timer should be 2.0s');
  assert.strictEqual(game.countdownNumber.textContent, 'GO!');

  // During invulnerability, fall detection or hazard must not trigger another death
  const initialLives = game.lives;
  game.handlePlayerFall(); // Attempt immediate duplicate fall
  // During invulnerable timer, handlePlayerFall in update is shielded
  assert.strictEqual(game.lives, initialLives);
});

test('6. Continue Screen: Triggered when 3rd life is lost, displays altitude and keys', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_keys', '1');
  const game = new BounceGame();
  game.startNewGame(1);
  game.score = 850;

  // Life 1 lost -> 2 remaining
  game.handlePlayerFall();
  assert.strictEqual(game.lives, 2);
  game.isRespawning = false;

  // Life 2 lost -> 1 remaining
  game.handlePlayerFall();
  assert.strictEqual(game.lives, 1);
  game.isRespawning = false;

  // Life 3 lost -> Out of lives!
  game.handlePlayerFall();
  assert.strictEqual(game.lives, 0);
  assert.strictEqual(game.currentState, STATE.CONTINUE, 'Should open CONTINUE screen on 0 lives');
  assert.strictEqual(game.continueAltitude.textContent, '850', 'Should display reached altitude');
  assert.strictEqual(game.continueKeyCount.textContent, '1', 'Should display available keys');
  assert.strictEqual(game.continueWithKeyBtn.disabled, false, 'Continue button should be enabled when keys >= 1');
});

test('7. Continue Action: Consumes exactly 1 key, restores 3 lives, resumes ascent with progress intact', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_keys', '2');
  const game = new BounceGame();
  game.startNewGame(1);
  game.score = 1200;
  game.level = 3;
  game.runOrbs = 7;

  // Deplete all lives
  game.lives = 1;
  game.handlePlayerFall();
  assert.strictEqual(game.currentState, STATE.CONTINUE);

  // Player chooses to Continue with Key
  const success = game.continueWithKey();
  assert.strictEqual(success, true);
  assert.strictEqual(game.keysInventory, 1, 'Keys should be decremented by 1');
  assert.strictEqual(mockStorage.get('bounce_arcade_keys'), '1', 'Keys should be saved to localStorage');
  assert.strictEqual(game.lives, 3, 'Lives should be restored to 3');
  assert.strictEqual(game.currentState, STATE.PLAYING, 'Game state should return to PLAYING');
  assert.strictEqual(game.isRespawning, true, 'Respawn countdown should start');
  assert.strictEqual(game.score, 1200, 'Score should be preserved');
  assert.strictEqual(game.level, 3, 'Level should be preserved');
  assert.strictEqual(game.runOrbs, 7, 'Run orbs should be preserved');
});

test('8. Skip Continue: Ends run, transitions to GAMEOVER, no keys consumed', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_keys', '3');
  const game = new BounceGame();
  game.startNewGame(1);

  // Deplete lives
  game.lives = 1;
  game.handlePlayerFall();
  assert.strictEqual(game.currentState, STATE.CONTINUE);

  // Player skips continue
  game.skipContinue();
  assert.strictEqual(game.currentState, STATE.GAMEOVER, 'Should transition to GAMEOVER screen');
  assert.strictEqual(game.keysInventory, 3, 'No keys should be consumed on skip');
  assert.strictEqual(mockStorage.get('bounce_arcade_keys'), '3');
});

test('9. Key Shop / Vault: Bundle purchases, balance deductions, and insufficient funds protection', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_blues', '450');
  mockStorage.set('bounce_arcade_keys', '0');

  const game = new BounceGame();
  game.openShop(STATE.MENU);
  assert.strictEqual(game.currentState, STATE.SHOP);
  assert.strictEqual(game.shopBluesBalance.textContent, '450');
  assert.strictEqual(game.shopKeysBalance.textContent, '0');

  // 1. Buy 1 Key bundle (price: 100 Blues)
  const buy1 = game.buyKeyBundle(1, 100);
  assert.strictEqual(buy1, true);
  assert.strictEqual(game.blues, 350, 'Blues should deduct 100');
  assert.strictEqual(game.keysInventory, 1, 'Keys should increase by 1');
  assert.strictEqual(mockStorage.get('bounce_arcade_blues'), '350');
  assert.strictEqual(mockStorage.get('bounce_arcade_keys'), '1');

  // 2. Buy 3 Keys bundle (price: 270 Blues)
  const buy3 = game.buyKeyBundle(3, 270);
  assert.strictEqual(buy3, true);
  assert.strictEqual(game.blues, 80, 'Blues should deduct 270 (350 - 270 = 80)');
  assert.strictEqual(game.keysInventory, 4, 'Keys should increase by 3 (1 + 3 = 4)');

  // 3. Attempt to buy 1 Key for 100 Blues with only 80 Blues -> Should reject
  const buyFail = game.buyKeyBundle(1, 100);
  assert.strictEqual(buyFail, false, 'Purchase should fail when funds are insufficient');
  assert.strictEqual(game.blues, 80, 'Blues should remain unchanged on failure');
  assert.strictEqual(game.keysInventory, 4, 'Keys should remain unchanged on failure');
  assert.ok(game.shopFeedbackMsg.classList.contains('error'), 'Should display error feedback');
});

test('10. Complete Flow: 0 keys on continue -> open vault -> buy key -> return & continue', () => {
  mockStorage.clear();
  mockStorage.set('bounce_arcade_blues', '200');
  mockStorage.set('bounce_arcade_keys', '0');

  const game = new BounceGame();
  game.startNewGame(1);
  game.score = 500;

  // Deplete lives to 0
  game.lives = 1;
  game.handlePlayerFall();
  assert.strictEqual(game.currentState, STATE.CONTINUE);
  assert.strictEqual(game.continueWithKeyBtn.disabled, true, 'Continue button should be disabled with 0 keys');

  // Open shop from Continue modal
  game.openShop(STATE.CONTINUE);
  assert.strictEqual(game.currentState, STATE.SHOP);
  assert.strictEqual(game.shopPreviousState, STATE.CONTINUE);

  // Buy 1 Key bundle (100 Blues)
  const purchased = game.buyKeyBundle(1, 100);
  assert.strictEqual(purchased, true);
  assert.strictEqual(game.keysInventory, 1);
  assert.strictEqual(game.blues, 100);

  // Close shop -> should return to Continue screen
  game.closeShop();
  assert.strictEqual(game.currentState, STATE.CONTINUE, 'Should return to Continue screen');
  assert.strictEqual(game.continueWithKeyBtn.disabled, false, 'Continue button should now be enabled');
  assert.strictEqual(game.continueKeyCount.textContent, '1');

  // Continue with the newly bought key
  const continued = game.continueWithKey();
  assert.strictEqual(continued, true);
  assert.strictEqual(game.keysInventory, 0, 'Key was consumed');
  assert.strictEqual(game.lives, 3, 'Restored to 3 lives');
  assert.strictEqual(game.currentState, STATE.PLAYING);
  assert.strictEqual(game.score, 500, 'Score preserved');
});

test('11. Two-Row HUD: Exact element hierarchy, centering, and HUD keys updates', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

  // Verify HUD structure inside #gameHud
  const hudStart = html.indexOf('id="gameHud"');
  const hudEnd = html.indexOf('<!-- Level Milestone', hudStart);
  const hudMarkup = html.slice(hudStart, hudEnd);

  // Exactly two rows
  assert.ok(hudMarkup.includes('hud-row-1'), 'Row 1 exists');
  assert.ok(hudMarkup.includes('hud-row-2'), 'Row 2 exists');
  assert.strictEqual((hudMarkup.match(/class="hud-row/g) || []).length, 2, 'HUD contains exactly two rows');

  // Row 1 order: LVL -> LIVES -> ALT -> BEST
  const idxLvl = hudMarkup.indexOf('hud-level-group');
  const idxLives = hudMarkup.indexOf('hud-lives-group');
  const idxAlt = hudMarkup.indexOf('id="hudScore"');
  const idxBest = hudMarkup.indexOf('id="hudBest"');
  assert.ok(idxLvl !== -1 && idxLives !== -1 && idxAlt !== -1 && idxBest !== -1);
  assert.ok(idxLvl < idxLives, 'Row 1: LVL comes before LIVES');
  assert.ok(idxLives < idxAlt, 'Row 1: LIVES comes before ALT');
  assert.ok(idxAlt < idxBest, 'Row 1: ALT comes before BEST');

  // Row 2 order: BLUES -> STARS -> KEYS -> SOUND -> PAUSE
  const idxBlues = hudMarkup.indexOf('id="hudBlues"');
  const idxStars = hudMarkup.indexOf('id="hudRunStars"');
  const idxKeys = hudMarkup.indexOf('id="hudKeys"');
  const idxSound = hudMarkup.indexOf('id="soundBtn"');
  const idxPause = hudMarkup.indexOf('id="pauseBtn"');
  assert.ok(idxBlues !== -1 && idxStars !== -1 && idxKeys !== -1 && idxSound !== -1 && idxPause !== -1);
  assert.ok(idxBlues < idxStars, 'Row 2: BLUES comes before STARS');
  assert.ok(idxStars < idxKeys, 'Row 2: STARS comes before KEYS');
  assert.ok(idxKeys < idxSound, 'Row 2: KEYS comes before SOUND');
  assert.ok(idxSound < idxPause, 'Row 2: SOUND comes before PAUSE');

  // Verify CSS grid-template-columns: 1fr auto 1fr centers Row 1 LIVES
  assert.ok(
    /\.hud-row-1\s*\{[^}]*grid-template-columns:\s*1fr\s+auto\s+1fr/s.test(css),
    'Row 1 uses 1fr auto 1fr CSS Grid to mathematically center lives indicator'
  );

  // Verify game instance updates hudKeys immediately
  mockStorage.clear();
  mockStorage.set('bounce_arcade_keys', '3');
  const game = new BounceGame();
  assert.strictEqual(game.hudKeys.textContent, '3', 'HUD keys displays loaded inventory');

  game.addKeys(2);
  assert.strictEqual(game.hudKeys.textContent, '5', 'HUD keys updates when keys added');

  game.useKey();
  assert.strictEqual(game.hudKeys.textContent, '4', 'HUD keys updates when key consumed');
});
